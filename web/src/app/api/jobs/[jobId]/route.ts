import { NextRequest, NextResponse } from "next/server";

import { requireKnowledgeOperator } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const auth = await requireKnowledgeOperator(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { jobId } = await context.params;
  try {
    return NextResponse.json(await proxyBackendJson(`/api/v1/jobs/${jobId}`));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "任务状态加载失败。" },
      { status: 502 },
    );
  }
}
