import { NextRequest } from "next/server";

import {
  buildBackendUnavailableEvent,
  createRequestId,
  proxyChatStream,
} from "@/server/rag/client";
import type { ChatRequest } from "@/shared/types/chat";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  const payload = await parsePayload(request);

  if (!payload.ok) {
    return new Response(
      `${JSON.stringify({
        type: "error",
        payload: {
          code: "BACKEND_UNAVAILABLE",
          message: payload.message,
          retryable: false,
        },
      })}\n`,
      {
        status: 400,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "X-Request-ID": requestId,
        },
      },
    );
  }

  try {
    const backendResponse = await proxyChatStream(payload.data, requestId);
    return new Response(backendResponse.body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Request-ID": requestId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "RAG 服务响应超时，请稍后重试。"
        : "后端服务连接失败，请确认 FastAPI 已启动。";

    return new Response(buildBackendUnavailableEvent(message), {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Request-ID": requestId,
      },
    });
  }
}

async function parsePayload(
  request: NextRequest,
): Promise<{ ok: true; data: ChatRequest } | { ok: false; message: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, message: "请求体必须是 JSON。" };
  }

  if (!isRecord(body)) {
    return { ok: false, message: "请求体格式不正确。" };
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  const sessionId = typeof body.session_id === "string" ? body.session_id : undefined;
  const knowledgeBaseId =
    typeof body.knowledge_base_id === "string" ? body.knowledge_base_id : undefined;
  if (!query) {
    return { ok: false, message: "请输入问题后再发送。" };
  }
  if (query.length > 2000) {
    return { ok: false, message: "问题太长，请控制在 2000 字以内。" };
  }

  return {
    ok: true,
    data: {
      query,
      session_id: sessionId,
      knowledge_base_id: knowledgeBaseId,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
