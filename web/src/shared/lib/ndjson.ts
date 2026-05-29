import type { ChatStreamEvent } from "@/shared/types/chat";

export function parseNdjsonLine(line: string): ChatStreamEvent {
  const parsed: unknown = JSON.parse(line);
  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    throw new Error("Invalid stream event");
  }

  if (
    parsed.type !== "status" &&
    parsed.type !== "delta" &&
    parsed.type !== "final" &&
    parsed.type !== "error"
  ) {
    throw new Error(`Unsupported stream event type: ${parsed.type}`);
  }

  if (!isRecord(parsed.payload)) {
    throw new Error("Invalid stream payload");
  }

  return parsed as ChatStreamEvent;
}

export async function* readNdjsonStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          yield parseNdjsonLine(trimmed);
        }
      }
    }

    buffer += decoder.decode();
    const trimmed = buffer.trim();
    if (trimmed) {
      yield parseNdjsonLine(trimmed);
    }
  } finally {
    reader.releaseLock();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
