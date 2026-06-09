export type ErrorCode =
  | "BACKEND_UNAVAILABLE"
  | "INDEX_NOT_READY"
  | "LLM_TIMEOUT"
  | "NO_REFERENCE"
  | "OUT_OF_SCOPE";

export type Source = {
  index: number;
  doc_id: string;
  chunk_id: string;
  title: string;
  score: number;
  text: string;
  knowledge_base_id?: string;
};

export type Boundary = {
  is_in_scope: boolean;
  probability: number;
  reason: string;
};

export type Timings = {
  llm_elapsed_seconds: number;
  total_elapsed_seconds: number;
};

export type ChatRequest = {
  query: string;
  session_id?: string;
  knowledge_base_id?: string;
};

export type ChatFinalPayload = {
  answer: string;
  session_id: string;
  knowledge_base_id?: string;
  rewritten_query: string;
  boundary: Boundary;
  sources: Source[];
  used_llm: boolean;
  timings: Timings;
  error_code?: ErrorCode | null;
  error?: string | null;
};

export type ChatStatusPayload = {
  stage: string;
  message: string;
  ts?: number;
};

export type ChatDeltaPayload = {
  text: string;
};

export type ChatErrorPayload = {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  session_id?: string;
};

export type FeedbackRating = "up" | "down";

export type ChatFeedback = {
  rating: FeedbackRating;
  createdAt: number;
};

export type ChatStreamEvent =
  | { type: "status"; payload: ChatStatusPayload }
  | { type: "delta"; payload: ChatDeltaPayload }
  | { type: "final"; payload: ChatFinalPayload }
  | { type: "error"; payload: ChatErrorPayload };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  sources?: Source[];
  boundary?: Boundary;
  rewrittenQuery?: string;
  timings?: Timings;
  errorCode?: ErrorCode | null;
  favorite?: boolean;
  feedback?: ChatFeedback;
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
};

export type BackendHealth = {
  ok: boolean;
  app: string;
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
  createdAt: number;
  updatedAt: number;
  turnCount: number;
  sourceCount: number;
  hasFeedback: boolean;
};

export type KnowledgeBase = {
  id: string;
  name: string;
  description: string;
  status: "active" | "disabled";
  document_count: number;
  index_status: "not_indexed" | "pending" | "building" | "ready" | "failed";
  last_indexed_at?: number | null;
  active_classifier_model_id?: string | null;
  updated_at: number;
  created_at: number;
};

export type KnowledgeDocument = {
  id: string;
  knowledge_base_id: string;
  filename: string;
  title: string;
  size: number;
  status: string;
  created_at: number;
};

export type IndexJob = {
  id: string;
  knowledge_base_id: string;
  status: "running" | "succeeded" | "failed";
  message: string;
  created_at: number;
  finished_at?: number | null;
};

export type ClassifierModel = {
  id: string;
  knowledge_base_id: string;
  name: string;
  scope: "global" | "knowledge_base" | "session";
  alias: string;
  version: number;
  status: string;
  artifact_path: string;
  metrics_json: string;
  job_id: string;
  created_at: number;
  activated_at?: number | null;
};

export type BoundaryDatasetItem = {
  id: string;
  knowledge_base_id: string;
  text: string;
  label: 0 | 1;
  source: "manual" | "llm";
  status: "draft" | "approved";
  created_at: number;
};

export type BoundaryTrainingJob = {
  id: string;
  knowledge_base_id: string;
  status: "running" | "succeeded" | "failed";
  message: string;
  created_at: number;
  finished_at?: number | null;
};
