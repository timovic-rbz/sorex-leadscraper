import { NextResponse } from "next/server";
import { dbDeleteList, dbLeadsByList, dbListById } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ungültige ID" }, { status: 400 });
  }
  try {
    const list = await dbListById(id);
    if (!list) return NextResponse.json({ error: "Liste nicht gefunden" }, { status: 404 });
    const leads = await dbLeadsByList(id);
    return NextResponse.json({ list, leads });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ungültige ID" }, { status: 400 });
  }
  try {
    await dbDeleteList(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
