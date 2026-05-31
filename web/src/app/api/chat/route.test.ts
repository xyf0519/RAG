import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("/api/chat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a typed error event for invalid payloads", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ query: "" }),
    }) as Parameters<typeof POST>[0];

    const response = await POST(request);
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain("请输入问题后再发送");
    expect(text).toContain("BACKEND_UNAVAILABLE");
  });

  it("forwards the selected knowledge base to the backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          query: "校园卡丢了怎么办",
          session_id: "session-a",
          knowledge_base_id: "kb-campus-card",
        });
        return new Response(
          `${JSON.stringify({
            type: "final",
            payload: {
              answer: "已完成",
              session_id: "session-a",
              knowledge_base_id: "kb-campus-card",
              rewritten_query: "校园卡丢失",
              boundary: { is_in_scope: true, probability: 1, reason: "classified" },
              sources: [],
              used_llm: false,
              timings: { llm_elapsed_seconds: 0, total_elapsed_seconds: 0.1 },
              error_code: null,
              error: null,
            },
          })}\n`,
          {
            headers: { "Content-Type": "application/x-ndjson" },
          },
        );
      }),
    );

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        query: "校园卡丢了怎么办",
        session_id: "session-a",
        knowledge_base_id: "kb-campus-card",
      }),
    }) as Parameters<typeof POST>[0];

    const response = await POST(request);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("kb-campus-card");
  });
});
