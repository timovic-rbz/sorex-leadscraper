import { NextResponse } from "next/server";
import { dbCount, dbExistingUids, dbLoadAll, dbUpsert } from "@/lib/db";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/leads          -> { count, leads }   (alle, alle Listen)
export async function GET() {
  try {
    const [count, leads] = await Promise.all([dbCount(), dbLoadAll()]);
    return NextResponse.json({ count, leads });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/leads               -> body: { leads: Lead[], listId: number }   speichert/upserts in Liste
// POST /api/leads?action=check  -> body: { uids: string[] }                  prüft Existenz
export async function POST(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  try {
    if (action === "check") {
      const uids = (body as { uids?: string[] }).uids ?? [];
      const existing = await dbExistingUids(uids);
      return NextResponse.json({ existing: [...existing] });
    }

    const { leads, listId } = body as { leads?: Lead[]; listId?: number };
    if (!listId || !Number.isFinite(listId)) {
      return NextResponse.json({ error: "listId fehlt" }, { status: 400 });
    }
    const result = await dbUpsert(leads ?? [], listId);
    return NextResponse.json({ ...result, count: await dbCount() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
