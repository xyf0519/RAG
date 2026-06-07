"use client";

import {
  Activity,
  Archive,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Copy,
  Database,
  FilePlus2,
  FileText,
  HelpCircle,
  HeartPulse,
  History,
  Layers3,
  Loader2,
  LogOut,
  Menu,
  MessageSquareText,
  Mic,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UploadCloud,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginScreen } from "@/features/auth/login-screen";
import { useAuth } from "@/features/auth/auth-provider";
import { useRagChatStream } from "@/features/chat/use-rag-chat-stream";
import { cn, formatSeconds } from "@/shared/lib/utils";
import type { AuthUser, UserRole } from "@/shared/types/auth";
import type {
  BackendHealth,
  ChatMessage,
  ChatSessionSummary,
  ChatStatusPayload,
  FeedbackRating,
  BoundaryDatasetItem,
  ClassifierModel,
  IndexJob,
  KnowledgeBase,
  KnowledgeDocument,
  Source,
} from "@/shared/types/chat";

type WorkspaceView = "chat" | "knowledge" | "boundary" | "users";

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
  { id: "users", label: "用户运维", icon: Users, badge: "权限", adminOnly: true },
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
const BOUNDARY_VISUAL_SRC = "/images/boundary-training-visual-v2.png";
const CHAT_BACKGROUND_SRC = "/images/background.png";
const PRODUCT_NAME = "Maverella";
const ADMIN_CONTACT_EMAIL = "xinyufei@zju.edu.cn";

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
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [copiedAnswerId, setCopiedAnswerId] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chat");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([DEFAULT_KNOWLEDGE_BASE]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState(DEFAULT_KNOWLEDGE_BASE.id);
  const [knowledgeNotice, setKnowledgeNotice] = useState("知识库运维状态正常。");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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
    if (view === "chat") {
      setSidebarCollapsed(false);
    } else {
      window.setTimeout(() => setSidebarCollapsed(true), sidebarCollapsed ? 0 : 140);
    }
  }

  function startNewSession() {
    chat.newSession();
    setWorkspaceView("chat");
    setSidebarOpen(false);
    setSidebarCollapsed(false);
  }

  function openStoredSession(nextSessionId: string) {
    chat.openSession(nextSessionId);
    const session = chat.sessions.find((item) => item.id === nextSessionId);
    if (session?.knowledgeBaseId) {
      setSelectedKnowledgeBaseId(session.knowledgeBaseId);
    }
    setWorkspaceView("chat");
    setSidebarOpen(false);
    setSidebarCollapsed(false);
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
    <main className="h-[100svh] overflow-hidden bg-[var(--background)] text-[var(--foreground)] lg:h-screen">
      <div className="flex h-full min-h-0">
        <ProductSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          sessionId={chat.sessionId}
          latestQuestion={latestQuestion?.content}
          sessions={chat.sessions}
          knowledgeBases={knowledgeBases}
          selectedKnowledgeBaseId={selectedKnowledgeBase.id}
          onNewSession={startNewSession}
          onOpenSession={openStoredSession}
          onSelectKnowledgeBase={setSelectedKnowledgeBaseId}
          user={auth.user}
          isAdmin={auth.isAdmin}
          activeView={workspaceView}
          collapsed={sidebarCollapsed}
          onChangeView={changeWorkspaceView}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
          onSignOut={auth.signOut}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300 ease-out">
          <ProductHeader
            health={health}
            healthOk={healthOk}
            user={auth.user}
            onSignOut={auth.signOut}
            onOpenSidebar={() => setSidebarOpen(true)}
            onOpenHelp={() => setHelpOpen(true)}
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
          {workspaceView === "users" && auth.isAdmin ? <UserOperationsWorkspace currentUser={auth.user} /> : null}
          {workspaceView === "chat" || !auth.isAdmin ? (
            <ChatWorkspaceView
              chat={chat}
              input={input}
              user={auth.user}
              mobileTab={mobileTab}
              currentSources={currentSources}
              knowledgeBases={knowledgeBases}
              selectedKnowledgeBase={selectedKnowledgeBase}
              latestMetadata={latestMetadata}
              feedbackStats={feedbackStats}
              copiedAnswerId={copiedAnswerId}
              sourcesCollapsed={sourcesCollapsed}
              onInput={setInput}
              onMobileTab={setMobileTab}
              onSelectKnowledgeBase={setSelectedKnowledgeBaseId}
              onToggleSources={() => setSourcesCollapsed((value) => !value)}
              onSubmit={onSubmit}
              onCopyAnswer={(message) => void copyAnswer(message)}
              onFeedback={submitFeedback}
              onToggleFavorite={chat.toggleFavorite}
            />
          ) : null}
        </div>
      </div>
      {settingsOpen ? (
        <AccountSettingsModal
          user={auth.user}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {helpOpen ? <UserGuideModal onClose={() => setHelpOpen(false)} /> : null}
    </main>
  );
}

function ChatWorkspaceView({
  chat,
  input,
  user,
  mobileTab,
  currentSources,
  knowledgeBases,
  selectedKnowledgeBase,
  latestMetadata,
  feedbackStats,
  copiedAnswerId,
  sourcesCollapsed,
  onInput,
  onMobileTab,
  onSelectKnowledgeBase,
  onToggleSources,
  onSubmit,
  onCopyAnswer,
  onFeedback,
  onToggleFavorite,
}: {
  chat: ReturnType<typeof useRagChatStream>;
  input: string;
  user: AuthUser;
  mobileTab: MobileTab;
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
  sourcesCollapsed: boolean;
  onInput: (value: string) => void;
  onMobileTab: (tab: MobileTab) => void;
  onSelectKnowledgeBase: (knowledgeBaseId: string) => void;
  onToggleSources: () => void;
  onSubmit: (event: FormEvent) => void;
  onCopyAnswer: (message: ChatMessage) => void;
  onFeedback: (message: ChatMessage, rating: FeedbackRating) => void;
  onToggleFavorite: (messageId: string) => void;
}) {
  return (
    <div className="mobile-chat-shell relative min-h-0 flex-1 overflow-hidden">
      <Image src={CHAT_BACKGROUND_SRC} alt="" fill priority sizes="100vw" className="object-cover opacity-70" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(248,252,253,0.92)_54%,rgba(222,239,254,0.90)_100%)] lg:bg-[linear-gradient(180deg,rgba(249,251,252,0.72)_0%,rgba(245,249,250,0.90)_62%,rgba(245,249,250,0.96)_100%)]" />
      <div
        className={cn(
          "relative grid h-full min-h-0 grid-cols-1 overflow-hidden px-0 py-0 lg:gap-4 lg:px-5 lg:py-4",
          sourcesCollapsed
            ? "lg:grid-cols-[minmax(0,1fr)_56px]"
            : "lg:grid-cols-[minmax(0,1fr)_392px]",
        )}
      >
        <section className="mobile-chat-panel relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-white/0 lg:rounded-2xl lg:border lg:border-white/70 lg:bg-white/62 lg:shadow-[0_24px_80px_rgba(15,23,42,0.10)] lg:backdrop-blur-xl">
          <div className="hidden h-14 shrink-0 items-center justify-between gap-3 border-b border-white/70 px-4 lg:flex">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold">{PRODUCT_NAME}</h1>
                <StatusBadge status={chat.status} />
              </div>
              <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                {selectedKnowledgeBase.name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <KnowledgeBaseSelect
                knowledgeBases={knowledgeBases}
                selectedId={selectedKnowledgeBase.id}
                onSelect={onSelectKnowledgeBase}
              />
              {chat.status === "streaming" ? (
                <Button type="button" variant="danger" size="icon" onClick={chat.stop} title="停止生成" aria-label="停止生成">
                  <Square size={14} aria-hidden="true" />
                </Button>
              ) : (
                <Button type="button" variant="secondary" size="icon" onClick={chat.retry} disabled={!chat.lastError} title="重试" aria-label="重试">
                  <RefreshCw size={14} aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>

          <div className="chat-scroll mobile-chat-scroll flex-1 overflow-y-auto px-4 pb-40 pt-5 sm:px-5 lg:px-4 lg:py-6">
            {chat.messages.length === 0 ? (
              <EmptyState user={user} selectedKnowledgeBase={selectedKnowledgeBase} />
            ) : (
              <div className="mx-auto max-w-3xl space-y-5 lg:space-y-6">
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
          <div className="mx-4 mb-3 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)] lg:rounded-md">
            {chat.lastError.message}
          </div>
        ) : null}

        <Composer input={input} status={chat.status} onInput={onInput} onSubmit={onSubmit} />
      </section>

      <aside
        className={cn(
          "hidden min-h-0 min-w-0 overflow-hidden transition-all duration-300 ease-out lg:grid",
          sourcesCollapsed ? "grid-rows-1" : "gap-3 lg:grid-rows-[minmax(0,1fr)_210px]",
        )}
      >
        {sourcesCollapsed ? (
          <CollapsedRightRail onToggle={onToggleSources} sources={currentSources.length} />
        ) : (
          <>
            <SourcePanel sources={currentSources} knowledgeBases={knowledgeBases} onCollapse={onToggleSources} />
            <ProcessPanel events={chat.events} metadata={latestMetadata} feedbackStats={feedbackStats} />
          </>
        )}
      </aside>

      <section className="hidden min-h-0 overflow-y-auto lg:hidden">
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
  const [classifierModels, setClassifierModels] = useState<ClassifierModel[]>([]);
  const [selectedClassifierModelId, setSelectedClassifierModelId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [indexing, setIndexing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState("");
  const selectedKnowledgeBase =
    knowledgeBases.find((item) => item.id === selectedKnowledgeBaseId) ?? knowledgeBases[0] ?? DEFAULT_KNOWLEDGE_BASE;
  const visibleKnowledgeBases = knowledgeBases.slice(0, 5);
  const selectedClassifierModel =
    classifierModels.find((model) => model.id === selectedClassifierModelId) ?? classifierModels[0] ?? null;
  const selectedClassifierMetrics = parseClassifierModelMetrics(selectedClassifierModel?.metrics_json);

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

  const refreshClassifierModels = useCallback(async () => {
    if (!selectedKnowledgeBase?.id) {
      return;
    }
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}/classifier-models`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "模型列表加载失败。"));
      }
      const models = (await response.json()) as ClassifierModel[];
      setClassifierModels(models);
      setSelectedClassifierModelId((current) => (models.some((model) => model.id === current) ? current : models[0]?.id ?? ""));
    } catch (error) {
      setClassifierModels([]);
      setSelectedClassifierModelId("");
      onNotice(error instanceof Error ? error.message : "模型列表加载失败。");
    }
  }, [onNotice, selectedKnowledgeBase?.id]);

  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  useEffect(() => {
    void refreshClassifierModels();
  }, [refreshClassifierModels]);

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

  async function deleteDocument(document: KnowledgeDocument) {
    if (deletingDocumentId) {
      return;
    }
    const confirmed = window.confirm(`确定删除「${document.title}」吗？删除后需要重新构建索引。`);
    if (!confirmed) {
      return;
    }
    setDeletingDocumentId(document.id);
    try {
      const response = await fetch(
        `/api/knowledge-bases/${encodeURIComponent(selectedKnowledgeBase.id)}/documents/${encodeURIComponent(document.id)}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        throw new Error(await readResponseError(response, "文档删除失败。"));
      }
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      onNotice("文档已删除，请重新构建索引。");
      await onRefresh();
      await refreshDocuments();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "文档删除失败。");
    } finally {
      setDeletingDocumentId("");
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
      <div className="mx-auto grid h-full max-w-[1440px] min-h-0 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_300px]">
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

              <div className="min-h-0 overflow-y-auto pr-1">
                <div className="space-y-2">
                  {documents.length ? documents.map((document) => (
                    <CompactDocumentRow
                      key={document.id}
                      document={document}
                      deleting={deletingDocumentId === document.id}
                      onDelete={() => void deleteDocument(document)}
                    />
                  )) : (
                    <PanelEmpty icon={UploadCloud} title="等待资料" description="上传后即可构建索引。" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="grid min-h-0 content-start gap-4 overflow-hidden">
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

          <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
            <CardHeader className="px-4 py-3">
              <h2 className="text-sm font-semibold">边界模型</h2>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-3">
              {classifierModels.length ? (
                <>
                  <select
                    id="knowledge-model-select"
                    value={selectedClassifierModel?.id ?? ""}
                    onChange={(event) => setSelectedClassifierModelId(event.target.value)}
                    className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm font-medium outline-none transition focus:border-[var(--accent)]"
                  >
                    {classifierModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} · v{model.version}
                      </option>
                    ))}
                  </select>
                  {selectedClassifierModel ? (
                    <div className="boundary-model-status relative overflow-hidden rounded-2xl border border-[var(--accent-soft)] bg-[linear-gradient(135deg,#ffffff_0%,#eefaf8_58%,#f7fbfc_100%)] p-2.5 shadow-sm">
                      <div className="relative flex items-center gap-3">
                        <div className="boundary-model-orb flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#12a594_0%,#006c63_100%)] text-white shadow-[0_16px_32px_rgba(0,108,99,0.22)]">
                          <BrainCircuit size={17} aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{selectedClassifierModel.name}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {classifierScopeLabel(selectedClassifierModel.scope)} · {classifierStatusLabel(selectedClassifierModel.status)}
                          </p>
                        </div>
                      </div>
                      <div className="relative mt-2 grid grid-cols-2 gap-2 text-xs">
                        <StateRow label="准确率" value={formatMetricPercent(selectedClassifierMetrics.accuracy)} />
                        <StateRow label="样本" value={`${selectedClassifierMetrics.sample_count ?? "-"}`} />
                      </div>
                      <div className="relative mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-[var(--accent-soft)] bg-white/80 px-2 py-0.5 text-[11px] font-medium text-[var(--accent-strong)]">
                          @{selectedClassifierModel.alias}
                        </span>
                        <span className="rounded-full border border-[var(--border)] bg-white/80 px-2 py-0.5 text-[11px] text-[var(--muted)]">
                          {formatTimestamp(selectedClassifierModel.created_at)}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel-muted)] p-4 text-sm text-[var(--muted)]">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[var(--accent-strong)] shadow-sm">
                    <BrainCircuit size={16} aria-hidden="true" />
                  </div>
                  暂无可用模型。完成一次边界训练后会显示在这里。
                </div>
              )}
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
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const [manualLabel, setManualLabel] = useState<0 | 1>(1);
  const [editText, setEditText] = useState("");
  const [editLabel, setEditLabel] = useState<0 | 1>(1);
  const [modelName, setModelName] = useState("边界范围模型");
  const [modelScope, setModelScope] = useState<"global" | "knowledge_base" | "session">("knowledge_base");
  const [modelAlias, setModelAlias] = useState("应用版");
  const [trainingJob, setTrainingJob] = useState<IndexJob | null>(null);
  const [aiCount, setAiCount] = useState(8);
  const [aiHint, setAiHint] = useState("");
  const [notice, setNotice] = useState("样本用于识别可回答范围。");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [training, setTraining] = useState(false);
  const [swipedItemId, setSwipedItemId] = useState<string | null>(null);
  const pointerStartRef = useRef<{ id: string; x: number } | null>(null);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;
  const editingItem = items.find((item) => item.id === editingItemId) ?? null;
  const approvedCount = items.filter((item) => item.status === "approved").length;
  const draftCount = items.filter((item) => item.status === "draft").length;
  const approvedInScopeCount = items.filter((item) => item.status === "approved" && item.label === 1).length;
  const approvedOutOfScopeCount = items.filter((item) => item.status === "approved" && item.label === 0).length;
  const draftItems = items.filter((item) => item.status === "draft");

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
    if (editingItem) {
      setEditText(editingItem.text);
      setEditLabel(editingItem.label);
    } else {
      setEditText("");
      setEditLabel(1);
    }
  }, [editingItem?.id, editingItem?.label, editingItem?.text]);

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
    if (!editingItem) {
      return;
    }
    const text = editText.trim();
    if (!text) {
      setNotice("样本文本不能为空。");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}/boundary-items/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, label: editLabel, status: "approved" }),
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "样本保存失败。"));
      }
      const updated = (await response.json()) as BoundaryDatasetItem;
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedItemId(updated.id);
      setEditingItemId(null);
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
      if (editingItemId === itemId) {
        setEditingItemId(null);
      }
      setSwipedItemId(null);
      setNotice("样本已删除。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "样本删除失败。");
    }
  }

  const bulkApproveDraftItems = useCallback(async () => {
    if (!draftItems.length) {
      setNotice("当前没有待确认样本。");
      return;
    }
    setBulkApproving(true);
    setNotice(`正在确认 ${draftItems.length} 条待审样本。`);
    try {
      const updatedItems = await Promise.all(
        draftItems.map(async (item) => {
          const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}/boundary-items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: item.text, label: item.label, status: "approved" }),
          });
          if (!response.ok) {
            throw new Error(await readResponseError(response, "批量确认失败。"));
          }
          return (await response.json()) as BoundaryDatasetItem;
        }),
      );
      const updatedById = new Map(updatedItems.map((item) => [item.id, item]));
      setItems((current) => current.map((item) => updatedById.get(item.id) ?? item));
      setEditingItemId(null);
      setNotice(`已批量确认 ${updatedItems.length} 条样本。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "批量确认失败。");
    } finally {
      setBulkApproving(false);
    }
  }, [draftItems, selectedKnowledgeBase.id]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (isEditable) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        void bulkApproveDraftItems();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [bulkApproveDraftItems]);

  async function trainBoundaryModel() {
    setTraining(true);
    setNotice("正在训练边界模型。");
    setTrainingJob({
      id: `classifier-local-${Date.now()}`,
      knowledge_base_id: selectedKnowledgeBase.id,
      status: "running",
      message: "正在训练边界模型。",
      created_at: Date.now() / 1000,
      finished_at: null,
    });
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedKnowledgeBase.id}/classifier-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_name: modelName,
          model_scope: modelScope,
          model_alias: modelAlias,
        }),
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, "训练任务创建失败。"));
      }
      const job = (await response.json()) as IndexJob;
      setTrainingJob(job);
      setNotice(job.message);
    } catch (error) {
      setTrainingJob((current) => ({
        id: current?.id ?? `classifier-local-${Date.now()}`,
        knowledge_base_id: selectedKnowledgeBase.id,
        status: "failed",
        message: error instanceof Error ? error.message : "训练任务创建失败。",
        created_at: current?.created_at ?? Date.now() / 1000,
        finished_at: Date.now() / 1000,
      }));
      setNotice(error instanceof Error ? error.message : "训练任务创建失败。");
    } finally {
      setTraining(false);
    }
  }

  const visibleItems = items;
  const canTrain = approvedCount >= 4 && approvedInScopeCount > 0 && approvedOutOfScopeCount > 0;
  const trainingHint = canTrain ? "已满足二分类训练条件" : "需至少 4 条确认样本，并包含范围内/范围外";
  const modelStatus = training ? "running" : trainingJob?.status ?? "idle";
  const modelStatusLabel =
    modelStatus === "running"
      ? "正在训练"
      : modelStatus === "succeeded"
        ? "训练完成"
        : modelStatus === "failed"
          ? "训练失败"
          : "待训练";
  const modelStatusDetail =
    trainingJob?.message ?? (canTrain ? "样本已就绪，可以启动一次新的边界模型训练。" : trainingHint);
  const modelScopeLabel = modelScope === "global" ? "全局基线" : modelScope === "session" ? "会话实验" : "知识库专属";

  return (
    <section className="h-full min-h-0 flex-1 overflow-hidden px-3 py-3 sm:px-5 lg:px-6 lg:py-5">
      <div className="mx-auto grid h-full max-w-[1440px] min-h-0 gap-3 lg:grid-cols-[240px_minmax(360px,1fr)_260px] xl:grid-cols-[300px_minmax(0,1fr)_330px] xl:gap-4">
        <div className="grid min-h-0 grid-rows-[150px_auto_minmax(0,1fr)] gap-3 xl:grid-rows-[178px_auto_minmax(0,1fr)]">
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
              <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                <span className="font-semibold text-[var(--foreground)]">{items.length}</span> 条样本，
                <span className="font-semibold text-[var(--foreground)]">{approvedCount}</span> 条已确认，
                <span className="font-semibold text-[var(--foreground)]">{draftCount}</span> 条待确认。
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
                rows={3}
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
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-sm font-semibold">样本卡片</h2>
                <p className="text-xs text-[var(--muted)]">{notice}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void bulkApproveDraftItems()}
                  disabled={!draftItems.length || bulkApproving}
                  title="批量确认待审样本"
                >
                  {bulkApproving ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                  批量确认
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void refreshItems()} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                  刷新
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative min-h-0 flex-1 p-0">
            {visibleItems.length ? (
              <>
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-[linear-gradient(180deg,#fff_0%,rgba(255,255,255,0)_100%)]" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-[linear-gradient(0deg,#fff_0%,rgba(255,255,255,0)_100%)]" />
                <div className="boundary-preview-scroll h-full min-h-0 overflow-y-auto px-5 py-5 scroll-smooth">
                  <div className="mx-auto flex max-w-[760px] flex-col gap-3">
                    <div className="sticky top-0 z-20 mb-1 rounded-2xl border border-[var(--border)] bg-white/88 px-4 py-3 shadow-sm backdrop-blur">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium text-[var(--muted)]">训练样本流</p>
                          <p className="mt-0.5 text-sm font-semibold">
                            {approvedInScopeCount} 条范围内 · {approvedOutOfScopeCount} 条范围外
                          </p>
                        </div>
                        <StatusChip label={canTrain ? "可训练" : "待补充"} tone={canTrain ? "ok" : "warning"} />
                      </div>
                    </div>
                  {visibleItems.map((item) => (
                    <BoundaryItemCard
                      key={item.id}
                      item={item}
                      active={selectedItem?.id === item.id}
                      editing={editingItemId === item.id}
                      swiped={swipedItemId === item.id}
                      editText={editText}
                      editLabel={editLabel}
                      saving={saving}
                      onSelect={() => {
                        setSelectedItemId(item.id);
                        setSwipedItemId(null);
                      }}
                      onOpenEditor={() => {
                        setSelectedItemId(item.id);
                        setEditingItemId(item.id);
                        setSwipedItemId(null);
                      }}
                      onCancelEdit={() => setEditingItemId(null)}
                      onSave={() => void saveSelectedItem()}
                      onDelete={() => void deleteItem(item.id)}
                      onEditTextChange={setEditText}
                      onEditLabelChange={setEditLabel}
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
                </div>
              </>
            ) : (
              <PanelEmpty icon={BrainCircuit} title="等待样本" description="添加或智能扩充后即可训练边界。" />
            )}
          </CardContent>
        </Card>

        <aside className="grid min-h-0 content-start gap-3 overflow-hidden xl:gap-4">
          <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
            <CardHeader className="px-4 py-2.5">
              <h2 className="text-sm font-semibold">模型训练</h2>
              <p className="text-xs text-[var(--muted)]">命名并应用边界二分类器</p>
            </CardHeader>
            <CardContent className="space-y-2.5 p-3">
              <label className="block text-xs font-medium text-[var(--muted)]" htmlFor="boundary-model-name">
                模型名称
              </label>
              <input
                id="boundary-model-name"
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
                className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm font-semibold outline-none transition focus:border-[var(--accent)]"
              />
              <div className="grid grid-cols-[1fr_112px] gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-[var(--muted)]">管理层级</span>
                  <select
                    value={modelScope}
                    onChange={(event) => setModelScope(event.target.value as "global" | "knowledge_base" | "session")}
                    className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--accent)]"
                  >
                    <option value="knowledge_base">知识库专属</option>
                    <option value="global">全局基线</option>
                    <option value="session">会话实验</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-[var(--muted)]">别名</span>
                  <input
                    value={modelAlias}
                    onChange={(event) => setModelAlias(event.target.value)}
                    className="h-9 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--accent)]"
                  />
                </label>
              </div>
              <div className="boundary-model-status relative overflow-hidden rounded-2xl border border-[var(--accent-soft)] bg-[linear-gradient(135deg,#ffffff_0%,#eefaf8_55%,#f8fbfc_100%)] p-3 shadow-sm">
                <div className="relative flex items-center gap-3">
                  <div
                    className={cn(
                      "boundary-model-orb flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-[0_18px_36px_rgba(0,108,99,0.24)]",
                      modelStatus === "failed"
                        ? "bg-[linear-gradient(135deg,#d4483d_0%,#8f1f18_100%)]"
                        : "bg-[linear-gradient(135deg,#12a594_0%,#006c63_100%)]",
                      modelStatus === "running" ? "boundary-model-orb--running" : "",
                    )}
                  >
                    {modelStatus === "running" ? (
                      <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                    ) : modelStatus === "succeeded" ? (
                      <CheckCircle2 size={18} aria-hidden="true" />
                    ) : (
                      <BrainCircuit size={18} aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{modelName || "未命名边界模型"}</p>
                    <p className="mt-1 text-xs font-medium text-[var(--accent-strong)]">{modelStatusLabel}</p>
                  </div>
                </div>
                <p className="relative mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{modelStatusDetail}</p>
                <div className="relative mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-[var(--accent-soft)] bg-white/78 px-2 py-0.5 text-[11px] font-medium text-[var(--accent-strong)]">
                    {modelScopeLabel}
                  </span>
                  <span className="max-w-full truncate rounded-full border border-[var(--border)] bg-white/78 px-2 py-0.5 text-[11px] text-[var(--muted)]">
                    {selectedKnowledgeBase.name}
                  </span>
                  <span className="rounded-full border border-[var(--border)] bg-white/78 px-2 py-0.5 text-[11px] text-[var(--muted)]">
                    @{modelAlias || "应用版"}
                  </span>
                </div>
                <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white shadow-inner">
                  <div
                    className={cn(
                      "boundary-training-meter h-full rounded-full transition-all duration-700",
                      modelStatus === "running" ? "w-2/3" : modelStatus === "succeeded" ? "w-full" : "w-1/5",
                      modelStatus === "failed" ? "bg-[var(--danger)]" : "",
                    )}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="w-full justify-center"
                onClick={trainBoundaryModel}
                disabled={training || !canTrain}
                title={canTrain ? "训练并应用边界模型" : "请先确认足够的正负样本"}
              >
                {training ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <BrainCircuit size={14} aria-hidden="true" />}
                训练并应用
              </Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
            <CardHeader className="px-4 py-2.5">
              <h2 className="text-sm font-semibold">智能扩充</h2>
              <p className="text-xs text-[var(--muted)]">基于当前知识库生成候选样本</p>
            </CardHeader>
            <CardContent className="space-y-2.5 p-3">
              <div className="grid grid-cols-[1fr_92px] gap-2">
                <input
                  value={aiHint}
                  onChange={(event) => setAiHint(event.target.value)}
                  placeholder="类别提示"
                  className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--accent)]"
                />
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={aiCount}
                  aria-label="生成数量"
                  onChange={(event) => setAiCount(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
                  className="h-9 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--accent)]"
                />
              </div>
              <Button type="button" variant="primary" size="sm" className="w-full justify-center" onClick={generateItems} disabled={generating}>
                {generating ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
                生成候选
              </Button>
            </CardContent>
          </Card>

        </aside>
      </div>
    </section>
  );
}

function UserOperationsWorkspace({ currentUser }: { currentUser: AuthUser }) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("用户权限数据正在同步。");
  const [error, setError] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async (options?: { silent?: boolean }) => {
    setError("");
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = (await readJsonResponse(response)) as { users?: AuthUser[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "用户列表加载失败。");
      }
      setUsers(data.users ?? []);
      setNotice("用户权限数据已更新。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "用户列表加载失败。");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadUsers({ silent: true });
    }, 5_000);
    return () => window.clearInterval(id);
  }, [loadUsers]);

  useEffect(() => {
    function refreshOnFocus() {
      void loadUsers({ silent: true });
    }
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [loadUsers]);

  async function updateRole(user: AuthUser, role: UserRole) {
    if (user.role === role || user.coreAdmin || updatingUserId) {
      return;
    }
    setError("");
    setUpdatingUserId(user.id);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await readJsonResponse(response)) as { user?: AuthUser | null; error?: string };
      if (!response.ok || !data.user) {
        throw new Error(data.error || "权限更新失败。");
      }
      setUsers((current) => current.map((item) => (item.id === data.user?.id ? data.user : item)));
      setNotice(`${data.user.email} 已更新为${role === "admin" ? "管理员" : "普通用户"}。`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "权限更新失败。");
    } finally {
      setUpdatingUserId(null);
    }
  }

  const stats = useMemo(() => {
    const admins = users.filter((user) => user.role === "admin").length;
    const verified = users.filter((user) => user.emailVerifiedAt).length;
    const activeToday = users.filter((user) => {
      if (!user.lastLoginAt) {
        return false;
      }
      return Date.now() / 1000 - user.lastLoginAt < 24 * 60 * 60;
    }).length;
    return { admins, verified, activeToday };
  }, [users]);

  return (
    <section className="flex min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,#f8fbfc_0%,#eef5f4_100%)] px-3 py-3 sm:px-5 lg:px-6 lg:py-5">
      <div className="mx-auto grid h-full min-h-0 w-full max-w-[1440px] gap-4">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
          <div className="overflow-hidden rounded-2xl border border-white/80 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbfa_58%,#edf6f4_100%)] p-4 shadow-[0_22px_70px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.95)] sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <div className="mb-2 inline-flex h-8 items-center gap-2 rounded-full border border-[var(--accent-soft)] bg-white/78 px-3 text-xs font-semibold text-[var(--accent-strong)] shadow-sm">
                  <UserCog size={14} aria-hidden="true" />
                  User Operations
                </div>
                <h1 className="text-2xl font-semibold tracking-normal sm:text-[28px]">用户运维</h1>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  查看浙大邮箱注册用户，分配管理员权限，维护校网范围内的可信访问边界。
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => void loadUsers()} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
                刷新用户
              </Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <UserStatCard label="注册用户" value={`${users.length}`} detail="已完成邮箱验证" icon={Users} />
              <UserStatCard label="管理员" value={`${stats.admins}`} detail="可运维知识库与权限" icon={ShieldCheck} />
              <UserStatCard label="今日活跃" value={`${stats.activeToday}`} detail={`${stats.verified} 个已验证账号`} icon={HeartPulse} />
            </div>
          </div>

          <Card className="flex min-h-0 flex-col overflow-hidden border-white/80 bg-white/88 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">用户列表</h2>
                  <p className="text-xs text-[var(--muted)]">{notice}</p>
                </div>
                <span className="rounded-full border border-[var(--accent-soft)] bg-[var(--accent-tint)] px-2.5 py-1 text-xs font-medium text-[var(--accent-strong)]">
                  {currentUser.email}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {error ? (
                <div className="mb-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
                  {error}
                </div>
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
                <div className="grid grid-cols-[minmax(220px,1.3fr)_120px_160px_210px] items-center gap-3 border-b border-[var(--border)] bg-[var(--panel-muted)] px-4 py-3 text-xs font-semibold uppercase text-[var(--muted)] max-lg:hidden">
                  <span>用户</span>
                  <span>状态</span>
                  <span>最近登录</span>
                  <span>权限</span>
                </div>
                <div className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto">
                  {loading && !users.length ? (
                    <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-[var(--muted)]">
                      <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                      正在加载用户
                    </div>
                  ) : users.length ? (
                    users.map((user) => (
                      <UserRow
                        key={user.id}
                        user={user}
                        currentUserId={currentUser.id}
                        updating={updatingUserId === user.id}
                        locked={Boolean(user.coreAdmin)}
                        onChangeRole={(role) => void updateRole(user, role)}
                      />
                    ))
                  ) : (
                    <div className="flex min-h-[220px] items-center justify-center text-sm text-[var(--muted)]">
                      暂无注册用户
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function UserStatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-xl border border-white/80 bg-white/82 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-[var(--muted)]">{label}</p>
          <p className="mt-2 text-3xl font-semibold leading-none">{value}</p>
          <p className="mt-2 truncate text-xs text-[var(--muted)]">{detail}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-tint)] text-[var(--accent-strong)]">
          <Icon size={18} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function getUserInitial(user: Pick<AuthUser, "name" | "email" | "avatarUrl">) {
  return (user.name || user.email || "?").trim().slice(0, 1).toUpperCase();
}

function UserAvatar({
  user,
  size = "md",
  className,
}: {
  user: Pick<AuthUser, "name" | "email" | "avatarUrl">;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass = {
    xs: "h-7 w-7 text-xs",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-11 w-11 text-sm",
  }[size];
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className={cn(
          "shrink-0 rounded-full object-cover shadow-[0_14px_30px_rgba(0,108,99,0.22)]",
          sizeClass,
          className,
        )}
        aria-hidden="true"
      />
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#18a999_0%,#0b726a_100%)] font-semibold text-white shadow-[0_14px_30px_rgba(0,108,99,0.22)]",
        sizeClass,
        className,
      )}
      aria-hidden="true"
    >
      {getUserInitial(user)}
    </div>
  );
}

function UserRow({
  user,
  currentUserId,
  updating,
  locked,
  onChangeRole,
}: {
  user: AuthUser;
  currentUserId: string;
  updating: boolean;
  locked: boolean;
  onChangeRole: (role: UserRole) => void;
}) {
  return (
    <div className="grid gap-3 px-4 py-4 transition hover:bg-[var(--panel-muted)] lg:grid-cols-[minmax(220px,1.3fr)_120px_160px_210px] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar user={user} size="lg" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            {user.id === currentUserId ? <StatusChip label="当前" tone="ok" /> : null}
            {locked ? <StatusChip label="核心" tone="warning" /> : null}
          </div>
          <p className="mt-1 truncate text-xs text-[var(--muted)]">{user.email}</p>
        </div>
      </div>

      <div>
        <StatusChip label={user.disabledAt ? "已停用" : "可访问"} tone={user.disabledAt ? "warning" : "ok"} />
      </div>

      <p className="text-sm text-[var(--muted)]">{formatTimestamp(user.lastLoginAt ?? user.createdAt ?? null)}</p>

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] p-1">
        {(["user", "admin"] as const).map((role) => (
          <button
            key={role}
            type="button"
            disabled={locked || updating || user.role === role}
            onClick={() => onChangeRole(role)}
            className={cn(
              "flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition",
              user.role === role
                ? "bg-white text-[var(--accent-strong)] shadow-sm"
                : "text-[var(--muted)] hover:bg-white/78 hover:text-[var(--foreground)]",
              (locked || updating) && "cursor-not-allowed opacity-70",
            )}
          >
            {updating && user.role !== role ? <Loader2 className="animate-spin" size={13} aria-hidden="true" /> : null}
            {role === "admin" ? "管理员" : "普通用户"}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProductSidebar({
  open,
  onClose,
  sessionId,
  latestQuestion,
  sessions,
  knowledgeBases,
  selectedKnowledgeBaseId,
  onNewSession,
  onOpenSession,
  onSelectKnowledgeBase,
  user,
  isAdmin,
  activeView,
  collapsed,
  onChangeView,
  onToggleCollapse,
  onSignOut,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  latestQuestion?: string;
  sessions: ChatSessionSummary[];
  knowledgeBases: KnowledgeBase[];
  selectedKnowledgeBaseId: string;
  onNewSession: () => void;
  onOpenSession: (sessionId: string) => void;
  onSelectKnowledgeBase: (knowledgeBaseId: string) => void;
  user: AuthUser;
  isAdmin: boolean;
  activeView: WorkspaceView;
  collapsed: boolean;
  onChangeView: (view: WorkspaceView) => void;
  onToggleCollapse: () => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
}) {
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const [hoveringLogo, setHoveringLogo] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileKnowledgeBases = knowledgeBases.filter((item) => item.status === "active");
  const selectableKnowledgeBases = mobileKnowledgeBases.length ? mobileKnowledgeBases : knowledgeBases;
  const filteredSessions = sessions.filter((session) => {
    const query = sessionSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return `${session.title} ${session.knowledgeBaseName ?? ""}`.toLowerCase().includes(query);
  });

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      if (accountMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setAccountMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  function openSettingsFromMenu() {
    setAccountMenuOpen(false);
    onOpenSettings();
  }

  function signOutFromMenu() {
    setAccountMenuOpen(false);
    onSignOut();
  }

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
          "product-sidebar fixed inset-y-0 left-0 z-50 flex w-full max-w-[430px] flex-col overflow-hidden bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] transition-all duration-300 ease-out lg:relative lg:z-[90] lg:h-full lg:w-[292px] lg:max-w-none lg:translate-x-0 lg:overflow-visible lg:border-r lg:border-[var(--border)] lg:bg-[linear-gradient(180deg,#fbfdfe_0%,#f3f8fa_100%)] lg:shadow-none",
          collapsed ? "product-sidebar--collapsed" : "",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className={cn("flex h-[92px] shrink-0 items-center px-5 pt-[env(safe-area-inset-top)] lg:h-16 lg:border-b lg:border-[var(--border)] lg:px-3 lg:pt-0", collapsed ? "lg:justify-center" : "justify-between")}>
          {collapsed ? (
            <button
              type="button"
              className="group relative hidden h-11 w-11 items-center justify-center rounded-2xl bg-white text-[var(--accent-strong)] shadow-sm ring-1 ring-[var(--border)] transition hover:-translate-y-0.5 hover:bg-[var(--accent-tint)] hover:shadow-md lg:flex"
              onMouseEnter={() => setHoveringLogo(true)}
              onMouseLeave={() => setHoveringLogo(false)}
              onFocus={() => setHoveringLogo(true)}
              onBlur={() => setHoveringLogo(false)}
              onClick={onToggleCollapse}
              aria-label="展开侧栏"
              title="展开侧栏"
            >
              <span className={cn("absolute transition duration-200", hoveringLogo ? "scale-75 opacity-0" : "scale-100 opacity-100")}>
                <Image src="/images/icon.png" alt="" width={32} height={32} className="h-8 w-8 rounded-xl object-cover" aria-hidden="true" />
              </span>
              <span className={cn("absolute transition duration-200", hoveringLogo ? "scale-100 opacity-100" : "scale-75 opacity-0")}>
                <PanelLeftClose className="rotate-180" size={20} aria-hidden="true" />
              </span>
              <IconTooltip label="展开侧栏" />
            </button>
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              <Image src="/images/icon.png" alt="" width={40} height={40} className="hidden h-10 w-10 shrink-0 rounded-lg object-cover shadow-md shadow-teal-950/10 lg:block" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="truncate text-[30px] font-semibold tracking-normal text-slate-950 lg:text-base">{PRODUCT_NAME}</h2>
                <p className="hidden truncate text-xs text-[var(--muted)] lg:block">产业级知识问答中枢</p>
              </div>
            </div>
          )}
          {!collapsed ? (
            <button
              type="button"
              className="hidden h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-white/70 text-[var(--muted)] transition hover:bg-white hover:text-[var(--foreground)] hover:shadow-sm lg:flex"
              onClick={onToggleCollapse}
              aria-label="收起侧栏"
              title="收起侧栏"
            >
              <PanelLeftClose size={18} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-950 shadow-[0_12px_34px_rgba(15,23,42,0.08)] ring-1 ring-slate-100 transition hover:bg-[var(--panel-strong)] lg:hidden"
            onClick={onClose}
            aria-label="关闭导航"
          >
            <X size={24} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className={cn("shrink-0 px-5 py-2 lg:px-3 lg:py-3", collapsed ? "lg:px-2" : "")}>
            {collapsed ? (
              <button
                type="button"
                onClick={onNewSession}
                className="group relative hidden h-10 w-full items-center justify-center rounded-lg text-slate-700 transition hover:bg-white hover:text-slate-950 hover:shadow-sm lg:flex"
                aria-label="新建问答"
              >
                <PenLine size={18} strokeWidth={2.1} aria-hidden="true" />
                <IconTooltip label="新建问答" />
              </button>
            ) : (
              <Button type="button" variant="ghost" className="h-16 w-full justify-start rounded-full bg-[#f1f1f1] px-6 text-[22px] font-medium text-slate-950 shadow-none hover:bg-[#ebebeb] lg:h-10 lg:justify-center lg:rounded-md lg:bg-[linear-gradient(180deg,#08786e_0%,var(--accent-strong)_100%)] lg:px-3 lg:text-sm lg:text-white lg:shadow-sm" onClick={onNewSession}>
                <PenLine size={26} className="lg:hidden" aria-hidden="true" />
                <Plus size={15} className="hidden lg:block" aria-hidden="true" />
                <span className="lg:hidden">发起新对话</span>
                <span className="hidden lg:inline">新建问答</span>
              </Button>
            )}

            {!collapsed ? (
              <div className="mt-4 space-y-1 lg:hidden">
                <label className="flex h-14 items-center gap-5 rounded-full px-1 text-[22px] font-medium text-slate-950">
                  <Search size={30} strokeWidth={2} aria-hidden="true" />
                  <input
                    value={sessionSearch}
                    onChange={(event) => setSessionSearch(event.target.value)}
                    className="min-w-0 flex-1 border-0 bg-transparent outline-none placeholder:text-slate-950"
                    placeholder="搜索对话内容"
                    aria-label="搜索对话内容"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onChangeView("chat")}
                  className="flex h-14 w-full items-center gap-5 rounded-full px-1 text-left text-[22px] font-medium text-slate-950"
                >
                  <Layers3 size={30} strokeWidth={2} aria-hidden="true" />
                  库
                </button>
              </div>
            ) : null}

            {!collapsed && selectableKnowledgeBases.length ? (
              <div className="mt-3 grid gap-2 lg:hidden">
                {selectableKnowledgeBases.slice(0, 4).map((knowledgeBase) => {
                  const active = knowledgeBase.id === selectedKnowledgeBaseId;
                  return (
                    <button
                      key={knowledgeBase.id}
                      type="button"
                      onClick={() => {
                        onSelectKnowledgeBase(knowledgeBase.id);
                        onChangeView("chat");
                        onClose();
                      }}
                      className={cn(
                        "flex min-h-12 items-center justify-between gap-3 rounded-2xl px-4 py-2 text-left transition",
                        active ? "bg-[var(--panel-strong)] text-slate-950" : "text-slate-600 hover:bg-[var(--panel-muted)]",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold">{knowledgeBase.name}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {knowledgeBase.document_count} 个文档
                        </span>
                      </span>
                      {active ? <CheckCircle2 size={18} className="shrink-0 text-[var(--accent)]" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

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
                      "hidden h-10 w-full items-center justify-between rounded-md px-3 text-sm font-medium transition-all lg:flex",
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

          <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-8 lg:px-3 lg:pt-0", collapsed ? "lg:hidden" : "")}>
            <div className="hidden lg:block">
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

            <div className="mt-5 lg:mt-5">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-lg font-medium text-slate-400 lg:text-xs lg:font-semibold lg:uppercase lg:text-[var(--muted)]">最近</h3>
                <Search size={14} className="text-[var(--muted)]" aria-hidden="true" />
              </div>
              <div className="space-y-2 lg:space-y-2">
                {filteredSessions.length ? filteredSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onOpenSession(session.id)}
                    className="w-full rounded-2xl bg-white px-0 py-2 text-left text-slate-950 transition hover:bg-[var(--panel-muted)] lg:rounded-md lg:border lg:border-[var(--border)] lg:bg-white/72 lg:px-3 lg:shadow-sm lg:hover:border-[var(--border-strong)] lg:hover:bg-white"
                  >
                    <span className="block truncate text-[22px] font-semibold lg:text-sm lg:font-normal lg:text-[var(--foreground)]">
                      {session.title}
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-base text-slate-500 lg:text-xs lg:text-[var(--muted)]">
                      <span>{formatRelativeTime(session.updatedAt)}</span>
                      <span className="min-w-0 truncate">
                        {session.knowledgeBaseName ?? `${session.turnCount} 轮`}
                      </span>
                    </span>
                  </button>
                )) : (
                  <div className="rounded-2xl bg-white/58 px-0 py-4 text-[22px] font-semibold text-slate-950 lg:rounded-lg lg:border lg:border-dashed lg:border-[var(--border)] lg:px-3 lg:text-sm lg:font-normal lg:text-[var(--muted)]">
                    {sessionSearch ? "没有找到相关对话" : "暂无最近对话"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          ref={accountMenuRef}
          className={cn("relative shrink-0 p-5 pb-[calc(env(safe-area-inset-bottom)+22px)] lg:border-t lg:border-[var(--border)] lg:p-3", collapsed ? "lg:px-2" : "")}
        >
          {accountMenuOpen ? (
            <AccountMenu
              collapsed={collapsed}
              user={user}
              onOpenSettings={openSettingsFromMenu}
              onSignOut={signOutFromMenu}
            />
          ) : null}
          {collapsed ? (
            <button
              type="button"
              onClick={() => setAccountMenuOpen((value) => !value)}
              className="group relative hidden h-10 w-full items-center justify-center rounded-lg bg-white text-[var(--accent-strong)] shadow-sm transition hover:bg-[var(--panel-strong)] lg:flex"
              aria-label={`${user.name} · 账户菜单`}
              aria-expanded={accountMenuOpen}
            >
              <UserAvatar user={user} size="xs" className="shadow-none" />
              <IconTooltip label={`${user.name} · 账户菜单`} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAccountMenuOpen((value) => !value)}
              className="w-full rounded-2xl bg-white p-0 text-left transition hover:bg-[var(--panel-muted)] lg:rounded-lg lg:border lg:border-[var(--border)] lg:bg-white/82 lg:p-3 lg:shadow-sm lg:hover:border-[var(--border-strong)] lg:hover:bg-white"
              aria-label={`${user.name} · 账户菜单`}
              aria-expanded={accountMenuOpen}
            >
              <div className="flex items-center gap-4 lg:gap-2">
                <UserAvatar user={user} size="sm" className="shadow-none lg:hidden" />
                <UserAvatar user={user} size="sm" className="hidden shadow-none lg:flex" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[22px] font-semibold text-slate-950 lg:text-sm lg:text-[var(--foreground)]">{user.name}</p>
                  <p className="hidden truncate text-xs text-[var(--muted)] lg:block">
                    {user.role === "admin" ? "管理员" : "普通用户"} · {user.email}
                  </p>
                </div>
                <Settings size={30} className="shrink-0 text-slate-950 lg:hidden" aria-hidden="true" />
                <ChevronRight size={16} className="hidden shrink-0 text-[var(--muted)] lg:block" aria-hidden="true" />
              </div>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function AccountMenu({
  collapsed,
  user,
  onOpenSettings,
  onSignOut,
}: {
  collapsed: boolean;
  user: AuthUser;
  onOpenSettings: () => void;
  onSignOut: () => void;
}) {
  return (
    <div
      className={cn(
        "absolute bottom-[calc(100%+10px)] z-50 w-[280px] overflow-hidden rounded-2xl border border-white/80 bg-white/92 p-2 shadow-[0_24px_70px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl",
        collapsed ? "left-3 lg:left-4" : "left-3",
      )}
    >
      <div className="flex items-center gap-3 px-2 py-2.5">
        <UserAvatar user={user} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-[var(--muted)]">
            {user.role === "admin" ? "管理员" : "普通用户"} · {user.email}
          </p>
        </div>
      </div>
      <div className="my-1 h-px bg-[var(--border)]" />
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--panel-muted)]"
      >
        <Settings size={18} aria-hidden="true" />
        设置
      </button>
      <button
        type="button"
        onClick={onSignOut}
        className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
      >
        <LogOut size={18} aria-hidden="true" />
        退出登录
      </button>
    </div>
  );
}

type RuntimeConfig = {
  ragUrl: string;
  modelApiUrl: string;
  apiKey: string;
};

type ConnectivityTarget = "rag" | "model";

type ConnectivityResult = {
  ok: boolean;
  status?: number;
  latencyMs?: number;
  message: string;
};

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  ragUrl: "http://127.0.0.1:8000",
  modelApiUrl: "https://api.openai.com/v1",
  apiKey: "",
};

function AccountSettingsModal({
  user,
  onClose,
}: {
  user: AuthUser;
  onClose: () => void;
}) {
  const auth = useAuth();
  const storageKey = `xyfrag.runtime-config.${user.id}`;
  const [config, setConfig] = useState<RuntimeConfig>(DEFAULT_RUNTIME_CONFIG);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<ConnectivityTarget | null>(null);
  const [results, setResults] = useState<Partial<Record<ConnectivityTarget, ConnectivityResult>>>({});
  const [activePanel, setActivePanel] = useState<"profile" | "settings" | "connection">("profile");
  const [profileName, setProfileName] = useState(user.name);
  const [profileAvatar, setProfileAvatar] = useState(user.avatarUrl ?? "");
  const [profileNotice, setProfileNotice] = useState("");
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setProfileName(user.name);
    setProfileAvatar(user.avatarUrl ?? "");
  }, [user.avatarUrl, user.name]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        setConfig({ ...DEFAULT_RUNTIME_CONFIG, ...(JSON.parse(raw) as Partial<RuntimeConfig>) });
      }
    } catch {
      setConfig(DEFAULT_RUNTIME_CONFIG);
    }
  }, [storageKey]);

  function updateConfig(key: keyof RuntimeConfig, value: string) {
    setSaved(false);
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function saveConfig() {
    window.localStorage.setItem(storageKey, JSON.stringify(config));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  async function testConnection(target: ConnectivityTarget) {
    setTesting(target);
    const url = target === "rag" ? config.ragUrl : config.modelApiUrl;
    try {
      const response = await fetch("/api/settings/connectivity-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          url,
          apiKey: target === "model" ? config.apiKey : undefined,
        }),
      });
      const data = (await response.json()) as ConnectivityResult;
      setResults((current) => ({
        ...current,
        [target]: response.ok
          ? data
          : { ok: false, status: response.status, message: data.message || "连通性测试失败。" },
      }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [target]: {
          ok: false,
          message: error instanceof Error ? error.message : "连通性测试失败。",
        },
      }));
    } finally {
      setTesting(null);
    }
  }

  async function saveProfile() {
    setProfileError("");
    setProfileNotice("");
    const name = profileName.trim();
    if (!name) {
      setProfileError("昵称不能为空。");
      return;
    }
    setSavingProfile(true);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, avatarUrl: profileAvatar || null }),
      });
      const data = (await response.json()) as { user?: AuthUser | null; error?: string; message?: string };
      if (!response.ok || !data.user) {
        throw new Error(data.error || "个人资料保存失败。");
      }
      auth.setAuthenticatedUser(data.user);
      setProfileNotice(data.message || "个人资料已更新。");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "个人资料保存失败。");
    } finally {
      setSavingProfile(false);
    }
  }

  function clearProfileAvatar() {
    setProfileAvatar("");
    setProfileNotice("");
    setProfileError("");
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-end bg-slate-950/18 px-0 py-0 backdrop-blur-md lg:place-items-center lg:px-4 lg:py-6">
      <div className="h-[100svh] w-full overflow-hidden rounded-none border-0 bg-white/96 shadow-[0_40px_120px_rgba(15,23,42,0.24),inset_0_1px_0_rgba(255,255,255,0.96)] backdrop-blur-2xl lg:h-[min(650px,calc(100vh-3rem))] lg:max-w-[980px] lg:rounded-[28px] lg:border lg:border-white/85 lg:bg-white/92">
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[230px_minmax(0,1fr)] lg:grid-rows-1">
          <aside className="border-b border-[var(--border)] bg-white/92 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] lg:border-b-0 lg:border-r lg:bg-[linear-gradient(180deg,#ffffff_0%,#f5faf9_100%)] lg:p-4">
            <button
              type="button"
              onClick={onClose}
              className="mb-4 flex h-11 w-11 items-center justify-center rounded-full text-[var(--foreground)] transition hover:bg-[var(--panel-strong)] lg:mb-6 lg:h-9 lg:w-9 lg:rounded-xl"
              aria-label="关闭设置"
            >
              <X size={20} aria-hidden="true" />
            </button>
            <div className="hidden rounded-2xl border border-white/80 bg-white/78 p-3 shadow-sm lg:block">
              <div className="flex items-center gap-3">
                <UserAvatar user={user} size="lg" className="shadow-none" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{user.role === "admin" ? "管理员" : "普通用户"}</p>
                </div>
              </div>
            </div>
            <nav className="flex gap-2 overflow-x-auto lg:mt-5 lg:block lg:space-y-2 lg:overflow-visible">
              <button
                type="button"
                onClick={() => setActivePanel("profile")}
                className={cn(
                  "flex h-11 min-w-fit items-center gap-3 rounded-full px-4 text-left text-sm transition lg:h-10 lg:w-full lg:rounded-xl lg:px-3",
                  activePanel === "profile"
                    ? "bg-[var(--panel-strong)] font-semibold text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:bg-white/70 hover:text-[var(--foreground)]",
                )}
              >
                <UserCog size={17} aria-hidden="true" />
                个人资料
              </button>
              <button
                type="button"
                onClick={() => setActivePanel("settings")}
                className={cn(
                  "flex h-11 min-w-fit items-center gap-3 rounded-full px-4 text-left text-sm transition lg:h-10 lg:w-full lg:rounded-xl lg:px-3",
                  activePanel === "settings"
                    ? "bg-[var(--panel-strong)] font-semibold text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:bg-white/70 hover:text-[var(--foreground)]",
                )}
              >
                <Settings size={17} aria-hidden="true" />
                设置
              </button>
              <button
                type="button"
                onClick={() => setActivePanel("connection")}
                className={cn(
                  "flex h-11 min-w-fit items-center gap-3 rounded-full px-4 text-left text-sm transition lg:h-10 lg:w-full lg:rounded-xl lg:px-3",
                  activePanel === "connection"
                    ? "bg-[var(--panel-strong)] font-semibold text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:bg-white/70 hover:text-[var(--foreground)]",
                )}
              >
                <ShieldCheck size={17} aria-hidden="true" />
                连接
              </button>
            </nav>
          </aside>

          <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
            <header className="border-b border-[var(--border)] px-5 py-4 lg:px-7 lg:py-5">
              <h2 className="text-xl font-semibold tracking-normal">{activePanel === "profile" ? "个人资料" : activePanel === "settings" ? "服务设置" : "连接测试"}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {activePanel === "profile" ? "昵称与头像" : activePanel === "settings" ? "API 与 URL" : "验证当前配置是否可访问"}
              </p>
            </header>

            <div className="min-h-0 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+20px)] lg:overflow-hidden lg:p-5">
              {activePanel === "profile" ? (
                <ProfileSettingsCard
                  user={{ ...user, name: profileName, avatarUrl: profileAvatar || null }}
                  name={profileName}
                  avatarUrl={profileAvatar}
                  saving={savingProfile}
                  notice={profileNotice}
                  error={profileError}
                  onNameChange={setProfileName}
                  onAvatarChange={(value) => {
                    setProfileAvatar(value);
                    setProfileNotice("");
                    setProfileError("");
                  }}
                  onClearAvatar={clearProfileAvatar}
                  onSave={() => void saveProfile()}
                />
              ) : activePanel === "settings" ? (
                <Card className="mx-auto min-h-0 max-w-[560px] overflow-hidden border-white/80 bg-white/84 shadow-[var(--shadow-soft)]">
                  <CardHeader>
                    <h3 className="text-sm font-semibold">配置</h3>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <SettingsField
                      label="RAG 服务 URL"
                      value={config.ragUrl}
                      onChange={(value) => updateConfig("ragUrl", value)}
                      placeholder="http://127.0.0.1:8000"
                    />
                    <SettingsField
                      label="模型 API URL"
                      value={config.modelApiUrl}
                      onChange={(value) => updateConfig("modelApiUrl", value)}
                      placeholder="https://api.openai.com/v1"
                    />
                    <SettingsField
                      label="API Key"
                      value={config.apiKey}
                      onChange={(value) => updateConfig("apiKey", value)}
                      placeholder="sk-..."
                      type="password"
                    />
                    <Button type="button" variant="primary" className="w-full justify-center" onClick={saveConfig}>
                      <CheckCircle2 size={15} aria-hidden="true" />
                      {saved ? "已保存" : "保存配置"}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="mx-auto min-h-0 max-w-[620px] overflow-hidden border-white/80 bg-white/84 shadow-[var(--shadow-soft)]">
                  <CardHeader>
                    <h3 className="text-sm font-semibold">测试</h3>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ConnectivityCard
                      title="RAG 服务"
                      description={config.ragUrl}
                      testing={testing === "rag"}
                      result={results.rag}
                      onTest={() => void testConnection("rag")}
                    />
                    <ConnectivityCard
                      title="模型 API"
                      description={config.modelApiUrl}
                      testing={testing === "model"}
                      result={results.model}
                      onTest={() => void testConnection("model")}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SettingsField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "password";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-[var(--foreground)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-medium outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_rgba(0,108,99,0.08)]"
      />
    </label>
  );
}

function ProfileSettingsCard({
  user,
  name,
  avatarUrl,
  saving,
  notice,
  error,
  onNameChange,
  onAvatarChange,
  onClearAvatar,
  onSave,
}: {
  user: AuthUser;
  name: string;
  avatarUrl: string;
  saving: boolean;
  notice: string;
  error: string;
  onNameChange: (value: string) => void;
  onAvatarChange: (value: string) => void;
  onClearAvatar: () => void;
  onSave: () => void;
}) {
  const [fileError, setFileError] = useState("");

  async function handleAvatarFile(file: File | null) {
    setFileError("");
    if (!file) {
      return;
    }
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setFileError("头像仅支持 PNG、JPG 或 WebP 图片。");
      return;
    }
    if (file.size > 512 * 1024) {
      setFileError("头像图片不能超过 512 KB。");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    onAvatarChange(dataUrl);
  }

  return (
    <Card className="mx-auto min-h-0 max-w-[620px] overflow-hidden border-white/80 bg-white/84 shadow-[var(--shadow-soft)]">
      <CardHeader>
        <h3 className="text-sm font-semibold">资料</h3>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,#ffffff_0%,#f7fbfa_100%)] p-4">
          <UserAvatar user={user} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name || user.name}</p>
            <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>
          </div>
        </div>

        <SettingsField
          label="昵称"
          value={name}
          onChange={onNameChange}
          placeholder="请输入昵称"
        />

        <div>
          <span className="mb-2 block text-xs font-semibold text-[var(--foreground)]">头像</span>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--accent-strong)] transition hover:bg-[var(--accent-tint)]">
              上传头像
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => void handleAvatarFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={onClearAvatar} disabled={!avatarUrl}>
              清除头像
            </Button>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">支持 PNG、JPG、WebP，大小不超过 512 KB。</p>
          {fileError ? <p className="mt-2 text-xs font-medium text-[var(--danger)]">{fileError}</p> : null}
        </div>

        {error ? (
          <p className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-medium text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-[var(--accent-soft)] bg-[var(--accent-tint)] px-3 py-2 text-sm font-medium text-[var(--accent-strong)]">
            {notice}
          </p>
        ) : null}

        <Button type="button" variant="primary" className="w-full justify-center" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
          {saving ? "保存中" : "保存个人资料"}
        </Button>
      </CardContent>
    </Card>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("头像读取失败。"));
    reader.readAsDataURL(file);
  });
}

function ConnectivityCard({
  title,
  description,
  testing,
  result,
  onTest,
}: {
  title: string;
  description: string;
  testing: boolean;
  result?: ConnectivityResult;
  onTest: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,#ffffff_0%,#f7fbfa_100%)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 truncate text-xs text-[var(--muted)]">{description || "-"}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold",
            result
              ? result.ok
                ? "bg-[var(--accent-tint)] text-[var(--accent-strong)]"
                : "bg-[var(--danger-soft)] text-[var(--danger)]"
              : "bg-[var(--panel-muted)] text-[var(--muted)]",
          )}
        >
          {result ? (result.ok ? "可用" : "失败") : "待测"}
        </span>
      </div>
      <Button type="button" variant="secondary" size="sm" className="mt-4 w-full justify-center" onClick={onTest} disabled={testing}>
        {testing ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <HeartPulse size={14} aria-hidden="true" />}
        连通性测试
      </Button>
      {result ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-white/78 px-3 py-2">
          <p className="text-xs font-medium text-[var(--foreground)]">{result.message}</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            {result.status ? `HTTP ${result.status}` : "HTTP -"} · {result.latencyMs ? `${result.latencyMs}ms` : "-"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function UserGuideModal({
  desktopMode = false,
  onClose,
}: {
  desktopMode?: boolean;
  onClose: () => void;
}) {
  type GuideEdition = "web" | "desktop";
  type GuideSection = {
    id: string;
    title: string;
    icon: typeof Settings;
    steps: string[];
  };
  const [activeEdition, setActiveEdition] = useState<GuideEdition>(desktopMode ? "desktop" : "web");
  const defaultSectionByEdition: Record<GuideEdition, string> = {
    web: "start",
    desktop: "api",
  };
  const [activeSectionId, setActiveSectionId] = useState(defaultSectionByEdition[desktopMode ? "desktop" : "web"]);
  const editionOptions: Array<{ id: GuideEdition; label: string }> = [
    { id: "web", label: "网页版" },
    { id: "desktop", label: "Windows APP 版" },
  ];
  const guideByEdition: Record<GuideEdition, GuideSection[]> = {
    web: [
      {
        id: "start",
        title: "开始使用",
        icon: Database,
        steps: [
          "登录后直接进入问答工作台。",
          "选择可用知识库，输入问题并发送。",
          "回答下方会显示引用来源，便于核对依据。",
        ],
      },
      {
        id: "connection",
        title: "服务状态",
        icon: HeartPulse,
        steps: [
          "顶部状态显示在线时，可以正常提问。",
          "如果显示离线，请等待管理员恢复服务。",
          `如果一直离线，请联系管理员：${ADMIN_CONTACT_EMAIL}。`,
        ],
      },
      {
        id: "faq",
        title: "常见问题",
        icon: ShieldCheck,
        steps: [
          `无法登录或无可用知识库时，请联系管理员：${ADMIN_CONTACT_EMAIL}。`,
          "回答没有引用来源时，调整问题范围或请管理员确认索引是否完成。",
          "页面显示离线时，请稍后重试或联系管理员。",
        ],
      },
    ],
    desktop: [
      {
        id: "api",
        title: "填写 API Key",
        icon: Settings,
        steps: [
          "打开设置，API 配置统一参考 DeepSeek 文档：https://api-docs.deepseek.com/。",
          "只填写 API Key，其余配置保持默认。",
          "保存配置后进入“连通性测试”。",
        ],
      },
      {
        id: "models",
        title: "下载和启用模型",
        icon: Database,
        steps: [
          "进入“模型”，选择嵌入模型并点击下载。",
          "下载完成后点击启用；需要轻量检索时切回轻量模式。",
          "下载失败时检查网络、代理和磁盘空间。",
        ],
      },
      {
        id: "connection",
        title: "连通性测试",
        icon: HeartPulse,
        steps: [
          "先测试 RAG 服务，再测试模型 API。",
          "两项都可用后，即可开始提问。",
          "失败时重启 APP，或检查 API Key 和网络代理。",
        ],
      },
      {
        id: "faq",
        title: "常见问题",
        icon: ShieldCheck,
        steps: [
          "APP 打不开：发送安装包，不要只发送 win-unpacked 里的 exe。",
          "模型/API 报错：检查 API Key、网络和服务额度。",
          `无法解决的问题请联系管理员：${ADMIN_CONTACT_EMAIL}。`,
        ],
      },
    ],
  };
  const guideSections = guideByEdition[activeEdition];
  const activeSection = guideSections.find((section) => section.id === activeSectionId) ?? guideSections[0];
  const ActiveIcon = activeSection.icon;

  return (
    <div className="fixed inset-0 z-[130] grid place-items-end bg-slate-950/18 px-0 py-0 backdrop-blur-md lg:place-items-center lg:px-4 lg:py-5">
      <div className="flex h-[100svh] w-full flex-col overflow-hidden rounded-none border-0 bg-white/97 shadow-[0_34px_90px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.96)] backdrop-blur-2xl lg:h-[min(680px,calc(100vh-2rem))] lg:max-w-[920px] lg:rounded-2xl lg:border lg:border-white/85 lg:bg-white/95">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] px-5 pb-4 pt-[calc(env(safe-area-inset-top)+16px)] lg:py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-tint)] text-[var(--accent-strong)]">
              <HelpCircle size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-normal">使用说明</h2>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} title="关闭使用说明" aria-label="关闭使用说明">
            <X size={18} aria-hidden="true" />
          </Button>
        </header>

        <div className="shrink-0 border-b border-[var(--border)] bg-white/72 px-4 py-3">
          <div className="grid max-w-[420px] grid-cols-2 rounded-full border border-[var(--border)] bg-white p-1 shadow-sm lg:rounded-xl">
            {editionOptions.map((edition) => {
              const active = edition.id === activeEdition;
              return (
                <button
                  key={edition.id}
                  type="button"
                  onClick={() => {
                    setActiveEdition(edition.id);
                    setActiveSectionId(defaultSectionByEdition[edition.id]);
                  }}
                  className={cn(
                    "h-10 rounded-full px-3 text-sm font-semibold transition lg:h-9 lg:rounded-lg",
                    active
                      ? "bg-[var(--accent-tint)] text-[var(--accent-strong)] shadow-sm"
                      : "text-[var(--muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--foreground)]",
                  )}
                >
                  {edition.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border-b border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfa_100%)] p-3 lg:border-b-0 lg:border-r">
            <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
              {guideSections.map((section, index) => {
                const Icon = section.icon;
                const active = section.id === activeSection.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSectionId(section.id)}
                    className={cn(
                      "flex min-w-[150px] items-center gap-3 rounded-full border px-3 py-3 text-left transition lg:min-w-0 lg:w-full lg:rounded-xl",
                      active
                        ? "border-[var(--accent-soft)] bg-white font-semibold text-[var(--foreground)] shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
                        : "border-transparent text-[var(--muted)] hover:bg-white/70 hover:text-[var(--foreground)]",
                    )}
                  >
                    <span className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      active ? "bg-[var(--accent-tint)] text-[var(--accent-strong)]" : "bg-white/70 text-[var(--muted)]",
                    )}>
                      <Icon size={15} aria-hidden="true" />
                    </span>
                    <span className="truncate text-base">{index + 1}. {section.title}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:p-5">
            <section className="min-h-full rounded-2xl border border-[var(--border)] bg-white/88 p-4 shadow-sm sm:p-5 lg:rounded-xl">
              <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-tint)] text-[var(--accent-strong)]">
                  <ActiveIcon size={20} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-normal">{activeSection.title}</h3>
                </div>
              </div>

              <ol className="mt-5 space-y-3">
                {activeSection.steps.map((step, index) => (
                  <li key={step} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,#ffffff_0%,#f7fbfa_100%)] px-3 py-3 lg:rounded-xl">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--panel-strong)] text-sm font-semibold text-[var(--accent-strong)]">
                      {index + 1}
                    </span>
                    <p className="self-center text-sm leading-6 text-[var(--foreground)]">{step}</p>
                  </li>
                ))}
              </ol>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function ProductHeader({
  health,
  healthOk,
  user,
  onSignOut,
  onOpenSidebar,
  onOpenHelp,
}: {
  health: BackendHealth | null;
  healthOk: boolean;
  user: AuthUser;
  onSignOut: () => void;
  onOpenSidebar: () => void;
  onOpenHelp: () => void;
}) {
  return (
    <header className="z-30 shrink-0 bg-white/0 backdrop-blur-xl lg:border-b lg:border-[var(--border)] lg:bg-white/78">
      <div className="flex h-[72px] items-center justify-between gap-3 px-5 pt-[env(safe-area-inset-top)] lg:h-12 lg:px-5 lg:pt-0">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/88 text-slate-950 shadow-[0_12px_34px_rgba(15,23,42,0.10)] ring-1 ring-white/80 transition hover:bg-white lg:hidden"
            onClick={onOpenSidebar}
            aria-label="打开导航"
          >
            <Menu size={24} strokeWidth={2.2} aria-hidden="true" />
            {!healthOk ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--danger)] ring-2 ring-white" /> : null}
          </button>
          <div className="hidden min-w-0 items-center gap-2 rounded-full border border-[var(--border)] bg-white/78 px-3 py-1.5 shadow-sm md:flex">
            <Search size={15} className="text-[var(--muted)]" aria-hidden="true" />
            <span className="truncate text-sm text-[var(--muted)]">搜索会话、文档或引用来源</span>
            <span className="ml-8 rounded-md border border-[var(--border)] bg-[var(--panel-muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
              ⌘ /
            </span>
          </div>
          <div className="min-w-0 md:hidden">
            <div className="inline-flex h-12 max-w-[210px] items-center gap-2 rounded-full bg-white/84 px-5 text-lg font-semibold tracking-normal text-slate-950 shadow-[0_12px_34px_rgba(15,23,42,0.08)] ring-1 ring-white/80">
              <span className="truncate">{PRODUCT_NAME}</span>
              <span className={cn("h-2 w-2 shrink-0 rounded-full", healthOk ? "bg-[var(--info)]" : "bg-[var(--danger)]")} aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden h-8 items-center gap-2 rounded-full border border-[var(--border)] bg-white/72 px-3 text-xs shadow-sm lg:flex">
            <Database size={14} className="text-[var(--accent)]" aria-hidden="true" />
            <span className="font-medium text-[var(--accent-strong)]">正常</span>
          </div>
          <Button type="button" variant="ghost" size="icon" title="使用说明" aria-label="打开使用说明" className="h-12 w-12 rounded-full bg-white/84 shadow-[0_12px_34px_rgba(15,23,42,0.08)] ring-1 ring-white/80 hover:bg-white lg:h-8 lg:w-8 lg:rounded-md lg:bg-transparent lg:shadow-none lg:ring-0" onClick={onOpenHelp}>
            <HelpCircle size={22} className="lg:h-4 lg:w-4" aria-hidden="true" />
          </Button>
          <HealthPill ok={healthOk} label={health?.app ?? PRODUCT_NAME} />
          <Button type="button" variant="secondary" size="sm" className="hidden h-8 rounded-full sm:inline-flex" title={`${user.name} · 退出登录`} onClick={onSignOut}>
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
    <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-[9999] hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white opacity-0 shadow-[0_18px_40px_rgba(15,23,42,0.28)] ring-1 ring-white/10 transition-all duration-200 ease-out group-hover:translate-x-0.5 group-hover:opacity-100 lg:block">
      {label}
    </span>
  );
}

function HealthPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="hidden h-8 items-center gap-2 rounded-full border border-[var(--border)] bg-white/72 px-3 text-xs shadow-sm sm:flex">
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

function CompactDocumentRow({
  document,
  deleting = false,
  onDelete,
}: {
  document: KnowledgeDocument;
  deleting?: boolean;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 shadow-sm">
      <div className="flex min-w-0 flex-1 items-center gap-3">
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
      <div className="flex shrink-0 items-center gap-2">
        <StatusChip label={document.status === "indexed" ? "已入库" : "待索引"} tone={document.status === "indexed" ? "ok" : "muted"} />
        {onDelete ? (
          <Button
            type="button"
            variant="danger"
            size="icon"
            className="h-8 w-8"
            onClick={onDelete}
            disabled={deleting}
            title={`删除 ${document.title}`}
            aria-label={`删除 ${document.title}`}
          >
            {deleting ? (
              <Loader2 className="animate-spin" size={14} aria-hidden="true" />
            ) : (
              <Trash2 size={14} aria-hidden="true" />
            )}
          </Button>
        ) : null}
      </div>
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visibleKnowledgeBases = knowledgeBases.filter((item) => item.status === "active");
  const options = visibleKnowledgeBases.length ? visibleKnowledgeBases : knowledgeBases;
  const selectedKnowledgeBase = options.find((item) => item.id === selectedId) ?? options[0] ?? DEFAULT_KNOWLEDGE_BASE;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative hidden sm:block">
      <button
        type="button"
        aria-label="选择知识库"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="group flex h-11 max-w-[260px] items-center gap-2 rounded-full border border-white/80 bg-white/86 px-4 text-sm font-semibold text-[var(--foreground)] shadow-[0_14px_36px_rgba(15,23,42,0.10)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white hover:bg-white hover:shadow-[0_18px_44px_rgba(15,23,42,0.14)]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--accent-soft)] bg-white text-[var(--accent)]">
          <Database size={16} aria-hidden="true" />
        </span>
        <span className="truncate">{selectedKnowledgeBase.name}</span>
        <ChevronRight
          size={16}
          className={cn(
            "shrink-0 rotate-90 text-[var(--muted)] transition duration-200 group-hover:text-[var(--foreground)]",
            open ? "-rotate-90" : "",
          )}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-3xl border border-white/80 bg-white/96 p-2 shadow-[0_28px_80px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-[var(--muted)]">当前知识库</p>
          </div>
          <div className="space-y-1">
            {options.map((knowledgeBase) => {
              const active = knowledgeBase.id === selectedId;
              return (
                <button
                  key={knowledgeBase.id}
                  type="button"
                  onClick={() => {
                    onSelect(knowledgeBase.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition",
                    active
                      ? "bg-[var(--accent-tint)] text-[var(--accent-strong)]"
                      : "text-[var(--foreground)] hover:bg-[var(--panel-muted)]",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border bg-white",
                      active ? "border-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]",
                    )}
                  >
                    {active ? <CheckCircle2 size={15} aria-hidden="true" /> : <Database size={15} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{knowledgeBase.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                      {indexStatusLabel(knowledgeBase.index_status)} · {knowledgeBase.document_count} 个文档
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
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
  editing,
  swiped,
  editText,
  editLabel,
  saving,
  onSelect,
  onOpenEditor,
  onCancelEdit,
  onSave,
  onDelete,
  onEditTextChange,
  onEditLabelChange,
  onPointerStart,
  onPointerEnd,
}: {
  item: BoundaryDatasetItem;
  active: boolean;
  editing: boolean;
  swiped: boolean;
  editText: string;
  editLabel: 0 | 1;
  saving: boolean;
  onSelect: () => void;
  onOpenEditor: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
  onEditTextChange: (value: string) => void;
  onEditLabelChange: (value: 0 | 1) => void;
  onPointerStart: (x: number) => void;
  onPointerEnd: (x: number) => void;
}) {
  if (editing) {
    return (
      <div className="boundary-edit-card relative min-h-[260px] snap-start scroll-mt-4 overflow-hidden rounded-2xl border border-[var(--accent)] bg-[linear-gradient(135deg,#ffffff_0%,#f4fbf9_58%,#ffffff_100%)] p-4 shadow-[0_24px_60px_rgba(0,108,99,0.18)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(0,108,99,0.14)_0%,rgba(0,108,99,0)_34%),radial-gradient(circle_at_100%_20%,rgba(39,100,197,0.12)_0%,rgba(39,100,197,0)_30%)]" />
        <div className="relative flex items-center justify-between gap-2">
          <StatusChip label={item.status === "approved" ? "已确认" : "待确认"} tone={item.status === "approved" ? "ok" : "warning"} />
          <span className="text-[11px] text-[var(--muted)]">{item.source === "llm" ? "智能生成" : "手动样本"}</span>
        </div>
        <div className="relative mt-4">
          <BoundaryLabelToggle value={editLabel} onChange={onEditLabelChange} />
          <textarea
            value={editText}
            onChange={(event) => onEditTextChange(event.target.value)}
            rows={4}
            autoFocus
            className="mt-3 min-h-[96px] w-full resize-none rounded-xl border border-[var(--border)] bg-white/92 px-3 py-3 text-sm font-medium leading-6 shadow-inner outline-none transition focus:border-[var(--accent)]"
          />
        </div>
        <div className="relative mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
          <Button type="button" variant="primary" className="justify-center" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
            保存
          </Button>
          <Button type="button" variant="danger" size="icon" title="删除样本" onClick={onDelete}>
            <X size={15} aria-hidden="true" />
          </Button>
          <Button type="button" variant="secondary" size="icon" title="收起编辑" onClick={onCancelEdit}>
            <ChevronRight size={15} aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[122px] snap-start scroll-mt-4 overflow-hidden rounded-2xl">
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
        onDoubleClick={onOpenEditor}
        onPointerDown={(event) => onPointerStart(event.clientX)}
        onPointerUp={(event) => onPointerEnd(event.clientX)}
        onPointerCancel={(event) => onPointerEnd(event.clientX)}
        className={cn(
          "group relative flex min-h-[122px] w-full flex-col justify-between rounded-2xl border bg-white p-4 text-left shadow-sm transition duration-300 ease-out hover:-translate-y-0.5",
          active ? "border-[var(--accent)] shadow-[0_20px_48px_rgba(0,108,99,0.14)]" : "border-[var(--border)] hover:border-[var(--accent-soft)] hover:shadow-md",
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
          <span className="transition group-hover:text-[var(--accent-strong)]">{formatTimestamp(item.created_at)}</span>
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

function classifierScopeLabel(scope: ClassifierModel["scope"]) {
  const labels: Record<ClassifierModel["scope"], string> = {
    global: "全局基线",
    knowledge_base: "知识库专属",
    session: "会话实验",
  };
  return labels[scope] ?? "知识库专属";
}

function classifierStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ready: "已训练",
    running: "训练中",
    failed: "训练失败",
  };
  return labels[status] ?? status;
}

function parseClassifierModelMetrics(metricsJson?: string): Record<string, number> {
  if (!metricsJson) {
    return {};
  }
  try {
    const parsed = JSON.parse(metricsJson) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
    );
  } catch {
    return {};
  }
}

function formatMetricPercent(value?: number) {
  if (typeof value !== "number") {
    return "-";
  }
  return `${Math.round(value * 100)}%`;
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

function EmptyState({
  user,
  selectedKnowledgeBase,
}: {
  user: AuthUser;
  selectedKnowledgeBase: KnowledgeBase;
}) {
  const firstName = user.name?.trim() || user.email.split("@", 1)[0] || "你好";
  return (
    <div className="mx-auto flex h-full min-h-[420px] max-w-3xl flex-col items-center justify-center px-4 pb-24 pt-10 text-center lg:py-10">
      <div className="lg:rounded-[28px] lg:border lg:border-white/72 lg:bg-white/54 lg:px-8 lg:py-7 lg:shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:backdrop-blur-xl">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/76 text-[var(--accent-strong)] shadow-sm ring-1 ring-white/80 lg:mb-4 lg:h-12 lg:w-12 lg:border lg:border-[var(--accent-soft)] lg:bg-white/82">
          <Sparkles size={21} aria-hidden="true" />
        </div>
        <h2 className="text-[30px] font-semibold leading-tight tracking-normal text-slate-950 sm:text-[34px] lg:text-[30px]">
          {firstName}，你好，我们开始吧
        </h2>
        <p className="mx-auto mt-4 max-w-[300px] text-sm leading-6 text-[var(--muted)] lg:max-w-md">
          当前使用 {selectedKnowledgeBase.name}
        </p>
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
    <div className={cn("flex gap-2.5 lg:gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/78 text-[var(--accent-strong)] shadow-sm backdrop-blur sm:flex">
          <Bot size={17} aria-hidden="true" />
        </div>
      ) : null}
      <article
        className={cn(
          "group max-w-[min(720px,94%)] text-[15px] leading-7 lg:max-w-[min(720px,92%)]",
          isUser
            ? "rounded-[24px] bg-white/86 px-4 py-2.5 text-[var(--foreground)] shadow-sm backdrop-blur lg:rounded-3xl lg:border lg:border-[var(--accent-soft)] lg:bg-white/78 lg:px-5 lg:py-3"
            : "text-[var(--foreground)]",
        )}
      >
        <div className="whitespace-pre-wrap break-words">{message.content || "..."}</div>
        {!isUser && message.sources?.length ? (
          <div className="mt-4 flex flex-wrap gap-1.5 text-xs text-[var(--accent-strong)]">
            {message.sources.map((source) => (
              <span key={source.chunk_id} className="rounded-full border border-[var(--accent-soft)] bg-white/72 px-2 py-0.5">
                [{source.index}] {source.title}
              </span>
            ))}
          </div>
        ) : null}
        {!isUser ? (
          <div className="mt-3 flex flex-wrap items-center gap-1 text-[var(--muted)] opacity-75 transition group-hover:opacity-100">
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
    <form onSubmit={onSubmit} className="mobile-composer pointer-events-none absolute inset-x-0 bottom-0 z-20 shrink-0 px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] lg:static lg:pointer-events-auto lg:px-4 lg:pb-4">
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-[30px] border border-white/86 bg-white/92 p-2 shadow-[0_18px_60px_rgba(15,23,42,0.13)] backdrop-blur-xl transition focus-within:border-white focus-within:bg-white focus-within:shadow-[0_22px_70px_rgba(15,23,42,0.16)] lg:rounded-[26px] lg:p-3">
        <div className="flex min-h-[58px] items-end gap-2 lg:block lg:min-h-0">
          <button
            type="button"
            className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-950 transition hover:bg-[var(--panel-strong)] lg:hidden"
            aria-label="更多输入方式"
          >
            <Plus size={29} strokeWidth={1.9} aria-hidden="true" />
          </button>
          <textarea
            value={input}
            onChange={(event) => onInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="询问 Maverella"
            className="chat-composer-input min-h-[52px] flex-1 resize-none border-0 bg-transparent px-1 py-3 text-[17px] leading-7 text-[var(--foreground)] outline-none placeholder:text-slate-400 lg:min-h-16 lg:w-full lg:px-3 lg:py-2 lg:text-base"
            rows={1}
            maxLength={2000}
          />
          <Button type="button" variant="ghost" size="icon" className="mb-1 h-11 w-11 shrink-0 rounded-full text-slate-500 hover:bg-[var(--panel-strong)] lg:hidden" title="语音输入" aria-label="语音输入">
            <Mic size={24} strokeWidth={2.1} aria-hidden="true" />
          </Button>
          <Button type="submit" variant="primary" size="icon" className="mb-1 h-11 w-11 shrink-0 rounded-full bg-slate-950 text-white hover:bg-slate-800 lg:bg-[linear-gradient(180deg,#08786e_0%,var(--accent-strong)_100%)]" disabled={status === "streaming"} title="发送" aria-label="发送">
            {status === "streaming" ? (
              <Loader2 className="animate-spin" size={16} aria-hidden="true" />
            ) : (
              <Send size={16} aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
      <p className="mx-auto mt-2 hidden max-w-3xl px-2 text-center text-xs leading-5 text-[var(--muted)] sm:text-sm lg:block">
        遇到无法解决的问题，请联系管理员：
        <a className="font-medium text-[var(--accent-strong)] hover:underline" href={`mailto:${ADMIN_CONTACT_EMAIL}`}>
          {ADMIN_CONTACT_EMAIL}
        </a>
      </p>
    </form>
  );
}

function SourcePanel({
  sources,
  knowledgeBases,
  onCollapse,
}: {
  sources: Source[];
  knowledgeBases: KnowledgeBase[];
  onCollapse?: () => void;
}) {
  const nameById = new Map(knowledgeBases.map((knowledgeBase) => [knowledgeBase.id, knowledgeBase.name]));

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden border-white/72 bg-white/72 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <CardHeader className="shrink-0 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">引用来源</h2>
            <p className="text-xs text-[var(--muted)]">{sources.length} 条来源</p>
          </div>
          {onCollapse ? (
            <Button type="button" variant="ghost" size="icon" title="收起引用来源" aria-label="收起引用来源" onClick={onCollapse}>
              <PanelRightClose size={16} aria-hidden="true" />
            </Button>
          ) : (
            <FileText size={18} className="text-[var(--accent)]" aria-hidden="true" />
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
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
                className="rounded-2xl border border-white/80 bg-white/76 p-3 shadow-sm transition hover:border-[var(--accent-soft)] hover:bg-white"
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

function CollapsedRightRail({ onToggle, sources }: { onToggle: () => void; sources: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-between rounded-2xl border border-white/72 bg-white/62 py-3 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <button
        type="button"
        onClick={onToggle}
        className="group relative flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted)] transition hover:bg-white hover:text-[var(--foreground)] hover:shadow-sm"
        aria-label="展开引用来源"
      >
        <PanelRightOpen size={18} aria-hidden="true" />
        <IconTooltip label="展开引用来源" />
      </button>
      <div className="flex flex-col items-center gap-3 text-[var(--muted)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white/72">
          <FileText size={17} aria-hidden="true" />
        </div>
        <span className="rounded-full border border-[var(--accent-soft)] bg-white/76 px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]">
          {sources}
        </span>
      </div>
    </div>
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
    <Card className="flex min-h-0 flex-col overflow-hidden border-white/72 bg-white/72 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <CardHeader className="shrink-0 border-b-0 px-4 pb-2 pt-3">
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
      <CardContent className="px-4 pb-4 pt-0">
        <div className="relative min-h-[118px] overflow-hidden rounded-2xl border border-white/80 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbfc_55%,#f2f7f8_100%)] p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-12 -top-16 h-28 w-28 rounded-full bg-[rgba(0,108,99,0.12)] blur-3xl motion-safe:animate-[ambientBreath_5.2s_ease-in-out_infinite]" />
          <div className="relative grid grid-cols-[42px_minmax(0,1fr)] gap-3">
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

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
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
