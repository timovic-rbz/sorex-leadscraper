import postgres from "postgres";
import type {
  DbLead,
  LeaderboardRow,
  Lead,
  LeadStatus,
  List,
  ListWithStats,
  Setter,
} from "./types";
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
  // Schema-Init wird über Container-Warm-Lifetime gecached. Promise statt boolean,
  // damit parallele Requests den Init nicht doppelt anstoßen.
  var __schemaReady: Promise<void> | undefined;
}

const sql =
  globalThis.__pg ??
  postgres(connectionString, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") globalThis.__pg = sql;
// Auch in Production cachen, damit Schema-Init pro Warm-Container nur 1× läuft.
if (!globalThis.__pg) globalThis.__pg = sql;

/**
 * Schema in 3 parallelen Wellen aufsetzen statt 16 sequentiell:
 *   Welle 1: alle CREATE TABLEs ohne FK-Abhängigkeit untereinander
 *   Welle 2: lead_events (refs setters), alle ALTER TABLE leads ADD COLUMN, Default-List
 *   Welle 3: ALTER TABLE leads ADD last_setter_id (refs setters), Indizes, Backfill
 *
 * Spart 10–15 DB-Roundtrips pro Cold Start.
 */
async function runSchema(): Promise<void> {
  // Welle 1
  await Promise.all([
    sql`
      CREATE TABLE IF NOT EXISTS lists (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    sql`
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
    `,
    sql`
      CREATE TABLE IF NOT EXISTS api_keys (
        provider TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS setters (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        pin TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#e11d48',
        is_admin BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
  ]);

  // Welle 2 – braucht lists + leads + setters aus Welle 1
  await Promise.all([
    sql`INSERT INTO lists (name) VALUES ('Inbox') ON CONFLICT DO NOTHING`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS list_id INTEGER REFERENCES lists(id) ON DELETE CASCADE`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'new'`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact TIMESTAMPTZ`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_count INTEGER DEFAULT 0`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_setter_id INTEGER REFERENCES setters(id) ON DELETE SET NULL`,
    sql`
      CREATE TABLE IF NOT EXISTS lead_events (
        id SERIAL PRIMARY KEY,
        lead_uid TEXT NOT NULL,
        setter_id INTEGER REFERENCES setters(id) ON DELETE SET NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  ]);

  // Welle 3 – Indizes + Backfill
  await Promise.all([
    sql`CREATE INDEX IF NOT EXISTS idx_lead_events_ts ON lead_events (ts DESC)`,
    sql`CREATE INDEX IF NOT EXISTS idx_lead_events_setter ON lead_events (setter_id, ts DESC)`,
    sql`
      UPDATE leads
      SET list_id = (SELECT id FROM lists WHERE name = 'Inbox')
      WHERE list_id IS NULL
    `,
  ]);
}

function ensureSchema(): Promise<void> {
  if (!globalThis.__schemaReady) {
    globalThis.__schemaReady = runSchema().catch((err) => {
      // Wenn Init fehlschlägt, Cache invalidieren damit der nächste Request es nochmal probiert
      globalThis.__schemaReady = undefined;
      throw err;
    });
  }
  return globalThis.__schemaReady;
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
// ADMIN-PASSWORT (DB-gespeichert, optional)
// =============================================================================
// Wird im api_keys-Table unter reserviertem Schlüssel abgelegt; /api/settings
// listet nur konfigurierte PROVIDERS, sodass dieser Eintrag dort nicht auftaucht.
// Bleibt das Feld leer/null, gilt weiterhin process.env.APP_PASSWORD als Login.

const ADMIN_PW_KEY = "__admin_password";

export async function dbGetAdminPassword(): Promise<string | null> {
  return dbGetApiKey(ADMIN_PW_KEY);
}

export async function dbSetAdminPassword(value: string): Promise<void> {
  const v = value.trim();
  if (v.length < 4) throw new Error("Passwort muss mindestens 4 Zeichen haben");
  await dbSetApiKey(ADMIN_PW_KEY, v);
}

export async function dbClearAdminPassword(): Promise<void> {
  await dbDeleteApiKey(ADMIN_PW_KEY);
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
      total: number;
      called: number;
      touched: number;
      by_status: Record<string, number>;
    }[]
  >`
    WITH per_status AS (
      SELECT list_id, lead_status, COUNT(*)::int AS cnt
      FROM leads
      GROUP BY list_id, lead_status
    ),
    per_list AS (
      SELECT
        list_id,
        COUNT(*)::int                                        AS total,
        COUNT(*) FILTER (WHERE call_count > 0)::int          AS called,
        COUNT(*) FILTER (WHERE lead_status <> 'new')::int    AS touched
      FROM leads
      GROUP BY list_id
    )
    SELECT
      l.id,
      l.name,
      l.created_at,
      COALESCE(pl.total, 0)   AS total,
      COALESCE(pl.called, 0)  AS called,
      COALESCE(pl.touched, 0) AS touched,
      COALESCE(
        (SELECT jsonb_object_agg(lead_status, cnt) FROM per_status WHERE list_id = l.id),
        '{}'::jsonb
      ) AS by_status
    FROM lists l
    LEFT JOIN per_list pl ON pl.list_id = l.id
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
      called: Number(r.called),
      touched: Number(r.touched),
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
  last_setter_id: number | null;
  last_setter_name: string | null;
  last_setter_color: string | null;
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
    lastSetterId: r.last_setter_id ?? null,
    lastSetterName: r.last_setter_name ?? null,
    lastSetterColor: r.last_setter_color ?? null,
  };
}

const LEAD_SELECT = sql`
  l.*,
  s.name  AS last_setter_name,
  s.color AS last_setter_color
`;

export async function dbLeadsByList(listId: number): Promise<DbLead[]> {
  await ensureSchema();
  const rows = await sql<DbLeadRow[]>`
    SELECT ${LEAD_SELECT}
    FROM leads l
    LEFT JOIN setters s ON s.id = l.last_setter_id
    WHERE l.list_id = ${listId}
    ORDER BY l.last_contact DESC NULLS LAST, l.last_seen DESC
  `;
  return rows.map(rowToDbLead);
}

export async function dbLoadAll(): Promise<DbLead[]> {
  await ensureSchema();
  const rows = await sql<DbLeadRow[]>`
    SELECT ${LEAD_SELECT}
    FROM leads l
    LEFT JOIN setters s ON s.id = l.last_setter_id
    ORDER BY l.last_seen DESC
  `;
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

export async function dbUpdateLead(
  uid: string,
  patch: LeadPatch,
  setterId: number | null = null,
): Promise<DbLead | null> {
  await ensureSchema();

  const prior = await dbGetLead(uid);
  if (!prior) return null;

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

  // Setter merken, sobald er irgendwas am Lead bewegt
  if (setterId !== null && (patch.leadStatus !== undefined || patch.bumpCallCount || patch.setLastContact)) {
    fragments.push(sql`last_setter_id = ${setterId}`);
  }

  if (fragments.length > 0) {
    const setClause = fragments.reduce((acc, frag, i) =>
      i === 0 ? frag : sql`${acc}, ${frag}`,
    );
    await sql`UPDATE leads SET ${setClause} WHERE uid = ${uid}`;
  }

  // Status-Wechsel ins Event-Log – nur wenn sich der Status wirklich geändert hat,
  // damit der Leaderboard-Count nicht aufgebläht wird, wenn jemand nur Notizen speichert.
  if (patch.leadStatus !== undefined && patch.leadStatus !== prior.leadStatus) {
    await sql`
      INSERT INTO lead_events (lead_uid, setter_id, from_status, to_status)
      VALUES (${uid}, ${setterId}, ${prior.leadStatus}, ${patch.leadStatus})
    `;
  }

  return await dbGetLead(uid);
}

export async function dbGetLead(uid: string): Promise<DbLead | null> {
  await ensureSchema();
  const rows = await sql<DbLeadRow[]>`
    SELECT ${LEAD_SELECT}
    FROM leads l
    LEFT JOIN setters s ON s.id = l.last_setter_id
    WHERE l.uid = ${uid}
  `;
  return rows.length > 0 ? rowToDbLead(rows[0]) : null;
}

// =============================================================================
// SETTERS – Team-Verwaltung
// =============================================================================

export async function dbListSetters(): Promise<Setter[]> {
  await ensureSchema();
  const rows = await sql<
    { id: number; name: string; color: string; is_admin: boolean; created_at: string }[]
  >`
    SELECT id, name, color, is_admin, created_at
    FROM setters
    ORDER BY is_admin DESC, name ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    isAdmin: r.is_admin,
    createdAt: r.created_at,
  }));
}

export async function dbCreateSetter(input: {
  name: string;
  pin: string;
  color?: string;
  isAdmin?: boolean;
}): Promise<Setter> {
  await ensureSchema();
  const name = input.name.trim();
  const pin = input.pin.trim();
  if (!name) throw new Error("Name darf nicht leer sein");
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN muss 4–8 Ziffern haben");

  const rows = await sql<
    { id: number; name: string; color: string; is_admin: boolean; created_at: string }[]
  >`
    INSERT INTO setters (name, pin, color, is_admin)
    VALUES (${name}, ${pin}, ${input.color ?? "#e11d48"}, ${input.isAdmin ?? false})
    RETURNING id, name, color, is_admin, created_at
  `;
  const r = rows[0];
  return { id: r.id, name: r.name, color: r.color, isAdmin: r.is_admin, createdAt: r.created_at };
}

export async function dbUpdateSetter(
  id: number,
  patch: { name?: string; pin?: string; color?: string; isAdmin?: boolean },
): Promise<void> {
  await ensureSchema();
  const fragments: ReturnType<typeof sql>[] = [];
  if (patch.name !== undefined) fragments.push(sql`name = ${patch.name.trim()}`);
  if (patch.pin !== undefined) {
    if (!/^\d{4,8}$/.test(patch.pin)) throw new Error("PIN muss 4–8 Ziffern haben");
    fragments.push(sql`pin = ${patch.pin}`);
  }
  if (patch.color !== undefined) fragments.push(sql`color = ${patch.color}`);
  if (patch.isAdmin !== undefined) fragments.push(sql`is_admin = ${patch.isAdmin}`);
  if (fragments.length === 0) return;
  const setClause = fragments.reduce((acc, frag, i) => (i === 0 ? frag : sql`${acc}, ${frag}`));
  await sql`UPDATE setters SET ${setClause} WHERE id = ${id}`;
}

export async function dbDeleteSetter(id: number): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM setters WHERE id = ${id}`;
}

export async function dbVerifySetterPin(
  setterId: number,
  pin: string,
): Promise<Setter | null> {
  await ensureSchema();
  const rows = await sql<
    { id: number; name: string; color: string; is_admin: boolean; pin: string; created_at: string }[]
  >`
    SELECT id, name, color, is_admin, pin, created_at FROM setters WHERE id = ${setterId}
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.pin !== pin) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isAdmin: row.is_admin,
    createdAt: row.created_at,
  };
}

export async function dbGetSetter(id: number): Promise<Setter | null> {
  await ensureSchema();
  const rows = await sql<
    { id: number; name: string; color: string; is_admin: boolean; created_at: string }[]
  >`
    SELECT id, name, color, is_admin, created_at FROM setters WHERE id = ${id}
  `;
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, name: r.name, color: r.color, isAdmin: r.is_admin, createdAt: r.created_at };
}

export async function dbCountSetters(): Promise<number> {
  await ensureSchema();
  const rows = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM setters`;
  return Number(rows[0]?.count ?? 0);
}

// =============================================================================
// LEADERBOARD
// =============================================================================

/**
 * Zählt für jeden Setter die Status-Wechsel im Zeitfenster.
 * "Gesettet" = Lead auf `interested` oder `call_scheduled` bewegt.
 * `totalCalls` = Anzahl no_answer-Events (also Anrufversuche im Zeitraum).
 */
export async function dbLeaderboard(sinceIso: string | null): Promise<LeaderboardRow[]> {
  await ensureSchema();

  const rows = await sql<
    {
      setter_id: number;
      name: string;
      color: string;
      interested: number;
      call_scheduled: number;
      won: number;
      total_calls: number;
    }[]
  >`
    SELECT
      s.id AS setter_id,
      s.name,
      s.color,
      COUNT(*) FILTER (WHERE e.to_status = 'interested')::int     AS interested,
      COUNT(*) FILTER (WHERE e.to_status = 'call_scheduled')::int AS call_scheduled,
      COUNT(*) FILTER (WHERE e.to_status = 'won')::int            AS won,
      COUNT(*) FILTER (WHERE e.to_status = 'no_answer')::int      AS total_calls
    FROM setters s
    LEFT JOIN lead_events e
      ON e.setter_id = s.id
      ${sinceIso ? sql`AND e.ts >= ${sinceIso}` : sql``}
    GROUP BY s.id, s.name, s.color
    ORDER BY (
      COUNT(*) FILTER (WHERE e.to_status = 'interested')
      + COUNT(*) FILTER (WHERE e.to_status = 'call_scheduled') * 2
      + COUNT(*) FILTER (WHERE e.to_status = 'won') * 5
    ) DESC,
    s.name ASC
  `;

  return rows.map((r) => ({
    setterId: r.setter_id,
    name: r.name,
    color: r.color,
    interested: Number(r.interested),
    callScheduled: Number(r.call_scheduled),
    won: Number(r.won),
    totalSet: Number(r.interested) + Number(r.call_scheduled),
    totalCalls: Number(r.total_calls),
  }));
}
