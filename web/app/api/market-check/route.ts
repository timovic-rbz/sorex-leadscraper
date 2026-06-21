import { NextResponse } from "next/server";
import { getMarketCheck } from "@/lib/dataforseo";
import { dbGetLeadEnrichment, dbSaveLeadMarket } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/market-check
 *
 * Organisches Google-Ranking des Leads zum Hauptkeyword (Dienstleistung + Ort)
 * + monatliches Suchvolumen. Gecacht pro Lead.
 *
 * Body: { service, city, uid?, websiteDomain?, force? }
 */
export async function POST(req: Request) {
  let body: { service?: string; city?: string; uid?: string; websiteDomain?: string; force?: boolean };
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
    if (cached?.market) {
      return NextResponse.json({ market: cached.market, cached: true, at: cached.marketAt });
    }
  }

  try {
    const market = await getMarketCheck({
      service: body.service,
      city: body.city,
      websiteDomain: body.websiteDomain,
    });
    if (body.uid) await dbSaveLeadMarket(body.uid, market);
    return NextResponse.json({ market, cached: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
