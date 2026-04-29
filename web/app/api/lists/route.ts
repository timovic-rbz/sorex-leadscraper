import { NextResponse } from "next/server";
import { dbCreateList, dbListsAll } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const lists = await dbListsAll();
    return NextResponse.json({ lists });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }
  if (!body.name) {
    return NextResponse.json({ error: "name fehlt" }, { status: 400 });
  }
  try {
    const list = await dbCreateList(body.name);
    return NextResponse.json({ list });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
