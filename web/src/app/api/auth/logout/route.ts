import { NextResponse } from "next/server";

import { clearSessionCookie } from "@/server/auth/session";
import { isDesktopMode } from "@/shared/config/runtime";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  if (isDesktopMode()) {
    return response;
  }
  clearSessionCookie(response);
  return response;
}
