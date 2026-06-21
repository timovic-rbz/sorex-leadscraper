import { NextResponse } from "next/server";
import { getCompetitors } from "@/lib/dataforseo";
import { dbGetLeadEnrichment, dbSaveLeadCompetitors } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/competitors
 *
 * Lokaler Konkurrenz-Vergleich (Google-Maps-Umfeld) zum Keyword
 * "Dienstleistung + Ort". Gecacht pro Lead.
 *
 * Body: { service, city, uid?, selfName?, force? }
 */
export async function POST(req: Request) {
  let body: { service?: string; city?: string; uid?: string; selfName?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  if (!body.service || !body.city) {
    return NextResponse.json({ error: "service und city erforderlich" }, { status: 400 });
  }

  if (body.uid && !body.force) {
    const cached = await dbGetLeadEnrichment(body.uid);
    if (cached?.competitors) {
      return NextResponse.json({ competitors: cached.competitors, cached: true, at: cached.competitorsAt });
    }
  }

  try {
    const competitors = await getCompetitors(body.service, body.city, body.selfName);
    if (body.uid) await dbSaveLeadCompetitors(body.uid, competitors);
    return NextResponse.json({ competitors, cached: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
