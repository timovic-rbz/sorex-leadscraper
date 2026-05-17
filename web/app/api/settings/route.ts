import { NextResponse } from "next/server";
import { dbAllApiKeys, dbDeleteApiKey, dbSetApiKey } from "@/lib/db";
import { PROVIDERS, getProvider, maskKey } from "@/lib/providers";

export const runtime = "nodejs";

// GET /api/settings → Liste aller Provider mit maskiertem Wert (falls gesetzt).
//                     Klartext wird NIE zum Client geschickt.
export async function GET() {
  try {
    const stored = await dbAllApiKeys();
    const items = PROVIDERS.map((p) => {
      const entry = stored[p.id];
      return {
        id: p.id,
        name: p.name,
        purpose: p.purpose,
        description: p.description,
        docsUrl: p.docsUrl,
        placeholder: p.placeholder,
        patternHint: p.patternHint,
        configured: Boolean(entry),
        masked: entry ? maskKey(entry.value) : null,
        updatedAt: entry?.updatedAt ?? null,
      };
    });
    return NextResponse.json({ providers: items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/settings  body: { provider: string, value: string }
export async function POST(req: Request) {
  let body: { provider?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  const provider = body.provider;
  const raw = body.value ?? "";
  if (!provider) return NextResponse.json({ error: "provider fehlt" }, { status: 400 });

  const meta = getProvider(provider);
  if (!meta) return NextResponse.json({ error: `Unbekannter Provider: ${provider}` }, { status: 400 });

  const value = raw.trim();
  if (!value) return NextResponse.json({ error: "Wert ist leer" }, { status: 400 });
  if (!meta.keyPattern.test(value)) {
    return NextResponse.json({ error: meta.patternHint }, { status: 400 });
  }

  try {
    await dbSetApiKey(provider, value);
    return NextResponse.json({ ok: true, masked: maskKey(value) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE /api/settings?provider=google_places
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider");
  if (!provider) return NextResponse.json({ error: "provider fehlt" }, { status: 400 });

  try {
    await dbDeleteApiKey(provider);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
