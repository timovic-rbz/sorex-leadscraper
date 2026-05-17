import type { SearchRequest, SearchResponse, Lead } from "@/lib/types";
import { searchOsm } from "@/lib/osm";
import { searchGoogle } from "@/lib/google-places";
import { scrapeEmailsParallel } from "@/lib/email-crawler";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Pro: 60s, Hobby: clamp auf 10s

/**
 * NDJSON-Streaming-Response: jede Zeile ein JSON-Event.
 *
 *   {"event":"places","count":17}                              // Adressen gefunden
 *   {"event":"emails","done":3,"total":17}                     // E-Mail-Crawl-Progress
 *   {"event":"done","result":{leads,totalFound,...}}           // Endergebnis
 *   {"event":"error","message":"..."}                          // Fehler (Stream endet)
 */
export async function POST(req: Request) {
  let body: SearchRequest;
  try {
    body = (await req.json()) as SearchRequest;
  } catch {
    return jsonError("Ungültiger JSON-Body", 400);
  }

  const { ort, dienstleistung, source, scrapeEmails } = body;
  const maxResults = Math.min(60, Math.max(5, Number(body.maxResults) || 20));
  if (!ort || !dienstleistung) {
    return jsonError("ort und dienstleistung sind Pflicht", 400);
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const totalBudgetMs = 55_000;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        // Phase 1: Places
        let leads: Lead[];
        try {
          leads =
            source === "google"
              ? await searchGoogle(dienstleistung, ort, maxResults)
              : await searchOsm(dienstleistung, ort, maxResults);
        } catch (e) {
          send({ event: "error", message: (e as Error).message });
          controller.close();
          return;
        }

        send({ event: "places", count: leads.length });

        // Phase 2: E-Mail-Crawl (optional)
        if (scrapeEmails && leads.length > 0) {
          const targets = leads
            .filter((l) => l.webseite && !l.email)
            .map((l) => ({ uid: l.uid, website: l.webseite }));

          if (targets.length > 0) {
            send({ event: "emails", done: 0, total: targets.length });
            const remaining = totalBudgetMs - (Date.now() - startedAt);
            const emailBudget = Math.max(5_000, Math.floor(remaining * 0.8));

            const emailsMap = await scrapeEmailsParallel(targets, {
              budgetMs: emailBudget,
              onProgress: (done, total) => send({ event: "emails", done, total }),
            });

            for (const l of leads) {
              const found = emailsMap.get(l.uid);
              if (found) l.email = found;
            }
          }
        }

        const result: SearchResponse = {
          leads,
          totalFound: leads.length,
          withPhone: leads.filter((l) => l.telefon).length,
          withWebsite: leads.filter((l) => l.webseite).length,
          withEmail: leads.filter((l) => l.email).length,
        };
        send({ event: "done", result });
      } catch (e) {
        send({ event: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ event: "error", message }) + "\n", {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
