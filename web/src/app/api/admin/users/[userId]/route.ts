import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { userId } = await context.params;
  try {
    const data = await proxyBackendJson(
      `/api/v1/auth/admin/users/${encodeURIComponent(userId)}?operator_user_id=${encodeURIComponent(auth.user.id)}`,
      { method: "DELETE" },
    );
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "用户删除失败。" },
      { status: 502 },
    );
  }
}
