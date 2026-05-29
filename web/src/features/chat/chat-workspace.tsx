"use client";

import {
  Activity,
  CheckCircle2,
  Copy,
  FileText,
  Gauge,
  HeartPulse,
  Loader2,
  MessageSquareText,
  PanelRight,
  RefreshCw,
  RotateCcw,
  Send,
  Square,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useRagChatStream } from "@/features/chat/use-rag-chat-stream";
import { cn, formatSeconds } from "@/shared/lib/utils";
import type { BackendHealth, ChatMessage, ChatStatusPayload, Source } from "@/shared/types/chat";

const EXAMPLES = [
  "挂科后什么时候申请补考？",
  "校园卡丢了怎么办？",
  "请假超过三天谁审批？",
  "给我讲个笑话",
];

const MOBILE_TABS = [
  { id: "chat", label: "对话", icon: MessageSquareText },
  { id: "sources", label: "引用", icon: FileText },
  { id: "process", label: "过程", icon: Activity },
] as const;

type MobileTab = (typeof MOBILE_TABS)[number]["id"];

export function ChatWorkspace() {
  const chat = useRagChatStream();
  const [input, setInput] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [healthOk, setHealthOk] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadHealth() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const data = await response.json();
        if (mounted) {
          setHealth(data.backend ?? null);
          setHealthOk(Boolean(data.ok && data.backend?.ok));
        }
      } catch {
        if (mounted) {
          setHealth(null);
          setHealthOk(false);
        }
      }
    }

    void loadHealth();
    const id = window.setInterval(loadHealth, 20_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const currentSources = chat.activeSources.length
    ? chat.activeSources
    : chat.latestAssistant?.sources ?? [];
  const latestMetadata = chat.activeFinal ?? {
    rewritten_query: chat.latestAssistant?.rewrittenQuery ?? "",
    boundary: chat.latestAssistant?.boundary,
    timings: chat.latestAssistant?.timings,
    used_llm: false,
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const query = input.trim();
    if (!query) {
      return;
    }
    setInput("");
    setMobileTab("chat");
    void chat.sendMessage(query);
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--accent)] text-white">
                <MessageSquareText size={19} aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-base font-semibold leading-tight">xyfRAG</h1>
                <p className="text-xs text-[var(--muted)]">校园资料库问答工作台</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HealthPill ok={healthOk} label={health?.app ?? "backend"} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={chat.newSession}
              title="新会话"
            >
              <RotateCcw size={15} aria-hidden="true" />
              <span className="hidden sm:inline">新会话</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-h-[calc(100vh-6rem)] flex-col rounded-lg border border-[var(--border)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">对话</h2>
              <p className="text-xs text-[var(--muted)]">Session {chat.sessionId || "-"}</p>
            </div>
            <div className="flex items-center gap-2">
              {chat.status === "streaming" ? (
                <Button type="button" variant="danger" size="sm" onClick={chat.stop}>
                  <Square size={14} aria-hidden="true" />
                  停止
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={chat.retry}
                  disabled={!chat.lastError}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  重试
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {chat.messages.length === 0 ? (
              <EmptyState onPick={(example) => setInput(example)} />
            ) : (
              <div className="space-y-4">
                {chat.messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {chat.status === "streaming" ? <TypingIndicator events={chat.events} /> : null}
              </div>
            )}
          </div>

          {chat.lastError ? (
            <div className="mx-4 mb-3 rounded-md border border-[#f3c0bd] bg-[#fff4f3] px-3 py-2 text-sm text-[var(--danger)]">
              {chat.lastError.message}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="border-t border-[var(--border)] p-3">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="输入校园资料库相关问题..."
                className="min-h-11 flex-1 resize-none rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm leading-6 text-[var(--foreground)] shadow-sm"
                rows={1}
                maxLength={2000}
              />
              <Button type="submit" variant="primary" disabled={chat.status === "streaming"}>
                {chat.status === "streaming" ? (
                  <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                ) : (
                  <Send size={16} aria-hidden="true" />
                )}
                发送
              </Button>
            </div>
          </form>
        </section>

        <aside className="hidden min-h-[calc(100vh-6rem)] gap-4 lg:grid lg:grid-rows-[1fr_auto]">
          <SourcePanel sources={currentSources} />
          <ProcessPanel events={chat.events} metadata={latestMetadata} />
        </aside>

        <section className="lg:hidden">
          <div className="mb-3 grid grid-cols-3 rounded-lg border border-[var(--border)] bg-white p-1">
            {MOBILE_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMobileTab(tab.id)}
                  className={cn(
                    "flex h-9 items-center justify-center gap-1 rounded-md text-xs font-medium",
                    mobileTab === tab.id
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--muted)]",
                  )}
                >
                  <Icon size={14} aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          {mobileTab === "sources" ? <SourcePanel sources={currentSources} /> : null}
          {mobileTab === "process" ? (
            <ProcessPanel events={chat.events} metadata={latestMetadata} />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function HealthPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-2 text-xs">
      <HeartPulse size={14} className={ok ? "text-[var(--accent)]" : "text-[var(--danger)]"} />
      <span className="hidden text-[var(--muted)] sm:inline">{label}</span>
      <span className={ok ? "text-[var(--accent-strong)]" : "text-[var(--danger)]"}>
        {ok ? "在线" : "离线"}
      </span>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (example: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent-strong)]">
        <PanelRight size={22} aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold">开始一次可追溯的校园问答</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">
        提问后会实时显示边界判断、检索阶段和引用来源。
      </p>
      <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="min-h-11 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-left text-sm hover:bg-[var(--panel-strong)]"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(760px,92%)] rounded-lg border px-4 py-3 text-sm leading-6",
          isUser
            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
            : "border-[var(--border)] bg-[var(--panel-strong)] text-[var(--foreground)]",
        )}
      >
        <div className="whitespace-pre-wrap break-words">{message.content || "..."}</div>
        {!isUser && message.sources?.length ? (
          <div className="mt-2 flex flex-wrap gap-1 text-xs text-[var(--accent-strong)]">
            {message.sources.map((source) => (
              <span key={source.chunk_id} className="rounded-sm bg-white px-1.5 py-0.5">
                [{source.index}] {source.title}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TypingIndicator({ events }: { events: ChatStatusPayload[] }) {
  const latest = events.at(-1);
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
      <Loader2 className="animate-spin text-[var(--accent)]" size={16} aria-hidden="true" />
      <span>{latest?.message ?? "正在处理"}</span>
    </div>
  );
}

function SourcePanel({ sources }: { sources: Source[] }) {
  return (
    <Card className="min-h-[320px] overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">引用来源</h2>
          <p className="text-xs text-[var(--muted)]">{sources.length} 条来源</p>
        </div>
        <FileText size={18} className="text-[var(--accent)]" aria-hidden="true" />
      </CardHeader>
      <CardContent className="max-h-[calc(100vh-12rem)] overflow-y-auto">
        {sources.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">暂无引用来源。</p>
        ) : (
          <div className="space-y-3">
            {sources.map((source) => (
              <article key={source.chunk_id} className="rounded-md border border-[var(--border)] p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold">
                      [{source.index}] {source.title}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {source.chunk_id} · score {source.score.toFixed(3)}
                    </p>
                  </div>
                  <CopyButton text={source.text} />
                </div>
                <p className="text-xs leading-5 text-[var(--foreground)]">{source.text}</p>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProcessPanel({
  events,
  metadata,
}: {
  events: ChatStatusPayload[];
  metadata: {
    rewritten_query?: string;
    boundary?: { is_in_scope: boolean; probability: number; reason: string };
    timings?: { llm_elapsed_seconds: number; total_elapsed_seconds: number };
    used_llm?: boolean;
  };
}) {
  const visibleEvents = events.length ? events : [{ stage: "idle", message: "等待提问" }];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">检索过程</h2>
          <p className="text-xs text-[var(--muted)]">边界、改写、召回、重排、生成</p>
        </div>
        <Gauge size={18} className="text-[var(--accent)]" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {visibleEvents.map((event, index) => (
            <div key={`${event.stage}-${index}`} className="flex items-center gap-2 text-sm">
              <CheckCircle2 size={15} className="text-[var(--accent)]" aria-hidden="true" />
              <span className="font-medium">{event.stage}</span>
              <span className="text-[var(--muted)]">{event.message}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2 rounded-md bg-[var(--panel-strong)] p-3 text-xs">
          <InfoRow label="改写查询" value={metadata.rewritten_query || "-"} />
          <InfoRow
            label="边界概率"
            value={
              metadata.boundary
                ? `${metadata.boundary.probability.toFixed(3)} · ${
                    metadata.boundary.is_in_scope ? "范围内" : "超纲"
                  }`
                : "-"
            }
          />
          <InfoRow label="LLM" value={metadata.used_llm ? "已调用" : "未调用或本地回答"} />
          <InfoRow
            label="总耗时"
            value={formatSeconds(metadata.timings?.total_elapsed_seconds)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="break-words text-[var(--foreground)]">{value}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={copied ? "已复制" : "复制来源"}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      <Copy size={15} aria-hidden="true" />
    </Button>
  );
}
