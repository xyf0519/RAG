import { NextRequest, NextResponse } from "next/server";

import { requireKnowledgeOperator, requireUser } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  try {
    return NextResponse.json(await proxyBackendJson("/api/v1/knowledge-bases"));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "知识库列表加载失败。" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireKnowledgeOperator(request);
  if (!auth.ok) {
    return auth.response;
  }
  try {
    const body = await request.json();
    return NextResponse.json(
      await proxyBackendJson("/api/v1/knowledge-bases", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "知识库创建失败。" },
      { status: 502 },
    );
  }
}
