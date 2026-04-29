import { NextResponse } from "next/server";
import { dbGetLead, dbUpdateLead, type LeadPatch } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(_req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  try {
    const lead = await dbGetLead(decodeURIComponent(uid));
    if (!lead) return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
    return NextResponse.json({ lead });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  let body: LeadPatch;
  try {
    body = (await req.json()) as LeadPatch;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }
  try {
    const lead = await dbUpdateLead(decodeURIComponent(uid), body);
    if (!lead) return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
    return NextResponse.json({ lead });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
