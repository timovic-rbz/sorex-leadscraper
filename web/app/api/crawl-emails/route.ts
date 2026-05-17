import { NextResponse } from "next/server";
import { scrapeEmailsParallel } from "@/lib/email-crawler";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Crawlt E-Mails für eine kleine Batch von Webseiten. Frontend ruft das
 * iterativ pro Chunk auf (typisch 6 Seiten), damit jeder einzelne Request
 * sicher unter dem Vercel-Hobby-10s-Limit bleibt.
 *
 * Body: { items: [{ uid, website }, ...] }
 * Response: { emails: { uid: "..." } }
 */
export async function POST(req: Request) {
  let body: { items?: Array<{ uid?: string; website?: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  const items = (body.items ?? [])
    .filter((i): i is { uid: string; website: string } => Boolean(i.uid && i.website))
    .slice(0, 10); // Hard-Cap: nie mehr als 10 pro Batch

  if (items.length === 0) {
    return NextResponse.json({ emails: {} });
  }

  try {
    // 8s Budget: hält 2s Buffer für Response + Cold-Start auf Hobby-Plan.
    const result = await scrapeEmailsParallel(items, { budgetMs: 8_000, concurrency: 8 });
    const emails: Record<string, string> = {};
    for (const [uid, email] of result) emails[uid] = email;
    return NextResponse.json({ emails });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
