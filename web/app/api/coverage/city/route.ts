import { NextResponse } from "next/server";
import { dbCityDetail } from "@/lib/db";
import { getSessionInfo } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: Request) {
  const info = await getSessionInfo();
  if (!info.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const ort = (url.searchParams.get("ort") ?? "").trim();
  if (!ort) {
    return NextResponse.json({ error: "ort fehlt" }, { status: 400 });
  }

  try {
    const detail = await dbCityDetail(ort);
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
