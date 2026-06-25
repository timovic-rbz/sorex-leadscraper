import { NextResponse } from "next/server";
import { dbGetLead, dbSetLeadEmail } from "@/lib/db";
import { scrapeEmail } from "@/lib/email-crawler";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/leads/<uid>/find-email
 * Crawlt die hinterlegte Website des Leads nach einer E-Mail, speichert sie
 * am Lead und gibt sie zurück. Hat der Lead schon eine E-Mail, wird die ohne
 * Crawl zurückgegeben.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const id = decodeURIComponent(uid);

  try {
    const lead = await dbGetLead(id);
    if (!lead) return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
    if (lead.email) return NextResponse.json({ email: lead.email, cached: true });
    if (!lead.webseite) {
      return NextResponse.json({ email: "", error: "Keine Website hinterlegt" }, { status: 422 });
    }

    const email = await scrapeEmail(lead.webseite);
    if (email) await dbSetLeadEmail(id, email);
    return NextResponse.json({ email });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
