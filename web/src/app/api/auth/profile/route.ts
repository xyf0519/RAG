import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";
import { mapAuthUser, type BackendAuthUser } from "@/shared/lib/auth-user";

export const runtime = "nodejs";

type ProfileResponse = {
  ok: boolean;
  user?: BackendAuthUser | null;
  message?: string;
};

export async function PATCH(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const data = (await proxyBackendJson(`/api/v1/auth/users/${encodeURIComponent(auth.user.id)}/profile`, {
      method: "PATCH",
      body: JSON.stringify({
        name: body.name,
        avatar_url: body.avatarUrl ?? body.avatar_url ?? null,
      }),
    })) as ProfileResponse;
    return NextResponse.json({
      ok: true,
      user: data.user ? mapAuthUser(data.user) : null,
      message: data.message ?? "个人资料已更新。",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "个人资料保存失败。" },
      { status: 400 },
    );
  }
}
