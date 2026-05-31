import { NextRequest, NextResponse } from "next/server";

import { proxyBackendJson } from "@/server/rag/client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json(
      await proxyBackendJson("/api/v1/auth/register/start", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "验证码发送失败。" },
      { status: 400 },
    );
  }
}
