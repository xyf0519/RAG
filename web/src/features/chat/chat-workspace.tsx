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
  FilePlus2,
  FileCheck2,
  FileText,
  HelpCircle,
  HeartPulse,
  History,
  Layers3,
  Loader2,
  LogOut,
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
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginScreen } from "@/features/auth/login-screen";
import { useAuth } from "@/features/auth/auth-provider";
import { useRagChatStream } from "@/features/chat/use-rag-chat-stream";
import { cn, formatSeconds } from "@/shared/lib/utils";
import type { AuthUser } from "@/shared/types/auth";
import type {
  BackendHealth,
  ChatMessage,
  ChatSessionSummary,
  ChatStatusPayload,
  FeedbackRating,
  BoundaryDatasetItem,
  IndexJob,
  KnowledgeBase,
  KnowledgeDocument,
  Source,
} from "@/shared/types/chat";

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

type WorkspaceView = "chat" | "knowledge" | "boundary" | "quality";

const NAV_ITEMS: Array<{
  id: WorkspaceView;
  label: string;
  icon: typeof MessageSquareText;
  badge?: string;
  adminOnly?: boolean;
}> = [
  { id: "chat", label: "问答工作台", icon: MessageSquareText },
  { id: "knowledge", label: "添加知识库", icon: FilePlus2, adminOnly: true },
  { id: "boundary", label: "边界训练", icon: BrainCircuit, adminOnly: true },
  { id: "quality", label: "质量分析", icon: BarChart3, badge: "治理", adminOnly: true },
];

const DEFAULT_KNOWLEDGE_BASE: KnowledgeBase = {
  id: "kb-default",
  name: "默认校园资料库",
  description: "默认知识库",
  status: "active",
  document_count: 0,
  index_status: "not_indexed",
  last_indexed_at: null,
  updated_at: Date.now() / 1000,
  created_at: Date.now() / 1000,
};

const KNOWLEDGE_VISUAL_SRC = "/images/knowledge-governance-visual.png";
const BOUNDARY_VISUAL_SRC = "/images/boundary-network-visual.png";

const QUALITY_REVIEWS = [
  {
    title: "校园卡挂失流程",
    issue: "引用片段重复出现",
    owner: "图书馆",
    priority: "高",
    status: "待复核",
  },
  {
    title: "宿舍管理规定摘要",
    issue: "资料版本较旧",
    owner: "公寓服务",
    priority: "中",
    status: "待更新",
  },
  {
    title: "请假审批条件",
    issue: "回答命中边界较窄",
    owner: "学生事务",
    priority: "中",
    status: "观察中",
  },
];

const QUALITY_TRENDS = [
  { label: "周一", value: 64 },
  { label: "周二", value: 78 },
  { label: "周三", value: 72 },
  { label: "周四", value: 88 },
  { label: "周五", value: 82 },
  { label: "周六", value: 92 },
];

const MOBILE_TABS = [
  { id: "chat", label: "对话", icon: MessageSquareText },
  { id: "sources", label: "引用", icon: FileText },
  { id: "process", label: "过程", icon: Activity },
] as const;

type MobileTab = (typeof MOBILE_TABS)[number]["id"];
type TraceStage = "idle" | "boundary" | "rewrite" | "retrieve" | "rerank" | "generate" | "complete";
type FeedbackStats = {
  positive: number;
  negative: number;
  favorites: number;
  total: number;
};
type QualityMetric = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
};

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
  const auth = useAuth();
  const chat = useRagChatStream();
  const [input, setInput] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [healthOk, setHealthOk] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [copiedAnswerId, setCopiedAnswerId] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chat");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([DEFAULT_KNOWLEDGE_BASE]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState(DEFAULT_KNOWLEDGE_BASE.id);
  const [knowledgeNotice, setKnowledgeNotice] = useState("知识库运维状态正常。");

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

  const refreshKnowledgeBases = useCallback(async () => {
    try {
      const response = await fetch("/api/knowledge-bases", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("知识库列表加载失败。");
      }
      const data = (await response.json()) as KnowledgeBase[];
      if (data.length) {
        setKnowledgeBases(data);
        setSelectedKnowledgeBaseId((current) =>
          data.some((item) => item.id === current) ? current : data[0].id,
        );
      }
    } catch {
      setKnowledgeBases((current) => (current.length ? current : [DEFAULT_KNOWLEDGE_BASE]));
    }
  }, []);

  useEffect(() => {
    if (auth.user) {
      void refreshKnowledgeBases();
    }
  }, [auth.user, refreshKnowledgeBases]);

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
  const selectedKnowledgeBase =
    knowledgeBases.find((item) => item.id === selectedKnowledgeBaseId) ?? knowledgeBases[0] ?? DEFAULT_KNOWLEDGE_BASE;
  const stats = {
    turns: chat.messages.filter((message) => message.role === "user").length,
    sources: currentSources.length,
    totalElapsed: latestMetadata.timings?.total_elapsed_seconds,
    boundary: latestMetadata.boundary?.is_in_scope,
  };
  const feedbackStats = useMemo(() => {
    const assistantMessages = chat.messages.filter((message) => message.role === "assistant");
    return {
      positive: assistantMessages.filter((message) => message.feedback?.rating === "up").length,
      negative: assistantMessages.filter((message) => message.feedback?.rating === "down").length,
      favorites: assistantMessages.filter((message) => message.favorite).length,
      total: assistantMessages.filter((message) => message.feedback).length,
    };
  }, [chat.messages]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const query = input.trim();
    if (!query) {
      return;
    }
    setInput("");
    setMobileTab("chat");
    void chat.sendMessage(query, selectedKnowledgeBase);
  }

  function changeWorkspaceView(view: WorkspaceView) {
    setWorkspaceView(view);
    setSidebarOpen(false);
  }

  function startNewSession() {
    chat.newSession();
    setWorkspaceView("chat");
    setSidebarOpen(false);
  }

  function openStoredSession(nextSessionId: string) {
    chat.openSession(nextSessionId);
    const session = chat.sessions.find((item) => item.id === nextSessionId);
    if (session?.knowledgeBaseId) {
      setSelectedKnowledgeBaseId(session.knowledgeBaseId);
    }
    setWorkspaceView("chat");
    setSidebarOpen(false);
  }

  async function copyAnswer(message: ChatMessage) {
    await navigator.clipboard.writeText(message.content);
    setCopiedAnswerId(message.id);
    window.setTimeout(() => setCopiedAnswerId(null), 1200);
  }

  function submitFeedback(message: ChatMessage, rating: FeedbackRating) {
    const nextFeedback =
      message.feedback?.rating === rating
        ? null
        : {
            rating,
            createdAt: Date.now(),
          };
    chat.updateMessageFeedback(message.id, nextFeedback);
  }

  if (!auth.ready) {
    return (
      <main className="grid h-screen place-items-center bg-[var(--background)] text-sm text-[var(--muted)]">
        正在恢复登录状态...
      </main>
    );
  }

  if (!auth.user) {
    return <LoginScreen />;
  }

  return (
    <main className="h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex h-full min-h-0">
        <ProductSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          sessionId={chat.sessionId}
          latestQuestion={latestQuestion?.content}
          sessions={chat.sessions}
          onNewSession={startNewSession}
          onOpenSession={openStoredSession}
          user={auth.user}
          isAdmin={auth.isAdmin}
          activeView={workspaceView}
          collapsed={sidebarCollapsed}
          onChangeView={changeWorkspaceView}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
          onSignOut={auth.signOut}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300 ease-out">
          <ProductHeader
            health={health}
            healthOk={healthOk}
            user={auth.user}
            onSignOut={auth.signOut}
            onOpenSidebar={() => setSidebarOpen(true)}
            sidebarCollapsed={sidebarCollapsed}
            onExpandSidebar={() => setSidebarCollapsed(false)}
          />

          {workspaceView === "knowledge" && auth.isAdmin ? (
            <KnowledgeAddWorkspace
              knowledgeBases={knowledgeBases}
              selectedKnowledgeBaseId={selectedKnowledgeBase.id}
              notice={knowledgeNotice}
              onNotice={setKnowledgeNotice}
              onRefresh={refreshKnowledgeBases}
              onSelect={setSelectedKnowledgeBaseId}
            />
          ) : null}
          {workspaceView === "boundary" && auth.isAdmin ? (
            <BoundaryTrainingWorkspace
              knowledgeBases={knowledgeBases}
              selectedKnowledgeBaseId={selectedKnowledgeBase.id}
              onSelect={setSelectedKnowledgeBaseId}
            />
          ) : null}
          {workspaceView === "quality" && auth.isAdmin ? <QualityAnalyticsWorkspace feedbackStats={feedbackStats} /> : null}
          {workspaceView === "chat" || !auth.isAdmin ? (
            <ChatWorkspaceView
              chat={chat}
              input={input}
              mobileTab={mobileTab}
              stats={stats}
              currentSources={currentSources}
              knowledgeBases={knowledgeBases}
              selectedKnowledgeBase={selectedKnowledgeBase}
              latestMetadata={latestMetadata}
              feedbackStats={feedbackStats}
              copiedAnswerId={copiedAnswerId}
              onInput={setInput}
              onMobileTab={setMobileTab}
              onSelectKnowledgeBase={setSelectedKnowledgeBaseId}
              onSubmit={onSubmit}
              onCopyAnswer={(message) => void copyAnswer(message)}
              onFeedback={submitFeedback}
              onToggleFavorite={chat.toggleFavorite}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function ChatWorkspaceView({
  chat,
  input,
  mobileTab,
  stats,
  currentSources,
  knowledgeBases,
  selectedKnowledgeBase,
  latestMetadata,
  feedbackStats,
  copiedAnswerId,
  onInput,
  onMobileTab,
  onSelectKnowledgeBase,
  onSubmit,
  onCopyAnswer,
  onFeedback,
  onToggleFavorite,
}: {
  chat: ReturnType<typeof useRagChatStream>;
  input: string;
  mobileTab: MobileTab;
  stats: {
    turns: number;
    sources: number;
    totalElapsed?: number;
    boundary?: boolean;
  };
  currentSources: Source[];
  knowledgeBases: KnowledgeBase[];
  selectedKnowledgeBase: KnowledgeBase;
  latestMetadata: {
    rewritten_query?: string;
    boundary?: { is_in_scope: boolean; probability: number; reason: string };
    timings?: { llm_elapsed_seconds: number; total_elapsed_seconds: number };
    used_llm?: boolean;
  };
  feedbackStats: FeedbackStats;
  copiedAnswerId: string | null;
  onInput: (value: string) => void;
  onMobileTab: (tab: MobileTab) => void;
  onSelectKnowledgeBase: (knowledgeBaseId: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCopyAnswer: (message: ChatMessage) => void;
  onFeedback: (message: ChatMessage, rating: FeedbackRating) => void;
  onToggleFavorite: (messageId: string) => void;
}) {
  return (
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
              会话 {chat.sessionId || "准备中"} · 可追溯引用与边界熔断
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <KnowledgeBaseSelect
              knowledgeBases={knowledgeBases}
              selectedId={selectedKnowledgeBase.id}
              onSelect={onSelectKnowledgeBase}
            />
            {chat.status === "streaming" ? (
              <Button type="button" variant="danger" size="sm" onClick={chat.stop}>
                <Square size={14} aria-hidden="true" />
                停止
              </Button>
            ) : (
              <Button type="button" variant="secondary" size="sm" onClick={chat.retry} disabled={!chat.lastError}>
                <RefreshCw size={14} aria-hidden="true" />
                重试
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfc_55%,#f4f8fa_100%)] px-4 py-5">
          {chat.messages.length === 0 ? (
            <EmptyState onPick={(example) => onInput(example)} />
          ) : (
            <div className="mx-auto max-w-4xl space-y-5">
              {chat.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  copied={copiedAnswerId === message.id}
                  onCopy={() => onCopyAnswer(message)}
                  onFeedback={(rating) => onFeedback(message, rating)}
                  onToggleFavorite={() => onToggleFavorite(message.id)}
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

        <Composer input={input} status={chat.status} onInput={onInput} onSubmit={onSubmit} />
      </section>

      <aside className="hidden min-h-0 min-w-0 gap-4 overflow-hidden lg:grid lg:grid-rows-[minmax(0,1fr)_196px]">
        <SourcePanel sources={currentSources} knowledgeBases={knowledgeBases} />
        <ProcessPanel events={chat.events} metadata={latestMetadata} feedbackStats={feedbackStats} />
      </aside>

      <section className="min-h-0 overflow-y-auto lg:hidden">
        <div className="mb-3 grid grid-cols-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-1 shadow-sm">
          {MOBILE_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onMobileTab(tab.id)}
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
        {mobileTab === "sources" ? <SourcePanel sources={currentSources} knowledgeBases={knowledgeBases} /> : null}
        {mobileTab === "process" ? <ProcessPanel events={chat.events} metadata={latestMetadata} feedbackStats={feedbackStats} /> : null}
      </section>
    </div>
  );
}

function KnowledgeAddWorkspace({
  knowledgeBases,
  selectedKnowledgeBaseId,
  notice,
  onNotice,
  onRefresh,
  onSelect,
}: {
  knowledgeBases: KnowledgeBase[];
  selectedKnowledgeBaseId: string;
  notice: string;
  onNotice: (notice: string) => void;
  onRefresh: () => Promise<void>;
  onSelect: (knowledgeBaseId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [indexing, setIndexing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const selectedKnowledgeBase =
    knowledgeBases.find((item) => item.id === selectedKnowledgeBaseId) ?? knowledgeBases[0] ?? DEFAULT_KNOWLEDGE_BASE;
  const visibleKnowledgeBases = knowledgeBases.slice(0, 5);
  const visibleDocuments = documents.slice(0, 4);

  const refreshDocuments = useCallback(async () => {
    if (!selectedKnowledgeBase?.id) {
      return;
    }
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}/documents`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("文档列表加载失败。");
      }
      setDocuments((await response.json()) as KnowledgeDocument[]);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "文档列表加载失败。");
    }
  }, [onNotice, selectedKnowledgeBase?.id]);

  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  async function createKnowledgeBase() {
    const name = newName.trim();
    if (!name) {
      onNotice("请输入知识库名称。");
      return;
    }
    try {
      const response = await fetch("/api/knowledge-bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: newDescription.trim() }),
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "知识库创建失败。"));
      }
      const created = (await response.json()) as KnowledgeBase;
      setNewName("");
      setNewDescription("");
      onSelect(created.id);
      onNotice("知识库已创建。");
      await onRefresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "知识库创建失败。");
    }
  }

  async function onFiles(files: FileList | File[] | null) {
    const nextFiles = Array.from(files ?? []).filter((file) =>
      [".md", ".txt"].some((suffix) => file.name.toLowerCase().endsWith(suffix)),
    );
    if (!nextFiles.length) {
      onNotice("请选择 Markdown 或 TXT 文档。");
      return;
    }
    const formData = new FormData();
    nextFiles.forEach((file) => formData.append("files", file));
    setUploading(true);
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}/documents`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "文档上传失败。"));
      }
      onNotice(`${nextFiles.length} 个文档已上传。`);
      await onRefresh();
      await refreshDocuments();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "文档上传失败。");
    } finally {
      setUploading(false);
    }
  }

  async function runIndexing() {
    setIndexing(true);
    onNotice("正在构建索引。");
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}/index-jobs`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "索引任务创建失败。"));
      }
      const job = (await response.json()) as IndexJob;
      onNotice(job.message);
      await onRefresh();
      await refreshDocuments();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "索引任务创建失败。");
    } finally {
      setIndexing(false);
    }
  }

  async function toggleKnowledgeBaseStatus() {
    setSavingStatus(true);
    const nextStatus = selectedKnowledgeBase.status === "active" ? "disabled" : "active";
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "状态更新失败。"));
      }
      onNotice(nextStatus === "active" ? "知识库已启用。" : "知识库已停用。");
      await onRefresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "状态更新失败。");
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <section className="h-full min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-5 lg:px-6 lg:py-5">
      <div className="mx-auto grid h-full max-w-[1440px] min-h-0 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        <div className="grid min-h-0 grid-rows-[176px_minmax(0,1fr)] gap-4">
          <VisualHero
            image={KNOWLEDGE_VISUAL_SRC}
            eyebrow="Knowledge"
            title="添加知识库"
            description="创建资料空间，上传文档并构建索引。"
          />
          <Card className="min-h-0 overflow-hidden shadow-[var(--shadow-soft)]">
            <CardHeader className="shrink-0">
              <h2 className="text-sm font-semibold">知识库</h2>
              <p className="text-xs text-[var(--muted)]">{knowledgeBases.length} 个空间</p>
            </CardHeader>
            <CardContent className="min-h-0 overflow-hidden">
              <div className="space-y-2">
                {visibleKnowledgeBases.map((knowledgeBase) => (
                  <button
                    key={knowledgeBase.id}
                    type="button"
                    onClick={() => onSelect(knowledgeBase.id)}
                    className={cn(
                      "w-full rounded-xl border bg-white px-3 py-3 text-left shadow-sm transition hover:border-[var(--accent)] hover:shadow-md",
                      knowledgeBase.id === selectedKnowledgeBase.id ? "border-[var(--accent)]" : "border-[var(--border)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{knowledgeBase.name}</p>
                        <p className="mt-1 truncate text-xs text-[var(--muted)]">
                          {knowledgeBase.document_count} 文档
                        </p>
                      </div>
                      <StatusChip
                        label={indexStatusLabel(knowledgeBase.index_status)}
                        tone={knowledgeBase.index_status === "ready" ? "ok" : "muted"}
                      />
                    </div>
                  </button>
                ))}
                {knowledgeBases.length > visibleKnowledgeBases.length ? (
                  <p className="px-1 text-xs text-[var(--muted)]">
                    还有 {knowledgeBases.length - visibleKnowledgeBases.length} 个知识库
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
          <Card className="shadow-[var(--shadow-soft)]">
            <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="知识库名称"
                className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
              <input
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="一句话描述"
                className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]"
              />
              <Button type="button" variant="primary" onClick={createKnowledgeBase}>
                <Plus size={15} aria-hidden="true" />
                新建
              </Button>
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden shadow-[var(--shadow-soft)]">
            <CardHeader className="shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{selectedKnowledgeBase.name}</h2>
                  <p className="truncate text-xs text-[var(--muted)]">{notice}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => void onRefresh()}>
                    <RefreshCw size={14} aria-hidden="true" />
                    刷新
                  </Button>
                  <Button type="button" variant="primary" size="sm" onClick={runIndexing} disabled={indexing || !documents.length}>
                    {indexing ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
                    构建
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid min-h-0 grid-rows-[210px_minmax(0,1fr)] gap-3">
              <div
                onDragOver={(event) => event.preventDefault()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  void onFiles(Array.from(event.dataTransfer.files));
                }}
                className={cn(
                  "grid place-items-center rounded-2xl border border-dashed bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfa_100%)] text-center transition hover:border-[var(--accent)]",
                  dragging ? "border-[var(--accent)] shadow-[0_18px_48px_rgba(0,108,99,0.12)]" : "border-[var(--border-strong)]",
                )}
              >
                <div>
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-tint)] text-[var(--accent-strong)]">
                    {uploading ? <Loader2 className="animate-spin" size={21} /> : <UploadCloud size={21} />}
                  </div>
                  <p className="text-sm font-semibold">拖拽或点击上传</p>
                  <p className="mt-2 text-xs text-[var(--muted)]">Markdown / TXT</p>
                  <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => fileInputRef.current?.click()}>
                    选择文档
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".md,.txt"
                    className="sr-only"
                    onChange={(event) => {
                      void onFiles(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </div>
              </div>

              <div className="min-h-0 overflow-hidden pr-1">
                <div className="space-y-2">
                  {documents.length ? visibleDocuments.map((document) => (
                    <CompactDocumentRow key={document.id} document={document} />
                  )) : (
                    <PanelEmpty icon={UploadCloud} title="等待资料" description="上传后即可构建索引。" />
                  )}
                  {documents.length > visibleDocuments.length ? (
                    <p className="px-1 text-xs text-[var(--muted)]">
                      还有 {documents.length - visibleDocuments.length} 个文档
                    </p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="grid min-h-0 content-start gap-4">
          <Card className="shadow-[var(--shadow-soft)]">
            <CardHeader>
              <h2 className="text-sm font-semibold">状态</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <StateRow label="运行" value={selectedKnowledgeBase.status === "active" ? "启用" : "停用"} />
                <StateRow label="索引" value={indexStatusLabel(selectedKnowledgeBase.index_status)} />
                <StateRow label="文档" value={`${selectedKnowledgeBase.document_count}`} />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3 w-full justify-center"
                onClick={toggleKnowledgeBaseStatus}
                disabled={savingStatus}
              >
                {savingStatus ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
                {selectedKnowledgeBase.status === "active" ? "停用" : "启用"}
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-soft)]">
            <CardContent className="p-4">
              <Image
                src={KNOWLEDGE_VISUAL_SRC}
                alt="知识库视觉"
                width={480}
                height={180}
                className="h-32 w-full rounded-xl object-cover"
              />
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden shadow-[var(--shadow-soft)]">
            <CardHeader className="shrink-0">
              <h2 className="text-sm font-semibold">最近更新</h2>
            </CardHeader>
            <CardContent>
              <StateRow label="时间" value={formatTimestamp(selectedKnowledgeBase.updated_at)} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function BoundaryTrainingWorkspace({
  knowledgeBases,
  selectedKnowledgeBaseId,
  onSelect,
}: {
  knowledgeBases: KnowledgeBase[];
  selectedKnowledgeBaseId: string;
  onSelect: (knowledgeBaseId: string) => void;
}) {
  const selectedKnowledgeBase =
    knowledgeBases.find((item) => item.id === selectedKnowledgeBaseId) ?? knowledgeBases[0] ?? DEFAULT_KNOWLEDGE_BASE;
  const [items, setItems] = useState<BoundaryDatasetItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const [manualLabel, setManualLabel] = useState<0 | 1>(1);
  const [editText, setEditText] = useState("");
  const [editLabel, setEditLabel] = useState<0 | 1>(1);
  const [aiCount, setAiCount] = useState(8);
  const [aiHint, setAiHint] = useState("");
  const [notice, setNotice] = useState("样本用于识别可回答范围。");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [swipedItemId, setSwipedItemId] = useState<string | null>(null);
  const pointerStartRef = useRef<{ id: string; x: number } | null>(null);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;
  const approvedCount = items.filter((item) => item.status === "approved").length;
  const draftCount = items.filter((item) => item.status === "draft").length;

  const refreshItems = useCallback(async () => {
    if (!selectedKnowledgeBase.id) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}/boundary-items`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "样本加载失败。"));
      }
      const nextItems = (await response.json()) as BoundaryDatasetItem[];
      setItems(nextItems);
      setSelectedItemId((current) => current ?? nextItems[0]?.id ?? null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "样本加载失败。");
    } finally {
      setLoading(false);
    }
  }, [selectedKnowledgeBase.id]);

  useEffect(() => {
    setSelectedItemId(null);
    void refreshItems();
  }, [refreshItems]);

  useEffect(() => {
    if (selectedItem) {
      setEditText(selectedItem.text);
      setEditLabel(selectedItem.label);
    } else {
      setEditText("");
      setEditLabel(1);
    }
  }, [selectedItem?.id, selectedItem?.label, selectedItem?.text]);

  async function createManualItem() {
    const text = manualText.trim();
    if (!text) {
      setNotice("请输入样本文本。");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}/boundary-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, label: manualLabel }),
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "样本添加失败。"));
      }
      const created = (await response.json()) as BoundaryDatasetItem;
      setItems((current) => [created, ...current]);
      setSelectedItemId(created.id);
      setManualText("");
      setNotice("样本已添加。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "样本添加失败。");
    } finally {
      setSaving(false);
    }
  }

  async function saveSelectedItem() {
    if (!selectedItem) {
      return;
    }
    const text = editText.trim();
    if (!text) {
      setNotice("样本文本不能为空。");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}/boundary-items/${selectedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, label: editLabel, status: "approved" }),
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "样本保存失败。"));
      }
      const updated = (await response.json()) as BoundaryDatasetItem;
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice("样本已保存。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "样本保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function generateItems() {
    setGenerating(true);
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}/boundary-items/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: aiCount, label_hint: aiHint.trim() }),
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "智能扩充失败。"));
      }
      const generatedItems = (await response.json()) as BoundaryDatasetItem[];
      setItems((current) => [...generatedItems, ...current]);
      setSelectedItemId(generatedItems[0]?.id ?? selectedItemId);
      setNotice(`${generatedItems.length} 条候选样本已生成。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "智能扩充失败。");
    } finally {
      setGenerating(false);
    }
  }

  async function deleteItem(itemId: string) {
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}/boundary-items/${itemId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "样本删除失败。"));
      }
      setItems((current) => {
        const nextItems = current.filter((item) => item.id !== itemId);
        if (selectedItemId === itemId) {
          setSelectedItemId(nextItems[0]?.id ?? null);
        }
        return nextItems;
      });
      setSwipedItemId(null);
      setNotice("样本已删除。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "样本删除失败。");
    }
  }

  const visibleItems = items.slice(0, 8);

  return (
    <section className="h-full min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-5 lg:px-6 lg:py-5">
      <div className="mx-auto grid h-full max-w-[1440px] min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <div className="grid min-h-0 grid-rows-[190px_auto_minmax(0,1fr)] gap-4">
          <VisualHero
            image={BOUNDARY_VISUAL_SRC}
            eyebrow="Boundary"
            title="边界训练"
            description="维护范围内外样本，让问答边界更稳。"
          />
          <Card className="shadow-[var(--shadow-soft)]">
            <CardContent className="space-y-3 p-4">
              <label className="text-xs font-medium text-[var(--muted)]" htmlFor="boundary-kb-select">
                当前知识库
              </label>
              <select
                id="boundary-kb-select"
                value={selectedKnowledgeBase.id}
                onChange={(event) => onSelect(event.target.value)}
                className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm font-medium outline-none transition focus:border-[var(--accent)]"
              >
                {knowledgeBases.map((knowledgeBase) => (
                  <option key={knowledgeBase.id} value={knowledgeBase.id}>
                    {knowledgeBase.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="样本" value={`${items.length}`} />
                <MiniStat label="确认" value={`${approvedCount}`} />
                <MiniStat label="待审" value={`${draftCount}`} />
              </div>
            </CardContent>
          </Card>
          <Card className="min-h-0 overflow-hidden shadow-[var(--shadow-soft)]">
            <CardHeader className="shrink-0">
              <h2 className="text-sm font-semibold">手动添加</h2>
              <p className="text-xs text-[var(--muted)]">录入真实用户问题</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <BoundaryLabelToggle value={manualLabel} onChange={setManualLabel} />
              <textarea
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
                placeholder="例如：校园卡丢了怎么办？"
                rows={4}
                className="w-full resize-none rounded-xl border border-[var(--border)] bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
              />
              <Button type="button" variant="primary" className="w-full justify-center" onClick={createManualItem} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                添加
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="flex min-h-0 flex-col overflow-hidden shadow-[var(--shadow-soft)]">
          <CardHeader className="shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">样本卡片</h2>
                <p className="text-xs text-[var(--muted)]">{notice}</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => void refreshItems()} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                刷新
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-4">
            {visibleItems.length ? (
              <div className="grid h-full min-h-0 auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2">
                {visibleItems.map((item) => (
                  <BoundaryItemCard
                    key={item.id}
                    item={item}
                    active={selectedItem?.id === item.id}
                    swiped={swipedItemId === item.id}
                    onSelect={() => {
                      setSelectedItemId(item.id);
                      setSwipedItemId(null);
                    }}
                    onDelete={() => void deleteItem(item.id)}
                    onPointerStart={(x) => {
                      pointerStartRef.current = { id: item.id, x };
                    }}
                    onPointerEnd={(x) => {
                      const start = pointerStartRef.current;
                      if (start?.id === item.id && start.x - x > 46) {
                        setSwipedItemId(item.id);
                      } else if (start?.id === item.id && x - start.x > 20) {
                        setSwipedItemId(null);
                      }
                      pointerStartRef.current = null;
                    }}
                  />
                ))}
              </div>
            ) : (
              <PanelEmpty icon={BrainCircuit} title="等待样本" description="添加或智能扩充后即可训练边界。" />
            )}
          </CardContent>
        </Card>

        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4">
          <Card className="shadow-[var(--shadow-soft)]">
            <CardHeader>
              <h2 className="text-sm font-semibold">智能扩充</h2>
              <p className="text-xs text-[var(--muted)]">基于当前知识库生成候选样本</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-[1fr_92px] gap-2">
                <input
                  value={aiHint}
                  onChange={(event) => setAiHint(event.target.value)}
                  placeholder="类别提示"
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--accent)]"
                />
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={aiCount}
                  aria-label="生成数量"
                  onChange={(event) => setAiCount(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
                  className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--accent)]"
                />
              </div>
              <Button type="button" variant="primary" className="w-full justify-center" onClick={generateItems} disabled={generating}>
                {generating ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
                生成候选
              </Button>
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden shadow-[var(--shadow-soft)]">
            <CardHeader className="shrink-0">
              <h2 className="text-sm font-semibold">编辑样本</h2>
              <p className="text-xs text-[var(--muted)]">点击卡片后可调整内容</p>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-col gap-3">
              {selectedItem ? (
                <>
                  <div className="rounded-2xl border border-[var(--accent-soft)] bg-[linear-gradient(180deg,#ffffff_0%,#f4fbf9_100%)] p-3 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <StatusChip
                        label={selectedItem.status === "approved" ? "已确认" : "待确认"}
                        tone={selectedItem.status === "approved" ? "ok" : "warning"}
                      />
                      <span className="text-xs text-[var(--muted)]">{selectedItem.source === "llm" ? "智能" : "手动"}</span>
                    </div>
                    <BoundaryLabelToggle value={editLabel} onChange={setEditLabel} />
                    <textarea
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      rows={7}
                      className="mt-3 w-full flex-1 resize-none rounded-xl border border-[var(--border)] bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Button type="button" variant="primary" className="justify-center" onClick={saveSelectedItem} disabled={saving}>
                      {saving ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                      保存
                    </Button>
                    <Button type="button" variant="secondary" size="icon" title="删除样本" onClick={() => void deleteItem(selectedItem.id)}>
                      <X size={15} aria-hidden="true" />
                    </Button>
                  </div>
                </>
              ) : (
                <PanelEmpty icon={PenLine} title="选择样本" description="点击左侧卡片进行编辑。" />
              )}
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-soft)]">
            <CardContent className="grid grid-cols-3 gap-2 p-3">
              <MiniStat label="范围内" value={`${items.filter((item) => item.label === 1).length}`} />
              <MiniStat label="范围外" value={`${items.filter((item) => item.label === 0).length}`} />
              <MiniStat label="显示" value={`${visibleItems.length}`} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function QualityAnalyticsWorkspace({ feedbackStats }: { feedbackStats: FeedbackStats }) {
  const [selectedReview, setSelectedReview] = useState(QUALITY_REVIEWS[0].title);
  const positiveRate =
    feedbackStats.total > 0
      ? `${Math.round((feedbackStats.positive / feedbackStats.total) * 100)}%`
      : "待积累";
  const liveMetrics = [
    { label: "引用命中率", value: "92.4%", detail: "近 7 天稳定", icon: FileCheck2 },
    { label: "用户正反馈", value: positiveRate, detail: `${feedbackStats.total} 条反馈已沉淀`, icon: ThumbsUp },
    { label: "收藏回答", value: `${feedbackStats.favorites}`, detail: "可沉淀为优质样例", icon: Star },
    { label: "待优化反馈", value: `${feedbackStats.negative}`, detail: "进入复核队列", icon: ThumbsDown },
  ];

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 lg:px-6 lg:py-5">
      <div className="mx-auto grid max-w-[1400px] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[linear-gradient(135deg,#ffffff_0%,#f5faf8_100%)] p-5 shadow-[var(--shadow-panel)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <div className="mb-3 inline-flex h-8 items-center gap-2 rounded-full border border-[var(--border)] bg-white/78 px-3 text-xs font-medium text-[var(--accent-strong)] shadow-sm">
                  <BarChart3 size={14} aria-hidden="true" />
                  Quality Intelligence
                </div>
                <h1 className="text-2xl font-semibold tracking-normal sm:text-[30px]">质量分析中心</h1>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  汇总回答质量、引用可信度与边界拦截表现，帮助管理员持续优化知识治理闭环。
                </p>
              </div>
              <Button type="button" variant="secondary">
                <FileCheck2 size={16} aria-hidden="true" />
                查看复核项
              </Button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {liveMetrics.map((metric) => (
                <QualityMetricCard key={metric.label} metric={metric} />
              ))}
            </div>
          </div>

          <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">可信回答趋势</h2>
                  <p className="text-xs text-[var(--muted)]">按天汇总引用完整度与用户反馈</p>
                </div>
                <span className="rounded-full border border-[var(--accent-soft)] bg-[var(--accent-tint)] px-2.5 py-1 text-xs font-medium text-[var(--accent-strong)]">
                  近 7 天
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid min-h-[260px] gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                <div className="flex items-end gap-2 rounded-lg border border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfc_100%)] p-4">
                  {QUALITY_TRENDS.map((item) => (
                    <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div className="flex h-40 w-full items-end rounded-full bg-[var(--panel-strong)] p-1">
                        <div
                          className="w-full rounded-full bg-[linear-gradient(180deg,#0d8b7f_0%,#006c63_100%)] shadow-[0_10px_24px_rgba(0,108,99,0.18)] transition-all duration-500 ease-out"
                          style={{ height: `${item.value}%` }}
                        />
                      </div>
                      <span className="text-xs text-[var(--muted)]">{item.label}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold">本周洞察</h3>
                  <div className="mt-4 space-y-3">
                    <QualityInsight icon={CheckCircle2} label="引用完整度提升" value="+8.6%" />
                    <QualityInsight icon={ShieldCheck} label="越界拦截稳定" value="正常" />
                    <QualityInsight icon={Clock3} label="响应耗时下降" value="-0.4s" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="shadow-[var(--shadow-soft)]">
            <CardHeader>
              <h2 className="text-sm font-semibold">待复核回答</h2>
              <p className="text-xs text-[var(--muted)]">优先处理影响引用可信度的问题</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {QUALITY_REVIEWS.map((review) => (
                  <button
                    key={review.title}
                    type="button"
                    onClick={() => setSelectedReview(review.title)}
                    className={cn(
                      "w-full rounded-lg border bg-white px-3 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md",
                      selectedReview === review.title ? "border-[var(--accent)]" : "border-[var(--border)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{review.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{review.issue}</p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                          review.priority === "高"
                            ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                            : "bg-[var(--warning-soft)] text-[var(--warning)]",
                        )}
                      >
                        {review.priority}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {review.owner} · {review.status}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-soft)]">
            <CardHeader>
              <h2 className="text-sm font-semibold">治理建议</h2>
              <p className="text-xs text-[var(--muted)]">面向管理员的持续优化动作</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <QualityAction title="合并重复引用" description="减少相同片段在回答中的重复展示。" />
                <QualityAction title="更新低频资料" description="优先复核最近命中但版本较旧的文档。" />
                <QualityAction title="观察边界问题" description="将高频超范围问题沉淀为后续知识建设线索。" />
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function ProductSidebar({
  open,
  onClose,
  sessionId,
  latestQuestion,
  sessions,
  onNewSession,
  onOpenSession,
  user,
  isAdmin,
  activeView,
  collapsed,
  onChangeView,
  onToggleCollapse,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  latestQuestion?: string;
  sessions: ChatSessionSummary[];
  onNewSession: () => void;
  onOpenSession: (sessionId: string) => void;
  user: AuthUser;
  isAdmin: boolean;
  activeView: WorkspaceView;
  collapsed: boolean;
  onChangeView: (view: WorkspaceView) => void;
  onToggleCollapse: () => void;
  onSignOut: () => void;
}) {
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

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
          "product-sidebar fixed inset-y-0 left-0 z-50 flex w-[292px] flex-col overflow-hidden border-r border-[var(--border)] bg-[linear-gradient(180deg,#fbfdfe_0%,#f3f8fa_100%)] shadow-xl transition-all duration-300 ease-out lg:static lg:z-auto lg:h-full lg:translate-x-0 lg:overflow-visible lg:shadow-none",
          collapsed ? "product-sidebar--collapsed" : "",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className={cn("flex h-16 shrink-0 items-center border-b border-[var(--border)] px-3", collapsed ? "lg:justify-center" : "justify-between")}>
          <div className={cn("flex min-w-0 items-center gap-3", collapsed ? "lg:hidden" : "")}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(145deg,#0a877a_0%,#03433f_100%)] text-white shadow-md shadow-teal-950/10">
              <BookOpenText size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">xyfRAG</h2>
              <p className="truncate text-xs text-[var(--muted)]">产业级知识问答中枢</p>
            </div>
          </div>
          <button
            type="button"
            className={cn(
              "hidden h-9 w-9 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--foreground)] lg:flex",
              collapsed ? "" : "border border-[var(--border)] bg-white/70",
            )}
            onClick={onToggleCollapse}
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            title={collapsed ? "展开侧栏" : "收起侧栏"}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--panel-strong)] lg:hidden"
            onClick={onClose}
            aria-label="关闭导航"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className={cn("shrink-0 px-3 py-3", collapsed ? "lg:px-2" : "")}>
            {collapsed ? (
              <button
                type="button"
                onClick={onNewSession}
                className="group relative hidden h-10 w-full items-center justify-center rounded-lg text-slate-700 transition hover:bg-white hover:text-slate-950 hover:shadow-sm lg:flex"
                aria-label="新建问答"
                title="新建问答"
              >
                <PenLine size={18} strokeWidth={2.1} aria-hidden="true" />
                <IconTooltip label="新建问答" />
              </button>
            ) : (
              <Button type="button" variant="primary" className="w-full justify-center" onClick={onNewSession}>
                <Plus size={15} aria-hidden="true" />
                新建问答
              </Button>
            )}

            <nav className={cn("space-y-1", collapsed ? "lg:mt-2" : "mt-5")}>
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeView;
                return collapsed ? (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeView(item.id)}
                    className={cn(
                      "group relative hidden h-10 w-full items-center justify-center rounded-lg transition lg:flex",
                      active
                        ? "bg-white text-[var(--accent-strong)] shadow-sm"
                        : "text-slate-700 hover:bg-white hover:text-slate-950 hover:shadow-sm",
                    )}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <Icon size={18} strokeWidth={2.1} aria-hidden="true" />
                    <IconTooltip label={item.label} />
                  </button>
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeView(item.id)}
                    className={cn(
                      "flex h-10 w-full items-center justify-between rounded-md px-3 text-sm font-medium transition-all",
                      active
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
          </div>

          <div className={cn("min-h-0 flex-1 overflow-y-auto px-3 pb-4", collapsed ? "lg:hidden" : "")}>
            <div>
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
                {sessions.length ? sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onOpenSession(session.id)}
                    className="w-full rounded-md border border-[var(--border)] bg-white/72 px-3 py-2 text-left shadow-sm transition hover:border-[var(--border-strong)] hover:bg-white"
                  >
                    <span className="block truncate text-sm text-[var(--foreground)]">
                      {session.title}
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                      <span>{formatRelativeTime(session.updatedAt)}</span>
                      <span className="min-w-0 truncate">
                        {session.knowledgeBaseName ?? `${session.turnCount} 轮`}
                      </span>
                    </span>
                  </button>
                )) : (
                  <div className="rounded-lg border border-dashed border-[var(--border)] bg-white/58 px-3 py-4 text-sm text-[var(--muted)]">
                    完成一次问答后，会话会自动保存在这里。
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={cn("shrink-0 border-t border-[var(--border)] p-3", collapsed ? "lg:px-2" : "")}>
          {collapsed ? (
            <button
              type="button"
              onClick={onSignOut}
              className="group relative hidden h-10 w-full items-center justify-center rounded-lg bg-white text-[var(--accent-strong)] shadow-sm transition hover:bg-[var(--panel-strong)] lg:flex"
              aria-label={`${user.name} · 退出登录`}
              title={`${user.name} · 退出登录`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold">
                {user.name.slice(0, 1)}
              </span>
              <IconTooltip label={`${user.name} · 退出登录`} />
            </button>
          ) : (
            <div className="rounded-lg border border-[var(--border)] bg-white/82 p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                  <ShieldCheck size={15} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {user.role === "admin" ? "管理员" : "普通用户"} · {user.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--foreground)]"
                  title="退出登录"
                >
                  <LogOut size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function ProductHeader({
  health,
  healthOk,
  user,
  onSignOut,
  onOpenSidebar,
  sidebarCollapsed,
  onExpandSidebar,
}: {
  health: BackendHealth | null;
  healthOk: boolean;
  user: AuthUser;
  onSignOut: () => void;
  onOpenSidebar: () => void;
  sidebarCollapsed: boolean;
  onExpandSidebar: () => void;
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
          {sidebarCollapsed ? (
            <button
              type="button"
              className="hidden h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-white text-[var(--muted)] shadow-sm transition hover:bg-[var(--panel-strong)] hover:text-[var(--foreground)] lg:flex"
              onClick={onExpandSidebar}
              aria-label="展开侧栏"
              title="展开侧栏"
            >
              <Menu size={18} aria-hidden="true" />
            </button>
          ) : null}
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
          <HealthPill ok={healthOk} label={health?.app ?? "xyfRAG"} />
          <Button type="button" variant="secondary" size="sm" title={`${user.name} · 退出登录`} onClick={onSignOut}>
            <LogOut size={15} aria-hidden="true" />
            <span className="hidden max-w-[96px] truncate sm:inline">{user.name}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function IconTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-[80] hidden -translate-y-1/2 whitespace-nowrap rounded-full bg-black px-3 py-1.5 text-sm font-semibold text-white opacity-0 shadow-[0_10px_28px_rgba(15,23,42,0.22)] transition-all duration-200 ease-out group-hover:translate-x-0.5 group-hover:opacity-100 lg:block">
      {label}
    </span>
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

function VisualHero({
  image,
  eyebrow,
  title,
  description,
}: {
  image: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[var(--shadow-soft)]">
      <Image src={image} alt="" fill sizes="360px" className="object-cover opacity-90" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.94)_0%,rgba(255,255,255,0.74)_54%,rgba(255,255,255,0.28)_100%)]" />
      <div className="relative flex h-full flex-col justify-end p-4">
        <span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--border)] bg-white/78 px-2.5 py-1 text-[11px] font-medium text-[var(--accent-strong)] shadow-sm backdrop-blur">
          <Sparkles size={12} aria-hidden="true" />
          {eyebrow}
        </span>
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-1 max-w-[240px] text-xs leading-5 text-[var(--muted)]">{description}</p>
      </div>
    </div>
  );
}

function CompactDocumentRow({ document }: { document: KnowledgeDocument }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--accent-tint)] text-[var(--accent-strong)]">
          <FileText size={16} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{document.title}</p>
          <p className="truncate text-xs text-[var(--muted)]">
            {document.filename} · {formatFileSize(document.size)}
          </p>
        </div>
      </div>
      <StatusChip label={document.status === "indexed" ? "已入库" : "待索引"} tone={document.status === "indexed" ? "ok" : "muted"} />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white/82 px-2 py-2 text-center shadow-sm">
      <p className="truncate text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function KnowledgeBaseSelect({
  knowledgeBases,
  selectedId,
  onSelect,
}: {
  knowledgeBases: KnowledgeBase[];
  selectedId: string;
  onSelect: (knowledgeBaseId: string) => void;
}) {
  const visibleKnowledgeBases = knowledgeBases.filter((item) => item.status === "active");
  const options = visibleKnowledgeBases.length ? visibleKnowledgeBases : knowledgeBases;

  return (
    <label className="hidden h-8 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-2 text-xs text-[var(--muted)] shadow-sm sm:flex">
      <Database size={14} className="text-[var(--accent)]" aria-hidden="true" />
      <select
        value={selectedId}
        aria-label="选择知识库"
        onChange={(event) => onSelect(event.target.value)}
        className="max-w-[180px] bg-transparent text-xs font-medium text-[var(--foreground)] outline-none"
      >
        {options.map((knowledgeBase) => (
          <option key={knowledgeBase.id} value={knowledgeBase.id}>
            {knowledgeBase.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusChip({ label, tone = "muted" }: { label: string; tone?: "ok" | "muted" | "warning" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "ok"
          ? "border-[var(--accent-soft)] bg-[var(--accent-tint)] text-[var(--accent-strong)]"
          : tone === "warning"
            ? "border-[var(--warning-soft)] bg-[var(--warning-soft)] text-[var(--warning)]"
            : "border-[var(--border)] bg-[var(--panel-muted)] text-[var(--muted)]",
      )}
    >
      {label}
    </span>
  );
}

function BoundaryLabelToggle({
  value,
  onChange,
}: {
  value: 0 | 1;
  onChange: (value: 0 | 1) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] p-1">
      {[
        { value: 1 as const, label: "范围内" },
        { value: 0 as const, label: "范围外" },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 rounded-md text-xs font-semibold transition",
            value === option.value
              ? "bg-white text-[var(--accent-strong)] shadow-sm"
              : "text-[var(--muted)] hover:bg-white/72 hover:text-[var(--foreground)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function BoundaryItemCard({
  item,
  active,
  swiped,
  onSelect,
  onDelete,
  onPointerStart,
  onPointerEnd,
}: {
  item: BoundaryDatasetItem;
  active: boolean;
  swiped: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onPointerStart: (x: number) => void;
  onPointerEnd: (x: number) => void;
}) {
  return (
    <div className="relative min-h-0 overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={onDelete}
        className="absolute inset-y-0 right-0 flex w-16 items-center justify-center rounded-2xl bg-[var(--danger)] text-white shadow-sm"
        aria-label="删除样本"
      >
        <X size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        onPointerDown={(event) => onPointerStart(event.clientX)}
        onPointerUp={(event) => onPointerEnd(event.clientX)}
        onPointerCancel={(event) => onPointerEnd(event.clientX)}
        className={cn(
          "relative flex h-full min-h-[118px] w-full flex-col justify-between rounded-2xl border bg-white p-4 text-left shadow-sm transition duration-300 ease-out",
          active ? "border-[var(--accent)] shadow-[0_20px_48px_rgba(0,108,99,0.14)]" : "border-[var(--border)] hover:border-[var(--accent-soft)] hover:shadow-md",
          active ? "scale-[1.01]" : "",
          swiped ? "-translate-x-14" : "translate-x-0",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <StatusChip label={item.label === 1 ? "范围内" : "范围外"} tone={item.label === 1 ? "ok" : "warning"} />
          <span className="text-[11px] text-[var(--muted)]">{item.source === "llm" ? "智能" : "手动"}</span>
        </div>
        <p className="mt-3 line-clamp-2 text-sm font-medium leading-6">{item.text}</p>
        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
          <span>{item.status === "approved" ? "已确认" : "待确认"}</span>
          <span>{formatTimestamp(item.created_at)}</span>
        </div>
      </button>
    </div>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-white/72 px-3 py-2">
      <span className="truncate text-xs text-[var(--muted)]">{label}</span>
      <span className="shrink-0 text-sm font-semibold">{value}</span>
    </div>
  );
}

function QualityMetricCard({
  metric,
}: {
  metric: QualityMetric;
}) {
  const Icon = metric.icon;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white/84 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-[var(--muted)]">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold leading-none">{metric.value}</p>
          <p className="mt-2 truncate text-xs text-[var(--muted)]">{metric.detail}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--accent-tint)] text-[var(--accent-strong)]">
          <Icon size={17} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function QualityInsight({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--muted)]">
        <Icon size={15} className="shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold">{value}</span>
    </div>
  );
}

function QualityAction({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-tint)] text-[var(--accent-strong)]">
          <CheckCircle2 size={14} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p>
        </div>
      </div>
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
  onFeedback,
  onToggleFavorite,
}: {
  message: ChatMessage;
  copied: boolean;
  onCopy: () => void;
  onFeedback: (rating: FeedbackRating) => void;
  onToggleFavorite: () => void;
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
            <IconAction
              label={message.favorite ? "已收藏" : "收藏回答"}
              icon={Star}
              active={Boolean(message.favorite)}
              onClick={onToggleFavorite}
            />
            <IconAction
              label={message.feedback?.rating === "up" ? "已记录有帮助" : "回答有帮助"}
              icon={ThumbsUp}
              active={message.feedback?.rating === "up"}
              onClick={() => onFeedback("up")}
            />
            <IconAction
              label={message.feedback?.rating === "down" ? "已加入复核" : "回答待改进"}
              icon={ThumbsDown}
              active={message.feedback?.rating === "down"}
              onClick={() => onFeedback("down")}
            />
            {message.feedback ? (
              <span role="status" className="ml-1 rounded-full bg-[var(--panel-strong)] px-2 py-1 text-xs text-[var(--muted)]">
                {message.feedback.rating === "up" ? "反馈已记录" : "已进入复核"}
              </span>
            ) : null}
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
  active = false,
}: {
  label: string;
  icon: typeof Copy;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[var(--panel-strong)] hover:text-[var(--foreground)]",
        active ? "bg-[var(--accent-tint)] text-[var(--accent-strong)]" : "text-[var(--muted)]",
      )}
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

function SourcePanel({
  sources,
  knowledgeBases,
}: {
  sources: Source[];
  knowledgeBases: KnowledgeBase[];
}) {
  const nameById = new Map(knowledgeBases.map((knowledgeBase) => [knowledgeBase.id, knowledgeBase.name]));

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
                      {source.knowledge_base_id ? `${nameById.get(source.knowledge_base_id) ?? "知识库"} · ` : ""}
                      匹配度 {source.score.toFixed(3)}
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
  feedbackStats,
}: {
  events: ChatStatusPayload[];
  metadata: {
    rewritten_query?: string;
    boundary?: { is_in_scope: boolean; probability: number; reason: string };
    timings?: { llm_elapsed_seconds: number; total_elapsed_seconds: number };
    used_llm?: boolean;
  };
  feedbackStats: FeedbackStats;
}) {
  const statusByStage = new Map(events.map((event) => [event.stage, event]));
  const activeStage = (events.at(-1)?.stage ?? "idle") as TraceStage;
  const activeIndex = PROCESS_STAGES.findIndex((stage) => stage.id === activeStage);
  const complete = activeStage === "complete";
  const displayStage =
    PROCESS_STAGES.find((stage) => stage.id === activeStage) ?? {
      id: "idle" as const,
      label: "流程待命",
      description: "提交问题后，系统会实时推进检索与生成。",
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
                <TracePill label="模式" value={metadata.used_llm ? "增强生成" : "快速生成"} />
                <TracePill label="反馈" value={feedbackStats.total ? `${feedbackStats.positive}/${feedbackStats.total}` : "-"} />
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

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function indexStatusLabel(status: KnowledgeBase["index_status"]) {
  const labels: Record<KnowledgeBase["index_status"], string> = {
    not_indexed: "待构建",
    pending: "待索引",
    building: "构建中",
    ready: "可问答",
    failed: "需处理",
  };
  return labels[status];
}

function formatTimestamp(timestamp?: number | null) {
  if (!timestamp) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp * 1000);
}

async function readResponseError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { detail?: string; error?: string };
    return data.detail || data.error || fallback;
  } catch {
    return fallback;
  }
}

function formatRelativeTime(timestamp: number) {
  const elapsed = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < minute) {
    return "刚刚";
  }
  if (elapsed < hour) {
    return `${Math.floor(elapsed / minute)} 分钟前`;
  }
  if (elapsed < day) {
    return `${Math.floor(elapsed / hour)} 小时前`;
  }
  if (elapsed < day * 7) {
    return `${Math.floor(elapsed / day)} 天前`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}
