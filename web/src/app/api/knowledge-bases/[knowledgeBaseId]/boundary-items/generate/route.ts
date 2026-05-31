import { NextRequest, NextResponse } from "next/server";

import { proxyBackendJson } from "@/server/rag/client";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ knowledgeBaseId: string }> },
) {
  const { knowledgeBaseId } = await context.params;
  try {
    const body = await request.json();
    return NextResponse.json(
      await proxyBackendJson(
        `/api/v1/knowledge-bases/${knowledgeBaseId}/boundary-items/generate`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "智能扩充失败。" },
      { status: 502 },
    );
  }
}
