import type { ChatRequest } from "@/shared/types/chat";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const DEFAULT_TIMEOUT_MS = 60_000;

export function getBackendUrl() {
  return (process.env.RAG_BACKEND_URL ?? DEFAULT_BACKEND_URL).replace(/\/$/, "");
}

export function createRequestId() {
  return crypto.randomUUID();
}

function withInternalAuth(headers?: HeadersInit): HeadersInit {
  const token = process.env.INTERNAL_API_KEY;
  return {
    ...(headers ?? {}),
    ...(token ? { "X-Internal-API-Key": token } : {}),
  };
}

export async function proxyBackendHealth() {
  const response = await fetch(`${getBackendUrl()}/health`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Backend health failed with status ${response.status}`);
  }

  return response.json();
}

export async function proxyChatStream(payload: ChatRequest, requestId: string) {
  const response = await fetch(`${getBackendUrl()}/api/v1/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
      ...withInternalAuth(),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Backend chat stream failed with status ${response.status}`);
  }

  return response;
}

export async function proxyBackendJson(path: string, init?: RequestInit) {
  const response = await fetch(`${getBackendUrl()}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    headers: init?.body instanceof FormData
      ? withInternalAuth(init.headers)
      : {
          "Content-Type": "application/json",
          ...withInternalAuth(init?.headers),
        },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : "后端服务处理失败。";
    throw new Error(detail);
  }
  return data;
}

export function buildBackendUnavailableEvent(message = "后端服务连接失败，请确认 FastAPI 已启动。") {
  return `${JSON.stringify({
    type: "error",
    payload: {
      code: "BACKEND_UNAVAILABLE",
      message,
      retryable: true,
    },
  })}\n`;
}
