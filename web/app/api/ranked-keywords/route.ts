import { NextResponse } from "next/server";
import { getRankedKeywords } from "@/lib/dataforseo";
import { dbGetLeadEnrichment, dbSaveLeadRankedKeywords } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/ranked-keywords
 *
 * Liefert die Keywords, für die die Website eines Leads bei Google rankt
 * (DataForSEO Labs). Gecacht pro Lead. Wird in der UI nur freigeschaltet,
 * wenn die Seite optimiert ist (onpage_score ≥ 70).
 *
 * Body: { url, uid?, force? }
 */
export async function POST(req: Request) {
  let body: { url?: string; uid?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "url erforderlich" }, { status: 400 });
  }

  if (body.uid && !body.force) {
    const cached = await dbGetLeadEnrichment(body.uid);
    if (cached?.rankedKeywords) {
      return NextResponse.json({ keywords: cached.rankedKeywords, cached: true, at: cached.rankedKeywordsAt });
    }
  }

  try {
    const keywords = await getRankedKeywords(url);
    if (body.uid) await dbSaveLeadRankedKeywords(body.uid, keywords);
    return NextResponse.json({ keywords, cached: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
