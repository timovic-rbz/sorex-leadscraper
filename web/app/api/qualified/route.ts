import { NextResponse } from "next/server";
import { dbQualifiedLeads } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET() {
  try {
    const leads = await dbQualifiedLeads();
    return NextResponse.json({ leads });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
