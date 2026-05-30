"use client";

import {
  Activity,
  Archive,
  BarChart3,
  BookOpenText,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Database,
  FileCheck2,
  FileText,
  HelpCircle,
  HeartPulse,
  History,
  Layers3,
  Loader2,
  LogIn,
  Menu,
  MessageSquareText,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  ThumbsDown,
  ThumbsUp,
  UploadCloud,
  UserRoundCog,
  Wifi,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useRagChatStream } from "@/features/chat/use-rag-chat-stream";
import { cn, formatSeconds } from "@/shared/lib/utils";
import type { BackendHealth, ChatMessage, ChatStatusPayload, Source } from "@/shared/types/chat";

const EXAMPLES = [
  {
    title: "补考安排",
    query: "挂科后什么时候申请补考？",
    meta: "学籍与考试",
  },
  {
    title: "校园卡挂失",
    query: "校园卡丢了怎么办？",
    meta: "校园服务",
  },
  {
    title: "请假审批",
    query: "请假超过三天谁审批？",
    meta: "学生事务",
  },
  {
    title: "范围熔断",
    query: "给我讲个笑话",
    meta: "边界测试",
  },
];

const NAV_ITEMS = [
  { label: "问答工作台", icon: MessageSquareText, active: true },
  { label: "知识库", icon: Database, badge: "Admin" },
  { label: "质量分析", icon: BarChart3 },
  { label: "系统设置", icon: ShieldCheck },
];

const ADMIN_ACTIONS = [
  { label: "上传文档", icon: UploadCloud, description: "Markdown / TXT 入库" },
  { label: "构建索引", icon: Archive, description: "刷新生效知识源" },
  { label: "审核引用", icon: FileCheck2, description: "抽检回答可追溯性" },
];

const RECENT_SESSIONS = [
  { title: "校园卡挂失流程", time: "2 分钟前" },
  { title: "请假审批需要哪些条件？", time: "昨天" },
  { title: "宿舍管理规定摘要", time: "2 天前" },
];

const MOBILE_TABS = [
  { id: "chat", label: "对话", icon: MessageSquareText },
  { id: "sources", label: "引用", icon: FileText },
  { id: "process", label: "过程", icon: Activity },
] as const;

type MobileTab = (typeof MOBILE_TABS)[number]["id"];
type TraceStage = "idle" | "boundary" | "rewrite" | "retrieve" | "rerank" | "generate" | "complete";

const PROCESS_STAGES: Array<{
  id: TraceStage;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  { id: "boundary", label: "边界识别", description: "判断问题是否属于知识库范围", icon: ShieldCheck },
  { id: "rewrite", label: "查询改写", description: "把上下文问题改写为可检索表达", icon: PenLine },
  { id: "retrieve", label: "向量检索", description: "召回语义与关键词候选片段", icon: Database },
  { id: "rerank", label: "引用重排", description: "筛选最可信的引用依据", icon: Layers3 },
  { id: "generate", label: "生成回答", description: "基于引用组织可追溯回复", icon: BrainCircuit },
  { id: "complete", label: "完成交付", description: "输出答案、引用与耗时指标", icon: CheckCircle2 },
];

export function ChatWorkspace() {
  const chat = useRagChatStream();
  const [input, setInput] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [healthOk, setHealthOk] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedAnswerId, setCopiedAnswerId] = useState<string | null>(null);

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
  const latestQuestion = useMemo(
    () => [...chat.messages].reverse().find((message) => message.role === "user"),
    [chat.messages],
  );
  const stats = {
    turns: chat.messages.filter((message) => message.role === "user").length,
    sources: currentSources.length,
    totalElapsed: latestMetadata.timings?.total_elapsed_seconds,
    boundary: latestMetadata.boundary?.is_in_scope,
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

  async function copyAnswer(message: ChatMessage) {
    await navigator.clipboard.writeText(message.content);
    setCopiedAnswerId(message.id);
    window.setTimeout(() => setCopiedAnswerId(null), 1200);
  }

  return (
    <main className="h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex h-full min-h-0">
        <ProductSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          sessionId={chat.sessionId}
          latestQuestion={latestQuestion?.content}
          onNewSession={chat.newSession}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ProductHeader
            health={health}
            healthOk={healthOk}
            onOpenSidebar={() => setSidebarOpen(true)}
          />

          <div className="grid min-h-0 flex-1 gap-3 overflow-hidden px-3 py-3 sm:px-5 lg:grid-cols-[minmax(0,1fr)_392px] lg:gap-4 lg:px-5 lg:py-4">
            <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-panel)]">
              <ChatHeroStats stats={stats} />

              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-base font-semibold">可信问答工作台</h1>
                    <StatusBadge status={chat.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--muted)]">
                    Session {chat.sessionId || "initializing"} · 可追溯引用与边界熔断
                  </p>
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

              <div className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfc_55%,#f4f8fa_100%)] px-4 py-5">
                {chat.messages.length === 0 ? (
                  <EmptyState onPick={(example) => setInput(example)} />
                ) : (
                  <div className="mx-auto max-w-4xl space-y-5">
                    {chat.messages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        copied={copiedAnswerId === message.id}
                        onCopy={() => void copyAnswer(message)}
                      />
                    ))}
                    {chat.status === "streaming" ? <TypingIndicator events={chat.events} /> : null}
                  </div>
                )}
              </div>

              {chat.lastError ? (
                <div className="mx-4 mb-3 rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                  {chat.lastError.message}
                </div>
              ) : null}

              <Composer
                input={input}
                status={chat.status}
                onInput={setInput}
                onSubmit={onSubmit}
              />
            </section>

            <aside className="hidden min-h-0 min-w-0 gap-4 overflow-hidden lg:grid lg:grid-rows-[minmax(0,1fr)_196px]">
              <SourcePanel sources={currentSources} />
              <ProcessPanel events={chat.events} metadata={latestMetadata} />
            </aside>

            <section className="min-h-0 overflow-y-auto lg:hidden">
              <div className="mb-3 grid grid-cols-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-1 shadow-sm">
                {MOBILE_TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMobileTab(tab.id)}
                      className={cn(
                        "flex h-10 items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors",
                        mobileTab === tab.id
                          ? "bg-[var(--accent)] text-white"
                          : "text-[var(--muted)] hover:bg-[var(--panel-strong)]",
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
        </div>
      </div>
    </main>
  );
}

function ProductSidebar({
  open,
  onClose,
  sessionId,
  latestQuestion,
  onNewSession,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  latestQuestion?: string;
  onNewSession: () => void;
}) {
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 lg:hidden",
          open ? "block" : "hidden",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[292px] flex-col overflow-hidden border-r border-[var(--border)] bg-[linear-gradient(180deg,#fbfdfe_0%,#f3f8fa_100%)] shadow-xl transition-transform lg:static lg:z-auto lg:h-full lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--border)] px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[linear-gradient(145deg,#0a877a_0%,#03433f_100%)] text-white shadow-md shadow-teal-950/10">
              <BookOpenText size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">xyfRAG</h2>
              <p className="truncate text-xs text-[var(--muted)]">产业级知识问答中枢</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--panel-strong)] lg:hidden"
            onClick={onClose}
            aria-label="关闭导航"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <Button type="button" variant="primary" className="w-full justify-center" onClick={onNewSession}>
            <Plus size={15} aria-hidden="true" />
            新建问答
          </Button>

          <nav className="mt-5 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  className={cn(
                    "flex h-10 w-full items-center justify-between rounded-md px-3 text-sm font-medium transition-all",
                    item.active
                      ? "border border-[var(--accent-soft)] bg-[linear-gradient(90deg,var(--accent-soft)_0%,rgba(255,255,255,0.72)_100%)] text-[var(--accent-strong)] shadow-sm"
                      : "text-[var(--muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--foreground)]",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon size={16} aria-hidden="true" />
                    {item.label}
                  </span>
                  {item.badge ? (
                    <span className="rounded-sm bg-white px-1.5 py-0.5 text-[10px] text-[var(--accent-strong)]">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">当前会话</h3>
              <History size={14} className="text-[var(--muted)]" aria-hidden="true" />
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 shadow-sm">
              <p className="line-clamp-2 text-sm font-medium">
                {latestQuestion || "等待开始新的资料库问答"}
              </p>
              <p className="mt-2 truncate text-xs text-[var(--muted)]">{sessionId || "-"}</p>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">历史会话</h3>
              <Search size={14} className="text-[var(--muted)]" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              {RECENT_SESSIONS.map((session) => (
                <button
                  key={session.title}
                  type="button"
                  className="w-full rounded-md border border-[var(--border)] bg-white/72 px-3 py-2 text-left shadow-sm transition hover:border-[var(--border-strong)] hover:bg-white"
                >
                  <span className="block truncate text-sm text-[var(--foreground)]">
                    {session.title}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">{session.time}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">管理员快捷操作</h3>
              <UserRoundCog size={14} className="text-[var(--muted)]" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              {ADMIN_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md border border-[var(--border)] bg-white/78 px-3 py-2 text-left shadow-sm transition-colors hover:border-[var(--border-strong)] hover:bg-white"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--panel-strong)] text-[var(--accent-strong)]">
                      <Icon size={15} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{action.label}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">
                        {action.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border)] p-3">
          <div className="rounded-lg border border-[var(--border)] bg-white/82 p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                <ShieldCheck size={15} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">演示管理员</p>
                <p className="truncate text-xs text-[var(--muted)]">登录与权限将在下一阶段接入</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function ProductHeader({
  health,
  healthOk,
  onOpenSidebar,
}: {
  health: BackendHealth | null;
  healthOk: boolean;
  onOpenSidebar: () => void;
}) {
  return (
    <header className="z-30 shrink-0 border-b border-[var(--border)] bg-white/88 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-5 lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-strong)] lg:hidden"
            onClick={onOpenSidebar}
            aria-label="打开导航"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <div className="hidden min-w-0 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 shadow-sm md:flex">
            <Search size={15} className="text-[var(--muted)]" aria-hidden="true" />
            <span className="truncate text-sm text-[var(--muted)]">搜索会话、文档或引用来源</span>
            <span className="ml-8 rounded border border-[var(--border)] bg-[var(--panel-muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
              ⌘ /
            </span>
          </div>
          <div className="min-w-0 md:hidden">
            <p className="truncate text-sm font-semibold">xyfRAG 工作台</p>
            <p className="truncate text-xs text-[var(--muted)]">可信知识库问答</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-xs shadow-sm lg:flex">
            <Database size={14} className="text-[var(--accent)]" aria-hidden="true" />
            <span className="text-[var(--muted)]">知识库状态</span>
            <span className="font-medium text-[var(--accent-strong)]">正常</span>
          </div>
          <Button type="button" variant="ghost" size="icon" title="帮助">
            <HelpCircle size={16} aria-hidden="true" />
          </Button>
          <HealthPill ok={healthOk} label={health?.app ?? "backend"} />
          <Button type="button" variant="secondary" size="sm" title="登录入口">
            <LogIn size={15} aria-hidden="true" />
            <span className="hidden sm:inline">登录</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function ChatHeroStats({
  stats,
}: {
  stats: {
    turns: number;
    sources: number;
    totalElapsed?: number;
    boundary?: boolean;
  };
}) {
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfd_100%)] p-2.5 sm:grid-cols-4">
      <MetricCard icon={MessageSquareText} label="会话轮次" value={`${stats.turns}`} />
      <MetricCard icon={FileText} label="引用来源" value={`${stats.sources}`} />
      <MetricCard icon={Clock3} label="响应耗时" value={formatSeconds(stats.totalElapsed)} />
      <MetricCard
        icon={ShieldCheck}
        label="边界状态"
        value={stats.boundary === undefined ? "待判断" : stats.boundary ? "范围内" : "已熔断"}
        tone={stats.boundary === false ? "warning" : "normal"}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "normal",
}: {
  icon: typeof MessageSquareText;
  label: string;
  value: string;
  tone?: "normal" | "warning";
}) {
  return (
    <div className="group flex min-h-[58px] items-center gap-2.5 rounded-md border border-[var(--border)] bg-white px-3 shadow-sm transition hover:border-[var(--border-strong)] hover:shadow-md">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          tone === "warning"
            ? "bg-[var(--warning-soft)] text-[var(--warning)]"
            : "bg-[var(--accent-tint)] text-[var(--accent-strong)]",
        )}
      >
        <Icon size={16} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-[var(--muted)]">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function HealthPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-2 text-xs shadow-sm">
      <HeartPulse size={14} className={ok ? "text-[var(--accent)]" : "text-[var(--danger)]"} />
      <span className="hidden max-w-[120px] truncate text-[var(--muted)] sm:inline">{label}</span>
      <span className={ok ? "text-[var(--accent-strong)]" : "text-[var(--danger)]"}>
        {ok ? "在线" : "离线"}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: "idle" | "streaming" | "error" }) {
  const label = status === "streaming" ? "生成中" : status === "error" ? "异常" : "就绪";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-xs font-medium",
        status === "streaming"
          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : status === "error"
            ? "bg-[var(--danger-soft)] text-[var(--danger)]"
            : "bg-[var(--panel-strong)] text-[var(--muted)]",
      )}
    >
      {label}
    </span>
  );
}

function EmptyState({ onPick }: { onPick: (example: string) => void }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col py-5 sm:py-7">
      <div className="max-w-2xl">
        <div className="mb-3 inline-flex h-9 items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 text-sm text-[var(--muted)] shadow-sm">
          <Sparkles size={15} className="text-[var(--accent)]" aria-hidden="true" />
          混合检索 · 边界熔断 · 引用追溯
        </div>
        <h2 className="text-2xl font-semibold tracking-normal sm:text-[28px]">
          从可信资料库开始一次专业问答
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
          选择一个业务问题，系统会实时展示检索路径、边界判断和引用来源。
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {EXAMPLES.map((example) => (
          <button
            key={example.query}
            type="button"
            onClick={() => onPick(example.query)}
            className="group min-h-[96px] rounded-lg border border-[var(--border)] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{example.title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{example.query}</p>
              </div>
              <ChevronRight
                size={17}
                className="mt-0.5 shrink-0 text-[var(--muted)] transition group-hover:text-[var(--accent)]"
                aria-hidden="true"
              />
            </div>
            <span className="mt-3 inline-flex rounded-sm bg-[var(--panel-strong)] px-2 py-1 text-xs text-[var(--muted)]">
              {example.meta}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  copied,
  onCopy,
}: {
  message: ChatMessage;
  copied: boolean;
  onCopy: () => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(145deg,#0b877a_0%,#04524c_100%)] text-white shadow-md shadow-teal-950/10">
          <Bot size={17} aria-hidden="true" />
        </div>
      ) : null}
      <article
        className={cn(
          "group max-w-[min(780px,92%)] rounded-lg border px-4 py-3 text-sm leading-6 shadow-sm",
          isUser
            ? "border-[var(--accent)] bg-[linear-gradient(180deg,#eaf8f5_0%,#dff3f0_100%)] text-[var(--foreground)]"
            : "border-[var(--border)] bg-white text-[var(--foreground)] shadow-[var(--shadow-soft)]",
        )}
      >
        <div className="whitespace-pre-wrap break-words">{message.content || "..."}</div>
        {!isUser && message.sources?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-[var(--accent-strong)]">
            {message.sources.map((source) => (
              <span key={source.chunk_id} className="rounded-sm border border-[var(--border)] bg-[var(--accent-tint)] px-1.5 py-0.5">
                [{source.index}] {source.title}
              </span>
            ))}
          </div>
        ) : null}
        {!isUser ? (
          <div className="mt-3 flex items-center gap-1 border-t border-[var(--border)] pt-2 text-[var(--muted)]">
            <IconAction label={copied ? "已复制" : "复制回答"} onClick={onCopy} icon={Copy} />
            <IconAction label="收藏" icon={Star} />
            <IconAction label="回答有帮助" icon={ThumbsUp} />
            <IconAction label="回答需改进" icon={ThumbsDown} />
          </div>
        ) : null}
      </article>
    </div>
  );
}

function IconAction({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Copy;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--foreground)]"
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

function TypingIndicator({ events }: { events: ChatStatusPayload[] }) {
  const latest = events.at(-1);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)] shadow-sm">
      <Loader2 className="animate-spin text-[var(--accent)]" size={16} aria-hidden="true" />
      <span>{latest?.message ?? "正在处理"}</span>
    </div>
  );
}

function Composer({
  input,
  status,
  onInput,
  onSubmit,
}: {
  input: string;
  status: "idle" | "streaming" | "error";
  onInput: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="shrink-0 border-t border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fafb_100%)] p-3">
      <div className="rounded-lg border border-[var(--border)] bg-white p-2 shadow-[var(--shadow-soft)] transition focus-within:border-[var(--accent)]">
        <textarea
          value={input}
          onChange={(event) => onInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="输入校园资料库相关问题..."
          className="min-h-10 w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-6 text-[var(--foreground)] outline-none"
          rows={1}
          maxLength={2000}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-2 pt-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <ComposerTool icon={Layers3} label="选择引用来源" />
            <ComposerTool icon={Wifi} label="开启联网" />
            <span className="hidden sm:inline">Enter 发送，Shift + Enter 换行</span>
          </div>
          <Button type="submit" variant="primary" disabled={status === "streaming"}>
            {status === "streaming" ? (
              <Loader2 className="animate-spin" size={16} aria-hidden="true" />
            ) : (
              <Send size={16} aria-hidden="true" />
            )}
            发送
          </Button>
        </div>
      </div>
    </form>
  );
}

function ComposerTool({ icon: Icon, label }: { icon: typeof Layers3; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-[var(--muted)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--foreground)]"
    >
      <Icon size={14} aria-hidden="true" />
      {label}
    </button>
  );
}

function SourcePanel({ sources }: { sources: Source[] }) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden shadow-[var(--shadow-soft)]">
      <CardHeader className="shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">引用来源</h2>
            <p className="text-xs text-[var(--muted)]">{sources.length} 条来源 · 可复制原文片段</p>
          </div>
          <FileText size={18} className="text-[var(--accent)]" aria-hidden="true" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <SourceFilter active label="全部" count={sources.length} />
          <SourceFilter label="文档" count={sources.length} />
          <SourceFilter label="网页" count={0} />
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        {sources.length === 0 ? (
          <PanelEmpty
            icon={FileText}
            title="暂无引用来源"
            description="完成一次资料库问答后，这里会展示命中的文档片段。"
          />
        ) : (
          <div className="space-y-3">
            {sources.map((source) => (
              <article
                key={source.chunk_id}
                className="rounded-lg border border-[var(--border)] bg-white p-3 shadow-sm transition hover:border-[var(--accent)]"
              >
                <div className="mb-2 flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--info-soft)] text-xs font-semibold text-[var(--info)]">
                    {source.index}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="break-words text-sm font-semibold">{source.title}</h3>
                      <CopyButton text={source.text} />
                    </div>
                    <p className="mt-1 break-words text-xs text-[var(--muted)]">
                      {source.chunk_id} · score {source.score.toFixed(3)}
                    </p>
                  </div>
                </div>
                <p className="line-clamp-6 text-xs leading-5 text-[var(--foreground)]">
                  {source.text}
                </p>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SourceFilter({
  label,
  count,
  active = false,
}: {
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition",
        active
          ? "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "border-[var(--border)] bg-white text-[var(--muted)] hover:bg-[var(--panel-strong)]",
      )}
    >
      {label}
      <span className="text-[11px] opacity-80">{count}</span>
    </button>
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
  const statusByStage = new Map(events.map((event) => [event.stage, event]));
  const activeStage = (events.at(-1)?.stage ?? "idle") as TraceStage;
  const activeIndex = PROCESS_STAGES.findIndex((stage) => stage.id === activeStage);
  const complete = activeStage === "complete";
  const displayStage =
    PROCESS_STAGES.find((stage) => stage.id === activeStage) ?? {
      id: "idle" as const,
      label: "流程待命",
      description: "提交问题后，系统会按阶段推进检索与生成。",
      icon: Sparkles,
    };
  const displayEvent = statusByStage.get(displayStage.id);
  const DisplayIcon = displayStage.icon;
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden shadow-[var(--shadow-soft)]">
      <CardHeader className="shrink-0 border-b-0 px-4 py-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">检索过程</h2>
            <p className="text-xs text-[var(--muted)]">实时流程</p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          {PROCESS_STAGES.map((stage, index) => {
            const reached = complete || (activeIndex >= 0 && index <= activeIndex);
            const current = stage.id === activeStage;
            const DotIcon = stage.icon;
            return (
              <span
                key={stage.id}
                title={stage.label}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border bg-white transition-all duration-500",
                  reached ? "border-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]",
                  current ? "scale-110 shadow-[0_0_0_6px_rgba(0,108,99,0.08)] motion-safe:animate-[traceBreath_2.8s_ease-in-out_infinite]" : "",
                )}
              >
                <DotIcon size={12} aria-hidden="true" />
              </span>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-4 pb-3 pt-0">
        <div className="relative h-full overflow-hidden rounded-lg border border-[var(--border)] bg-[linear-gradient(135deg,#ffffff_0%,#f8fbfc_55%,#f2f7f8_100%)] p-2.5 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-16 h-28 w-28 rounded-full bg-[rgba(0,108,99,0.12)] blur-3xl motion-safe:animate-[ambientBreath_5.2s_ease-in-out_infinite]" />
          <div className="relative grid h-full grid-cols-[42px_minmax(0,1fr)] gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-[var(--accent)] shadow-sm">
              <span className="absolute inset-[-6px] rounded-2xl border border-[var(--accent-soft)] opacity-80 motion-safe:animate-[traceBreath_2.8s_ease-in-out_infinite]" />
              <DisplayIcon size={19} className="relative" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{displayStage.label}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-[var(--muted)]">
                    {displayEvent?.message || displayStage.description}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--border)] bg-white/76 px-2 py-1 text-xs font-medium text-[var(--muted)]">
                  {complete ? "完成" : activeIndex >= 0 ? `${activeIndex + 1} / 6` : "待命"}
                </span>
              </div>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                <TracePill label="耗时" value={formatSeconds(metadata.timings?.total_elapsed_seconds)} />
                <TracePill
                  label="边界"
                  value={
                    metadata.boundary
                      ? metadata.boundary.is_in_scope
                        ? "范围内"
                        : "超纲"
                      : "-"
                  }
                />
                <TracePill label="模式" value={metadata.used_llm ? "LLM" : "本地"} />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TracePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-[var(--border)] bg-white/72 px-2 text-[11px] text-[var(--muted)]">
      <span>{label}</span>
      <span className="font-semibold text-[var(--foreground)]">{value}</span>
    </span>
  );
}

function PanelEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel-muted)] px-5 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-[var(--panel)] text-[var(--muted)]">
        <Icon size={18} aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 max-w-[260px] text-xs leading-5 text-[var(--muted)]">{description}</p>
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
      {copied ? (
        <CheckCircle2 size={15} className="text-[var(--accent)]" aria-hidden="true" />
      ) : (
        <Copy size={15} aria-hidden="true" />
      )}
    </Button>
  );
}
