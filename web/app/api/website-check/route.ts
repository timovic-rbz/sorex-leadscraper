import { NextResponse } from "next/server";
import { checkWebsite } from "@/lib/dataforseo";

export const runtime = "nodejs";
// Lighthouse kann lange dauern; das Modul bricht es nach 45s intern ab.
export const maxDuration = 60;

/**
 * POST /api/website-check
 *
 * Analysiert die Website eines Leads über DataForSEO (OnPage + Lighthouse).
 * On-demand aus dem Lead-Modal – nur wenn überhaupt eine Website hinterlegt ist.
 *
 * Body: { url: string }
 */
export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "url erforderlich" }, { status: 400 });
  }

  try {
    const check = await checkWebsite(url);
    return NextResponse.json({ check });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
