import { NextResponse } from "next/server";
import { dbLookupLeads } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 3) {
    return NextResponse.json({ leads: [] });
  }
  try {
    const leads = await dbLookupLeads(q);
    return NextResponse.json({ leads });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
