import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";
import { mapAuthUser, type BackendAuthUser } from "@/shared/lib/auth-user";

type BackendUsersResponse = {
  users?: BackendAuthUser[];
};

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const data = (await proxyBackendJson("/api/v1/auth/admin/users")) as BackendUsersResponse;
    return NextResponse.json({
      ok: true,
      users: (data.users ?? []).map(mapAuthUser),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "用户列表加载失败。" },
      { status: 502 },
    );
  }
}
