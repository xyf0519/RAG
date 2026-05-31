import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    ok: true,
    user,
  });
}
