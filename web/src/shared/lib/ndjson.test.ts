import { describe, expect, it } from "vitest";

import { parseNdjsonLine, readNdjsonStream } from "./ndjson";

describe("ndjson parser", () => {
  it("parses status events", () => {
    const event = parseNdjsonLine(
      JSON.stringify({ type: "status", payload: { stage: "retrieve", message: "检索" } }),
    );

    expect(event.type).toBe("status");
    if (event.type === "status") {
      expect(event.payload.stage).toBe("retrieve");
    }
  });

  it("rejects unsupported events", () => {
    expect(() => parseNdjsonLine(JSON.stringify({ type: "noop", payload: {} }))).toThrow(
      "Unsupported stream event type",
    );
  });

  it("reads split stream chunks", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode('{"type":"delta","payload":{"text":"你'),
        );
        controller.enqueue(encoder.encode('好"}}\n{"type":"status","payload":{"stage":"done","message":"完成"}}\n'));
        controller.close();
      },
    });

    const events = [];
    for await (const event of readNdjsonStream(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "delta", payload: { text: "你好" } });
  });
});
