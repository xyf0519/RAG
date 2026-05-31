import { NextRequest, NextResponse } from "next/server";

import { setSessionCookie } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";
import type { AuthUser } from "@/shared/types/auth";

export const runtime = "nodejs";

type RegisterResponse = {
  ok: boolean;
  user?: AuthUser | null;
  message?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = (await proxyBackendJson("/api/v1/auth/register/verify", {
      method: "POST",
      body: JSON.stringify(body),
    })) as RegisterResponse;
    const response = NextResponse.json(data);
    if (data.user) {
      setSessionCookie(response, data.user.id);
    }
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "注册失败。" },
      { status: 400 },
    );
  }
}
