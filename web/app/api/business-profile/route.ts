import { NextResponse } from "next/server";
import { getBusinessProfile } from "@/lib/dataforseo";
import { dbGetLeadEnrichment, dbSaveLeadProfile } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/business-profile
 *
 * Lädt on-demand das volle Google-Business-Profil eines Leads über DataForSEO
 * (Business Data "My Business Info"). Ergebnis wird pro Lead in der DB gecacht –
 * erneutes Öffnen ist gratis (sofern uid mitgegeben und force nicht gesetzt).
 *
 * Body: { uid?, cid?, placeId?, name?, address?, ort?, force? }
 */
export async function POST(req: Request) {
  let body: {
    uid?: string;
    cid?: string;
    placeId?: string;
    name?: string;
    address?: string;
    ort?: string;
    force?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  if (!body.cid && !body.placeId && !body.name) {
    return NextResponse.json({ error: "cid, placeId oder name erforderlich" }, { status: 400 });
  }

  // Cache: bereits geladenes Profil ohne erneuten (kostenpflichtigen) Call zurückgeben.
  if (body.uid && !body.force) {
    const cached = await dbGetLeadEnrichment(body.uid);
    if (cached?.profile) {
      return NextResponse.json({ profile: cached.profile, cached: true, at: cached.profileAt });
    }
  }

  try {
    const profile = await getBusinessProfile({
      cid: body.cid,
      placeId: body.placeId,
      name: body.name,
      address: body.address,
      ort: body.ort,
    });
    if (body.uid && profile) await dbSaveLeadProfile(body.uid, profile);
    return NextResponse.json({ profile, cached: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
