import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ knowledgeBaseId: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { knowledgeBaseId } = await context.params;
  try {
    return NextResponse.json(
      await proxyBackendJson(`/api/v1/knowledge-bases/${knowledgeBaseId}/classifier-models`),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "模型列表加载失败。" },
      { status: 502 },
    );
  }
}
