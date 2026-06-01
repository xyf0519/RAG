import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/server/auth/session";
import { getBackendUrl } from "@/server/rag/client";

export const runtime = "nodejs";

type ConnectivityTarget = "rag" | "model";

type ConnectivityPayload = {
  target?: ConnectivityTarget;
  url?: string;
  apiKey?: string;
};

const TIMEOUT_MS = 8_000;

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: ConnectivityPayload;
  try {
    body = (await request.json()) as ConnectivityPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "请求体必须是 JSON。" }, { status: 400 });
  }

  if (body.target !== "rag" && body.target !== "model") {
    return NextResponse.json({ ok: false, message: "测试类型不正确。" }, { status: 400 });
  }

  const parsed = parseHttpUrl(body.url);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 });
  }

  const startedAt = Date.now();
  const endpoint =
    body.target === "rag" && body.url === "desktop-backend"
      ? new URL("/health", getBackendUrl())
      : body.target === "rag"
        ? new URL("/health", parsed.url)
        : new URL("/models", parsed.url);
  try {
    const response = await fetch(endpoint, {
      headers: body.target === "model" && body.apiKey
        ? { Authorization: `Bearer ${body.apiKey}` }
        : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: response.status,
          latencyMs,
          message: `连接成功，但服务返回 ${response.status}。`,
        },
        { status: 200 },
      );
    }
    return NextResponse.json({
      ok: true,
      status: response.status,
      latencyMs,
      message: body.target === "rag" ? "RAG 服务可访问。" : "模型 API 可访问。",
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    return NextResponse.json({
      ok: false,
      latencyMs,
      message: error instanceof Error ? error.message : "连通性测试失败。",
    });
  }
}

function parseHttpUrl(value?: string): { ok: true; url: URL } | { ok: false; message: string } {
  if (value === "desktop-backend") {
    return { ok: true, url: new URL(getBackendUrl()) };
  }
  if (!value?.trim()) {
    return { ok: false, message: "请输入 URL。" };
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, message: "URL 格式不正确。" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "仅支持 http 或 https URL。" };
  }
  return { ok: true, url };
}
