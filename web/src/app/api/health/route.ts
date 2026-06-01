import { NextResponse } from "next/server";

import { proxyBackendHealth } from "@/server/rag/client";

export const runtime = "nodejs";
const PRODUCT_NAME = "Maverella";

export async function GET() {
  try {
    const backend = await proxyBackendHealth();
    return NextResponse.json({
      ok: true,
      app: `${PRODUCT_NAME} web`,
      backend,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        app: `${PRODUCT_NAME} web`,
        backend: null,
        error: error instanceof Error ? error.message : "Backend unavailable",
      },
      { status: 503 },
    );
  }
}
