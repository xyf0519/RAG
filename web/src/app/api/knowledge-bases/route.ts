import { NextRequest, NextResponse } from "next/server";

import { proxyBackendJson } from "@/server/rag/client";

export const runtime = "nodejs";

export async function GET() {
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
