import postgres from "postgres";
import type { DbLead, Lead, LeadStatus, List, ListWithStats } from "./types";
import { LEAD_STATUS_ORDER } from "./types";

// =============================================================================
// Connection (Supabase Postgres)
// =============================================================================
// Erwartet DATABASE_URL (Supabase → Project Settings → Database → Connection
// string → "Transaction" pooler oder "Session" pooler, je nach Use-Case).
// In Serverless (Vercel/Next API routes) → Transaction-Pooler (Port 6543).

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

declare global {
  var __pg: ReturnType<typeof postgres> | undefined;
}

const sql =
  globalThis.__pg ??
  postgres(connectionString, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") globalThis.__pg = sql;

let initialized = false;

async function ensureSchema(): Promise<void> {
  if (initialized) return;

  await sql`
    CREATE TABLE IF NOT EXISTS lists (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`INSERT INTO lists (name) VALUES ('Inbox') ON CONFLICT DO NOTHING`;

  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      uid TEXT PRIMARY KEY,
      source TEXT,
      firmenname TEXT,
      telefon TEXT,
      adresse TEXT,
      webseite TEXT,
      email TEXT,
      bewertung TEXT,
      anzahl_reviews INTEGER,
      google_maps TEXT,
      oeffnungszeiten TEXT,
      kategorie TEXT,
      status TEXT,
      ort TEXT,
      dienstleistung TEXT,
      first_seen TIMESTAMPTZ DEFAULT NOW(),
      last_seen TIMESTAMPTZ DEFAULT NOW(),
      contacted BOOLEAN DEFAULT FALSE
    )
  `;

  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS list_id INTEGER REFERENCES lists(id) ON DELETE CASCADE`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'new'`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact TIMESTAMPTZ`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_count INTEGER DEFAULT 0`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ`;

  await sql`
    UPDATE leads
    SET list_id = (SELECT id FROM lists WHERE name = 'Inbox')
    WHERE list_id IS NULL
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      provider TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  initialized = true;
}

// =============================================================================
// API KEYS – managed at runtime via /settings (instead of env vars)
// =============================================================================

export async function dbGetApiKey(provider: string): Promise<string | null> {
  await ensureSchema();
  const rows = await sql<{ value: string }[]>`
    SELECT value FROM api_keys WHERE provider = ${provider}
  `;
  return rows[0]?.value ?? null;
}

export async function dbAllApiKeys(): Promise<Record<string, { value: string; updatedAt: string }>> {
  await ensureSchema();
  const rows = await sql<{ provider: string; value: string; updated_at: string }[]>`
    SELECT provider, value, updated_at FROM api_keys
  `;
  return Object.fromEntries(
    rows.map((r) => [r.provider, { value: r.value, updatedAt: r.updated_at }]),
  );
}

export async function dbSetApiKey(provider: string, value: string): Promise<void> {
  await ensureSchema();
  await sql`
    INSERT INTO api_keys (provider, value, updated_at)
    VALUES (${provider}, ${value}, NOW())
    ON CONFLICT (provider) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function dbDeleteApiKey(provider: string): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM api_keys WHERE provider = ${provider}`;
}

// =============================================================================
// LISTS
// =============================================================================

export async function dbCreateList(name: string): Promise<List> {
  await ensureSchema();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name darf nicht leer sein");
  const rows = await sql<{ id: number; name: string; created_at: string }[]>`
    INSERT INTO lists (name) VALUES (${trimmed})
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name, created_at
  `;
  const r = rows[0];
  return { id: r.id, name: r.name, createdAt: r.created_at };
}

export async function dbDeleteList(id: number): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM lists WHERE id = ${id}`;
}

export async function dbListsAll(): Promise<ListWithStats[]> {
  await ensureSchema();
  const rows = await sql<
    {
      id: number;
      name: string;
      created_at: string;
      total: string;
      by_status: Record<string, number>;
    }[]
  >`
    SELECT
      l.id,
      l.name,
      l.created_at,
      COALESCE(SUM(le.cnt), 0)::text AS total,
      COALESCE(
        jsonb_object_agg(le.lead_status, le.cnt) FILTER (WHERE le.lead_status IS NOT NULL),
        '{}'::jsonb
      ) AS by_status
    FROM lists l
    LEFT JOIN (
      SELECT list_id, lead_status, COUNT(*)::int AS cnt
      FROM leads
      GROUP BY list_id, lead_status
    ) AS le ON le.list_id = l.id
    GROUP BY l.id, l.name, l.created_at
    ORDER BY l.created_at DESC
  `;

  return rows.map((r) => {
    const byStatus = LEAD_STATUS_ORDER.reduce(
      (acc, s) => ({ ...acc, [s]: r.by_status[s] ?? 0 }),
      {} as Record<LeadStatus, number>,
    );
    return {
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      total: Number(r.total),
      byStatus,
    };
  });
}

export async function dbListById(id: number): Promise<List | null> {
  await ensureSchema();
  const rows = await sql<{ id: number; name: string; created_at: string }[]>`
    SELECT id, name, created_at FROM lists WHERE id = ${id}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: r.id, name: r.name, createdAt: r.created_at };
}

// =============================================================================
// LEADS – Lookup, Upsert, Update
// =============================================================================

export async function dbExistingUids(uids: string[]): Promise<Set<string>> {
  if (uids.length === 0) return new Set();
  await ensureSchema();
  const rows = await sql<{ uid: string }[]>`
    SELECT uid FROM leads WHERE uid = ANY(${uids}::text[])
  `;
  return new Set(rows.map((r) => r.uid));
}

export async function dbUpsert(
  leads: Lead[],
  listId: number,
): Promise<{ inserted: number; updated: number }> {
  if (leads.length === 0) return { inserted: 0, updated: 0 };
  await ensureSchema();

  const existing = await dbExistingUids(leads.map((l) => l.uid));
  const inserted = leads.filter((l) => !existing.has(l.uid)).length;
  const updated = leads.length - inserted;

  // Bulk-Insert in Chunks à 200: ein einziges Multi-VALUES-Statement statt N
  // Round-Trips. Bei 340 Leads: 2 Queries × ~150ms statt 340 × ~80ms.
  // Chunk-Grenze schützt vor "too many parameters" (PG-Limit: 65k Bind-Params).
  const CHUNK = 200;
  const rows = leads.map((l) => ({
    uid: l.uid,
    list_id: listId,
    source: l.source,
    firmenname: l.firmenname,
    telefon: l.telefon,
    adresse: l.adresse,
    webseite: l.webseite,
    email: l.email,
    bewertung: l.bewertung,
    anzahl_reviews: l.anzahlReviews,
    google_maps: l.googleMaps,
    oeffnungszeiten: l.oeffnungszeiten,
    kategorie: l.kategorie,
    status: l.status,
    ort: l.ort,
    dienstleistung: l.dienstleistung,
  }));

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await sql`
      INSERT INTO leads ${sql(
        slice,
        "uid",
        "list_id",
        "source",
        "firmenname",
        "telefon",
        "adresse",
        "webseite",
        "email",
        "bewertung",
        "anzahl_reviews",
        "google_maps",
        "oeffnungszeiten",
        "kategorie",
        "status",
        "ort",
        "dienstleistung",
      )}
      ON CONFLICT(uid) DO UPDATE SET
        list_id   = COALESCE(leads.list_id, EXCLUDED.list_id),
        last_seen = NOW(),
        email     = COALESCE(NULLIF(EXCLUDED.email, ''),    leads.email),
        telefon   = COALESCE(NULLIF(EXCLUDED.telefon, ''),  leads.telefon),
        webseite  = COALESCE(NULLIF(EXCLUDED.webseite, ''), leads.webseite)
    `;
  }
  return { inserted, updated };
}

interface DbLeadRow {
  uid: string;
  source: string;
  firmenname: string;
  telefon: string;
  adresse: string;
  webseite: string;
  email: string;
  bewertung: string;
  anzahl_reviews: number;
  google_maps: string;
  oeffnungszeiten: string;
  kategorie: string;
  status: string;
  ort: string;
  dienstleistung: string;
  first_seen: string;
  last_seen: string;
  list_id: number | null;
  lead_status: string;
  notes: string;
  last_contact: string | null;
  call_count: number;
  next_action_at: string | null;
}

function rowToDbLead(r: DbLeadRow): DbLead {
  return {
    uid: r.uid,
    source: r.source as "osm" | "google",
    firmenname: r.firmenname,
    telefon: r.telefon,
    adresse: r.adresse,
    webseite: r.webseite,
    email: r.email,
    bewertung: r.bewertung,
    anzahlReviews: r.anzahl_reviews,
    googleMaps: r.google_maps,
    oeffnungszeiten: r.oeffnungszeiten,
    kategorie: r.kategorie,
    status: r.status,
    ort: r.ort,
    dienstleistung: r.dienstleistung,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    listId: r.list_id,
    leadStatus: (r.lead_status as LeadStatus) ?? "new",
    notes: r.notes ?? "",
    lastContact: r.last_contact,
    callCount: r.call_count ?? 0,
    nextActionAt: r.next_action_at,
  };
}

export async function dbLeadsByList(listId: number): Promise<DbLead[]> {
  await ensureSchema();
  const rows = await sql<DbLeadRow[]>`
    SELECT * FROM leads
    WHERE list_id = ${listId}
    ORDER BY last_contact DESC NULLS LAST, last_seen DESC
  `;
  return rows.map(rowToDbLead);
}

export async function dbLoadAll(): Promise<DbLead[]> {
  await ensureSchema();
  const rows = await sql<DbLeadRow[]>`SELECT * FROM leads ORDER BY last_seen DESC`;
  return rows.map(rowToDbLead);
}

export async function dbCount(): Promise<number> {
  await ensureSchema();
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM leads
  `;
  return Number(rows[0]?.count ?? 0);
}

export interface LeadPatch {
  leadStatus?: LeadStatus;
  notes?: string;
  nextActionAt?: string | null;
  bumpCallCount?: boolean;
  setLastContact?: boolean;
  listId?: number;
}

export async function dbUpdateLead(uid: string, patch: LeadPatch): Promise<DbLead | null> {
  await ensureSchema();

  // postgres.js: dynamische SET-Liste via sql() helper für Identifier + Values.
  // Wir bauen einzelne Updates auf, damit auch bumpCallCount / setLastContact (Ausdrücke
  // ohne Parameter) sauber dazukommen.
  const fragments: ReturnType<typeof sql>[] = [];

  if (patch.leadStatus !== undefined) fragments.push(sql`lead_status = ${patch.leadStatus}`);
  if (patch.notes !== undefined) fragments.push(sql`notes = ${patch.notes}`);
  if (patch.nextActionAt !== undefined) fragments.push(sql`next_action_at = ${patch.nextActionAt}`);
  if (patch.listId !== undefined) fragments.push(sql`list_id = ${patch.listId}`);
  if (patch.bumpCallCount) fragments.push(sql`call_count = call_count + 1`);
  if (patch.setLastContact) fragments.push(sql`last_contact = NOW()`);

  if (fragments.length === 0) return await dbGetLead(uid);

  // SET a, b, c → fragments mit Kommas joinen
  const setClause = fragments.reduce((acc, frag, i) =>
    i === 0 ? frag : sql`${acc}, ${frag}`,
  );

  await sql`UPDATE leads SET ${setClause} WHERE uid = ${uid}`;
  return await dbGetLead(uid);
}

export async function dbGetLead(uid: string): Promise<DbLead | null> {
  await ensureSchema();
  const rows = await sql<DbLeadRow[]>`SELECT * FROM leads WHERE uid = ${uid}`;
  return rows.length > 0 ? rowToDbLead(rows[0]) : null;
}
