import { NextRequest, NextResponse } from "next/server";

import { setSessionCookie } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";
import { mapAuthUser, type BackendAuthUser } from "@/shared/lib/auth-user";

export const runtime = "nodejs";

type ResetResponse = {
  ok: boolean;
  user?: BackendAuthUser | null;
  message?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = (await proxyBackendJson("/api/v1/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    })) as ResetResponse;
    const user = data.user ? mapAuthUser(data.user) : null;
    const response = NextResponse.json({ ...data, user });
    if (user) {
      setSessionCookie(response, user.id);
    }
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "密码重置失败。" },
      { status: 400 },
    );
  }
}
