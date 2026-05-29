"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readNdjsonStream } from "@/shared/lib/ndjson";
import { createId } from "@/shared/lib/utils";
import type {
  ChatErrorPayload,
  ChatFinalPayload,
  ChatMessage,
  ChatStatusPayload,
  Source,
} from "@/shared/types/chat";

const STORAGE_KEY = "xyfrag.chat.v1";
const SESSION_KEY = "xyfrag.session.v1";

type StreamStatus = "idle" | "streaming" | "error";

export function useRagChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [events, setEvents] = useState<ChatStatusPayload[]>([]);
  const [activeSources, setActiveSources] = useState<Source[]>([]);
  const [activeFinal, setActiveFinal] = useState<ChatFinalPayload | null>(null);
  const [lastError, setLastError] = useState<ChatErrorPayload | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedSession = window.localStorage.getItem(SESSION_KEY);
    const nextSession = storedSession || createId("session");
    setSessionId(nextSession);
    window.localStorage.setItem(SESSION_KEY, nextSession);

    const storedMessages = window.localStorage.getItem(STORAGE_KEY);
    if (storedMessages) {
      try {
        setMessages(JSON.parse(storedMessages) as ChatMessage[]);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
  }, [messages]);

  const sendMessage = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || status === "streaming") {
        return;
      }

      const userMessage: ChatMessage = {
        id: createId("user"),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      };
      const assistantId = createId("assistant");
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      };

      setLastQuery(trimmed);
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
          body: JSON.stringify({ query: trimmed, session_id: sessionId || undefined }),
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
      void sendMessage(lastQuery);
    }
  }, [lastQuery, sendMessage]);

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
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const latestAssistant = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );

  return {
    messages,
    sessionId,
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
  };
}
