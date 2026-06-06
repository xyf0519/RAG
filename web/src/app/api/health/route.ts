import { NextResponse } from "next/server";

import { proxyBackendHealth } from "@/server/rag/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const backend = await proxyBackendHealth();
    return NextResponse.json({
      ok: true,
      app: "Maverella web",
      backend,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        app: "Maverella web",
        backend: null,
        error: error instanceof Error ? error.message : "Backend unavailable",
      },
      { status: 503 },
    );
  }
}
