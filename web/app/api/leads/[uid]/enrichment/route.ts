import { NextResponse } from "next/server";
import { dbGetLeadEnrichment } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/leads/[uid]/enrichment
 *
 * Liest die gecachte DataForSEO-Anreicherung (Profil + Website-Check) eines
 * Leads – reiner DB-Read, kein externer API-Call, keine Kosten. Wird vom
 * Lead-Modal beim Öffnen aufgerufen, um bereits Bezahltes sofort anzuzeigen.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  try {
    const enrichment = await dbGetLeadEnrichment(decodeURIComponent(uid));
    return NextResponse.json({ enrichment });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
