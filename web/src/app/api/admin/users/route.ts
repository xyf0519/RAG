import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";
import type { AuthUser } from "@/shared/types/auth";

type BackendUser = {
  id: string;
  name: string;
  email: string;
  role: AuthUser["role"];
  email_verified_at?: number | null;
  created_at?: number | null;
  last_login_at?: number | null;
  disabled_at?: number | null;
  core_admin?: boolean;
};

type BackendUsersResponse = {
  users?: BackendUser[];
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
      users: (data.users ?? []).map(mapUser),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "用户列表加载失败。" },
      { status: 502 },
    );
  }
}

function mapUser(user: BackendUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerifiedAt: user.email_verified_at ?? null,
    createdAt: user.created_at ?? null,
    lastLoginAt: user.last_login_at ?? null,
    disabledAt: user.disabled_at ?? null,
    coreAdmin: Boolean(user.core_admin),
  };
}
