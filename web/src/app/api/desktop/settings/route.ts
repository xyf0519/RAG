import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/server/auth/session";
import { proxyBackendJson } from "@/server/rag/client";
import { isDesktopMode } from "@/shared/config/runtime";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isDesktopMode()) {
    return NextResponse.json({ error: "桌面设置仅在本地应用中可用。" }, { status: 404 });
  }
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  try {
    return NextResponse.json(await proxyBackendJson("/api/v1/desktop/settings"));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "桌面设置读取失败。" },
      { status: 502 },
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!isDesktopMode()) {
    return NextResponse.json({ error: "桌面设置仅在本地应用中可用。" }, { status: 404 });
  }
  const auth = await requireUser(request);
  if (!auth.ok) {
    return auth.response;
  }
  try {
    const body = await request.json();
    return NextResponse.json(
      await proxyBackendJson("/api/v1/desktop/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "桌面设置保存失败。" },
      { status: 502 },
    );
  }
}
