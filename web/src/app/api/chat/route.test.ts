import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("/api/chat", () => {
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
});
