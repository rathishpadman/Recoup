import {
  subscribeForensicsReadModelEvents,
  type ForensicsReadModelEvent
} from "../../read-model-cache.ts";

export const runtime = "nodejs";

const defaultMaxEventStreamMs = 240_000;

export function GET(request: Request): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  function cleanup(): void {
    unsubscribe?.();
    unsubscribe = undefined;
    if (closeTimer !== undefined) {
      clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cleanup();
    },
    start(controller) {
      const send = (event: ForensicsReadModelEvent): void => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(formatSseEvent(event)));
      };
      send({ status: "connected", type: "connected" });
      unsubscribe = subscribeForensicsReadModelEvents(send);
      closeTimer = setTimeout(() => {
        closed = true;
        cleanup();
        controller.close();
      }, readMaxEventStreamMs());
      request.signal.addEventListener(
        "abort",
        () => {
          closed = true;
          cleanup();
        },
        { once: true }
      );
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    }
  });
}

function formatSseEvent(event: ForensicsReadModelEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function readMaxEventStreamMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.RECOUP_FORENSICS_EVENTS_MAX_STREAM_MS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return defaultMaxEventStreamMs;
}
