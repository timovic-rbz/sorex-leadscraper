import { NextResponse } from "next/server";
import type { SearchRequest, SearchResponse, Lead } from "@/lib/types";
import { searchOsm } from "@/lib/osm";
import { searchGoogle } from "@/lib/google-places";
import { scrapeEmailsParallel } from "@/lib/email-crawler";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Pro: 60s, Hobby: clamp auf 10s

export async function POST(req: Request) {
  let body: SearchRequest;
  try {
    body = (await req.json()) as SearchRequest;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  const { ort, dienstleistung, source, maxResults, scrapeEmails } = body;
  if (!ort || !dienstleistung) {
    return NextResponse.json({ error: "ort und dienstleistung sind Pflicht" }, { status: 400 });
  }

  let leads: Lead[];
  try {
    leads =
      source === "google"
        ? await searchGoogle(dienstleistung, ort, maxResults)
        : await searchOsm(dienstleistung, ort, maxResults);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  if (scrapeEmails && leads.length > 0) {
    const targets = leads
      .filter((l) => l.webseite && !l.email)
      .map((l) => ({ uid: l.uid, website: l.webseite }));
    if (targets.length > 0) {
      const emails = await scrapeEmailsParallel(targets);
      for (const l of leads) {
        const found = emails.get(l.uid);
        if (found) l.email = found;
      }
    }
  }

  const response: SearchResponse = {
    leads,
    totalFound: leads.length,
    withPhone: leads.filter((l) => l.telefon).length,
    withWebsite: leads.filter((l) => l.webseite).length,
    withEmail: leads.filter((l) => l.email).length,
  };
  return NextResponse.json(response);
}
