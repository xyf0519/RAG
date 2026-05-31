import { NextRequest, NextResponse } from "next/server";

import { proxyBackendJson } from "@/server/rag/client";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ knowledgeBaseId: string }> },
) {
  const { knowledgeBaseId } = await context.params;
  try {
    return NextResponse.json(
      await proxyBackendJson(`/api/v1/knowledge-bases/${knowledgeBaseId}/boundary-items`),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "样本列表加载失败。" },
      { status: 502 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ knowledgeBaseId: string }> },
) {
  const { knowledgeBaseId } = await context.params;
  try {
    const body = await request.json();
    return NextResponse.json(
      await proxyBackendJson(`/api/v1/knowledge-bases/${knowledgeBaseId}/boundary-items`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "样本添加失败。" },
      { status: 502 },
    );
  }
}
