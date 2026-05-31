import { NextRequest, NextResponse } from "next/server";

import { proxyBackendJson } from "@/server/rag/client";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ knowledgeBaseId: string }> },
) {
  const { knowledgeBaseId } = await context.params;
  try {
    const body = await request.json();
    return NextResponse.json(
      await proxyBackendJson(`/api/v1/knowledge-bases/${knowledgeBaseId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "知识库更新失败。" },
      { status: 502 },
    );
  }
}
