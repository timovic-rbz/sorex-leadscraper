import { NextResponse } from "next/server";
import { getSessionInfo } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 5;

export async function GET() {
  const info = await getSessionInfo();
  return NextResponse.json(info);
}
