import { NextResponse } from "next/server";
import { getKeywordVolumes } from "@/lib/dataforseo";
import { dbSaveLeadKeywordVolumes } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/keyword-volume
 *
 * Freie Suchvolumen-Recherche: beliebige Keywords/Dienstleistungen → monatliches
 * Suchvolumen je Keyword (DataForSEO, ein Request für alle). Ergebnis wird pro
 * Lead gecacht (zur Anzeige beim erneuten Öffnen); jeder Klick ist eine frische
 * Recherche (~5 ct).
 *
 * Body: { keywords: string[], uid? }
 */
export async function POST(req: Request) {
  let body: { keywords?: string[]; uid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  const keywords = (body.keywords ?? []).filter((k) => typeof k === "string" && k.trim());
  if (keywords.length === 0) {
    return NextResponse.json({ error: "Mindestens ein Keyword erforderlich" }, { status: 400 });
  }

  try {
    const volumes = await getKeywordVolumes(keywords);
    if (body.uid) await dbSaveLeadKeywordVolumes(body.uid, volumes);
    return NextResponse.json({ volumes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
