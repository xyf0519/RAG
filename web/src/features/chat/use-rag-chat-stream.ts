"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readNdjsonStream } from "@/shared/lib/ndjson";
import { createId } from "@/shared/lib/utils";
import type {
  ChatErrorPayload,
  ChatFeedback,
  ChatFinalPayload,
  ChatMessage,
  ChatSessionSummary,
  ChatStatusPayload,
  KnowledgeBase,
  Source,
} from "@/shared/types/chat";

const STORAGE_KEY = "xyfrag.chat.v1";
const SESSION_KEY = "xyfrag.session.v1";
const SESSIONS_KEY = "xyfrag.sessions.v1";

type StreamStatus = "idle" | "streaming" | "error";

export function useRagChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [events, setEvents] = useState<ChatStatusPayload[]>([]);
  const [activeSources, setActiveSources] = useState<Source[]>([]);
  const [activeFinal, setActiveFinal] = useState<ChatFinalPayload | null>(null);
  const [lastError, setLastError] = useState<ChatErrorPayload | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [lastKnowledgeBase, setLastKnowledgeBase] = useState<Pick<KnowledgeBase, "id" | "name"> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedSession = window.localStorage.getItem(SESSION_KEY);
    const nextSession = storedSession || createId("session");
    setSessionId(nextSession);
    window.localStorage.setItem(SESSION_KEY, nextSession);

    const storedMessages = window.localStorage.getItem(`${STORAGE_KEY}.${nextSession}`);
    if (storedMessages) {
      try {
        setMessages(JSON.parse(storedMessages) as ChatMessage[]);
      } catch {
        window.localStorage.removeItem(`${STORAGE_KEY}.${nextSession}`);
      }
    } else {
      const legacyMessages = window.localStorage.getItem(STORAGE_KEY);
      if (legacyMessages) {
        try {
          setMessages(JSON.parse(legacyMessages) as ChatMessage[]);
          window.localStorage.setItem(`${STORAGE_KEY}.${nextSession}`, legacyMessages);
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    }

    const storedSessions = window.localStorage.getItem(SESSIONS_KEY);
    if (storedSessions) {
      try {
        setSessions(JSON.parse(storedSessions) as ChatSessionSummary[]);
      } catch {
        window.localStorage.removeItem(SESSIONS_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const nextMessages = messages.slice(-40);
    window.localStorage.setItem(`${STORAGE_KEY}.${sessionId}`, JSON.stringify(nextMessages));
    if (!nextMessages.length) {
      return;
    }

    const nextSummary = buildSessionSummary(sessionId, nextMessages);
    setSessions((current) => {
      const withoutCurrent = current.filter((session) => session.id !== sessionId);
      const nextSessions = [nextSummary, ...withoutCurrent]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 24);
      window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(nextSessions));
      return nextSessions;
    });
  }, [messages, sessionId]);

  const sendMessage = useCallback(
    async (query: string, knowledgeBase?: Pick<KnowledgeBase, "id" | "name">) => {
      const trimmed = query.trim();
      if (!trimmed || status === "streaming") {
        return;
      }

      const userMessage: ChatMessage = {
        id: createId("user"),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
        knowledgeBaseId: knowledgeBase?.id,
        knowledgeBaseName: knowledgeBase?.name,
      };
      const assistantId = createId("assistant");
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        knowledgeBaseId: knowledgeBase?.id,
        knowledgeBaseName: knowledgeBase?.name,
      };

      setLastQuery(trimmed);
      setLastKnowledgeBase(knowledgeBase ?? null);
      setLastError(null);
      setActiveFinal(null);
      setActiveSources([]);
      setEvents([]);
      setStatus("streaming");
      setMessages((current) => [...current, userMessage, assistantMessage]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            session_id: sessionId || undefined,
            knowledge_base_id: knowledgeBase?.id,
          }),
          signal: controller.signal,
        });

        if (!response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        let streamedText = "";
        for await (const event of readNdjsonStream(response.body)) {
          if (event.type === "status") {
            setEvents((current) => [...current, event.payload].slice(-8));
          }

          if (event.type === "delta") {
            streamedText += event.payload.text;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: streamedText }
                  : message,
              ),
            );
          }

          if (event.type === "error") {
            setLastError(event.payload);
            setStatus("error");
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId && !message.content
                  ? { ...message, content: event.payload.message, errorCode: event.payload.code }
                  : message,
              ),
            );
          }

          if (event.type === "final") {
            setActiveFinal(event.payload);
            setActiveSources(event.payload.sources);
            if (sessionId && event.payload.session_id !== sessionId) {
              window.localStorage.removeItem(`${STORAGE_KEY}.${sessionId}`);
              setSessions((current) => {
                const nextSessions = current.filter((session) => session.id !== sessionId);
                window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(nextSessions));
                return nextSessions;
              });
            }
            setSessionId(event.payload.session_id);
            window.localStorage.setItem(SESSION_KEY, event.payload.session_id);
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: event.payload.answer,
                      sources: event.payload.sources,
                      boundary: event.payload.boundary,
                      rewrittenQuery: event.payload.rewritten_query,
                      timings: event.payload.timings,
                      errorCode: event.payload.error_code,
                      knowledgeBaseId: event.payload.knowledge_base_id ?? knowledgeBase?.id,
                      knowledgeBaseName: knowledgeBase?.name,
                    }
                  : message,
              ),
            );
          }
        }

        setStatus("idle");
      } catch (error) {
        if (controller.signal.aborted) {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId && !message.content
                ? { ...message, content: "已停止生成。" }
                : message,
            ),
          );
          setStatus("idle");
          return;
        }

        const message = error instanceof Error ? error.message : "请求失败";
        setLastError({
          code: "BACKEND_UNAVAILABLE",
          message,
          retryable: true,
        });
        setStatus("error");
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId ? { ...item, content: "请求失败，请重试。" } : item,
          ),
        );
      } finally {
        abortRef.current = null;
      }
    },
    [sessionId, status],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    if (lastQuery) {
      void sendMessage(lastQuery, lastKnowledgeBase ?? undefined);
    }
  }, [lastKnowledgeBase, lastQuery, sendMessage]);

  const newSession = useCallback(() => {
    abortRef.current?.abort();
    const nextSession = createId("session");
    setSessionId(nextSession);
    setMessages([]);
    setEvents([]);
    setActiveSources([]);
    setActiveFinal(null);
    setLastError(null);
    setStatus("idle");
    window.localStorage.setItem(SESSION_KEY, nextSession);
  }, []);

  const openSession = useCallback(
    (nextSessionId: string) => {
      if (nextSessionId === sessionId) {
        return;
      }

      abortRef.current?.abort();
      const storedMessages = window.localStorage.getItem(`${STORAGE_KEY}.${nextSessionId}`);
      setSessionId(nextSessionId);
      try {
        setMessages(storedMessages ? (JSON.parse(storedMessages) as ChatMessage[]) : []);
      } catch {
        window.localStorage.removeItem(`${STORAGE_KEY}.${nextSessionId}`);
        setMessages([]);
      }
      setEvents([]);
      setActiveSources([]);
      setActiveFinal(null);
      setLastError(null);
      setStatus("idle");
      window.localStorage.setItem(SESSION_KEY, nextSessionId);
    },
    [sessionId],
  );

  const updateMessageFeedback = useCallback(
    (messageId: string, feedback: ChatFeedback | null) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                feedback: feedback ?? undefined,
              }
            : message,
        ),
      );
    },
    [],
  );

  const toggleFavorite = useCallback((messageId: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              favorite: !message.favorite,
            }
          : message,
      ),
    );
  }, []);

  const latestAssistant = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );

  return {
    messages,
    sessionId,
    sessions,
    status,
    events,
    activeSources,
    activeFinal,
    lastError,
    latestAssistant,
    sendMessage,
    stop,
    retry,
    newSession,
    openSession,
    updateMessageFeedback,
    toggleFavorite,
  };
}

function buildSessionSummary(sessionId: string, messages: ChatMessage[]): ChatSessionSummary {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const updatedAt = Math.max(...messages.map((message) => message.createdAt));
  const sourceCount = assistantMessages.reduce(
    (total, message) => total + (message.sources?.length ?? 0),
    0,
  );

  return {
    id: sessionId,
    title: firstUserMessage?.content || "新的知识库问答",
    knowledgeBaseId: firstUserMessage?.knowledgeBaseId,
    knowledgeBaseName: firstUserMessage?.knowledgeBaseName,
    createdAt: messages[0]?.createdAt ?? Date.now(),
    updatedAt,
    turnCount: messages.filter((message) => message.role === "user").length,
    sourceCount,
    hasFeedback: assistantMessages.some((message) => Boolean(message.feedback)),
  };
}
