import { NextResponse } from "next/server";
import { getBusinessProfile } from "@/lib/dataforseo";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/business-profile
 *
 * Lädt on-demand das volle Google-Business-Profil eines Leads über DataForSEO
 * (Business Data "My Business Info"). Wird vom Lead-Modal beim Klick auf
 * "Profil laden" aufgerufen – bewusst nicht automatisch, um Credits zu sparen.
 *
 * Body: { cid?, placeId?, name?, address?, ort? } – mindestens einer von
 * cid/placeId/name muss gesetzt sein.
 */
export async function POST(req: Request) {
  let body: { cid?: string; placeId?: string; name?: string; address?: string; ort?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  if (!body.cid && !body.placeId && !body.name) {
    return NextResponse.json(
      { error: "cid, placeId oder name erforderlich" },
      { status: 400 },
    );
  }

  try {
    const profile = await getBusinessProfile({
      cid: body.cid,
      placeId: body.placeId,
      name: body.name,
      address: body.address,
      ort: body.ort,
    });
    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
