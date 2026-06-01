import { NextResponse } from "next/server";

import { isDesktopMode } from "@/shared/config/runtime";
import { getCurrentUser } from "@/server/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    ok: true,
    user,
    mode: isDesktopMode() ? "desktop" : "web",
  });
}
