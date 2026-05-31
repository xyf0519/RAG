import { NextRequest, NextResponse } from "next/server";

import { requireAdmin, requireUser } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ knowledgeBaseId: string }> },
) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
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
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return auth.response;
  }
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
