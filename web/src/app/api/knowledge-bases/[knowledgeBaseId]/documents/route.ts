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
      await proxyBackendJson(`/api/v1/knowledge-bases/${knowledgeBaseId}/documents`),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "文档列表加载失败。" },
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
    const formData = await request.formData();
    return NextResponse.json(
      await proxyBackendJson(`/api/v1/knowledge-bases/${knowledgeBaseId}/documents`, {
        method: "POST",
        body: formData,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "文档上传失败。" },
      { status: 502 },
    );
  }
}
