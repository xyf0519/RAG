import { NextRequest, NextResponse } from "next/server";

import { proxyBackendJson } from "@/server/rag/client";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ knowledgeBaseId: string }> },
) {
  const { knowledgeBaseId } = await context.params;
  try {
    return NextResponse.json(
      await proxyBackendJson(`/api/v1/knowledge-bases/${knowledgeBaseId}/index-jobs`, {
        method: "POST",
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "索引任务创建失败。" },
      { status: 502 },
    );
  }
}
