import {
  subscribeForensicsReadModelEvents,
  type ForensicsReadModelEvent
} from "../../read-model-cache.ts";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      unsubscribe?.();
    },
    start(controller) {
      const send = (event: ForensicsReadModelEvent): void => {
        controller.enqueue(encoder.encode(formatSseEvent(event)));
      };
      send({ status: "connected", type: "connected" });
      unsubscribe = subscribeForensicsReadModelEvents(send);
      request.signal.addEventListener(
        "abort",
        () => {
          unsubscribe?.();
          unsubscribe = undefined;
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
