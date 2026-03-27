import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { ensureEventBusConnected, eventBus } from "@/lib/event-bus";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }

  await ensureEventBusConnected();

  const channel = `notification:${auth.type}:${auth.actorUuid}`;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream closed.
        }
      };

      send(": connected\n\n");

      const handler = (event: unknown) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      };

      eventBus.on(channel, handler);

      const heartbeat = setInterval(() => {
        send(": heartbeat\n\n");
      }, 30_000);

      request.signal.addEventListener("abort", () => {
        eventBus.off(channel, handler);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
