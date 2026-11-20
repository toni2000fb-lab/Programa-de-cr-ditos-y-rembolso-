import { prisma } from "@/server/db";
import { handle } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { listAudit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

const POLL_MS = 1500;

/**
 * Server-Sent Events con las nuevas entradas de auditoría. El cliente envía el último id
 * recibido (Last-Event-ID o ?after=) y el servidor emite lo posterior en tiempo real.
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireUser("ANALISTA");
    const url = new URL(request.url);
    const startFrom = Number(request.headers.get("last-event-id") ?? url.searchParams.get("after") ?? "0");
    let cursor = Number.isFinite(startFrom) && startFrom >= 0 ? startFrom : 0;
    const encoder = new TextEncoder();

    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const tick = async () => {
          if (closed) return;
          try {
            const entries = await listAudit(prisma, { afterId: cursor, limit: 100 });
            for (const entry of entries) {
              cursor = entry.id;
              controller.enqueue(encoder.encode(`id: ${entry.id}\nevent: audit\ndata: ${JSON.stringify(entry)}\n\n`));
            }
            if (entries.length === 0) controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch (e) {
            console.error("[audit-stream]", e);
          }
          if (!closed) timer = setTimeout(tick, POLL_MS);
        };
        controller.enqueue(encoder.encode(`retry: 3000\n\n`));
        void tick();
        request.signal.addEventListener("abort", () => {
          closed = true;
          if (timer) clearTimeout(timer);
          try {
            controller.close();
          } catch {
            /* ya cerrado */
          }
        });
      },
      cancel() {
        closed = true;
        if (timer) clearTimeout(timer);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
