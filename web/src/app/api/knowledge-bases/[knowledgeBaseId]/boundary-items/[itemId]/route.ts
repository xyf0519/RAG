import { NextRequest, NextResponse } from "next/server";

import { requireKnowledgeOperator } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ knowledgeBaseId: string; itemId: string }> },
) {
  const auth = await requireKnowledgeOperator(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { knowledgeBaseId, itemId } = await context.params;
  try {
    const body = await request.json();
    return NextResponse.json(
      await proxyBackendJson(
        `/api/v1/knowledge-bases/${knowledgeBaseId}/boundary-items/${itemId}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      ),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "样本更新失败。" },
      { status: 502 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ knowledgeBaseId: string; itemId: string }> },
) {
  const auth = await requireKnowledgeOperator(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { knowledgeBaseId, itemId } = await context.params;
  try {
    return NextResponse.json(
      await proxyBackendJson(
        `/api/v1/knowledge-bases/${knowledgeBaseId}/boundary-items/${itemId}`,
        { method: "DELETE" },
      ),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "样本删除失败。" },
      { status: 502 },
    );
  }
}
