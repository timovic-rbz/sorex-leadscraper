import { NextResponse } from "next/server";
import { dbLeaderboard } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/leaderboard?window=7d|30d|today|all
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const win = (url.searchParams.get("window") ?? "7d").toLowerCase();

  let sinceIso: string | null = null;
  const now = new Date();
  if (win === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    sinceIso = d.toISOString();
  } else if (win === "7d") {
    sinceIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (win === "30d") {
    sinceIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  } else if (win === "all") {
    sinceIso = null;
  } else {
    return NextResponse.json({ error: "window muss today|7d|30d|all sein" }, { status: 400 });
  }

  try {
    const rows = await dbLeaderboard(sinceIso);
    return NextResponse.json({ window: win, rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
