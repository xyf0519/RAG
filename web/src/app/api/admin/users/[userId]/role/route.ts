import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";
import { mapAuthUser, type BackendAuthUser } from "@/shared/lib/auth-user";
import type { UserRole } from "@/shared/types/auth";

type BackendAuthResponse = {
  user?: BackendAuthUser | null;
  message?: string;
};

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as { role?: UserRole };
  if (body.role !== "admin" && body.role !== "user") {
    return NextResponse.json({ error: "用户角色不正确。" }, { status: 400 });
  }

  const { userId } = await context.params;
  let data: BackendAuthResponse;
  try {
    data = (await proxyBackendJson(
      `/api/v1/auth/admin/users/${encodeURIComponent(userId)}/role?operator_user_id=${encodeURIComponent(auth.user.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: body.role }),
      },
    )) as BackendAuthResponse;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "权限更新失败。" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    user: data.user ? mapAuthUser(data.user) : null,
    message: data.message ?? "权限已更新。",
  });
}
