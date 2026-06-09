import { NextResponse } from "next/server";
import { dbCoverage } from "@/lib/db";
import { getSessionInfo } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET() {
  const info = await getSessionInfo();
  if (!info.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const rows = await dbCoverage();
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
