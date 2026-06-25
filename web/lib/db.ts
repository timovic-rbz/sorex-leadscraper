import postgres from "postgres";
import type {
  CommissionSummary,
  CompetitorCheck,
  DbLead,
  KeywordVolume,
  LeaderboardRow,
  Lead,
  LeadEnrichment,
  LeadStatus,
  List,
  ListWithStats,
  MarketCheck,
  QualifiedInfo,
  RankedKeyword,
  ReviewItem,
  Setter,
  WebsiteCheck,
} from "./types";
import { LEAD_STATUS_ORDER } from "./types";
import { notifySalesHub } from "./saleshub";

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
      CREATE TABLE IF NOT EXISTS api_usage (
        id SERIAL PRIMARY KEY,
        provider TEXT NOT NULL,
        operation TEXT NOT NULL,
        units NUMERIC NOT NULL DEFAULT 0,
        cost_eur NUMERIC NOT NULL DEFAULT 0,
        ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS geo_cache (
        query TEXT PRIMARY KEY,
        lat NUMERIC NOT NULL,
        lng NUMERIC NOT NULL,
        polygon TEXT,
        ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    sql`ALTER TABLE geo_cache ADD COLUMN IF NOT EXISTS polygon TEXT`,
    sql`INSERT INTO lists (name) VALUES ('Inbox') ON CONFLICT DO NOTHING`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS list_id INTEGER REFERENCES lists(id) ON DELETE CASCADE`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'new'`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact TIMESTAMPTZ`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_count INTEGER DEFAULT 0`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_setter_id INTEGER REFERENCES setters(id) ON DELETE SET NULL`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualified_info JSONB`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS enrichment JSONB`,
    sql`ALTER TABLE setters ADD COLUMN IF NOT EXISTS commission_eur NUMERIC NOT NULL DEFAULT 0`,
    // Zweistufiges Provisionsmodell (USD): Setting-Fee/Monat + Closing-Fee einmalig.
    sql`ALTER TABLE setters ADD COLUMN IF NOT EXISTS setting_fee NUMERIC NOT NULL DEFAULT 20`,
    sql`ALTER TABLE setters ADD COLUMN IF NOT EXISTS closing_fee NUMERIC NOT NULL DEFAULT 80`,
    // Wer hat gesettet (Termin) / geclosed (won) + Kunden-Kündigung für recurring.
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS set_by_setter_id INTEGER REFERENCES setters(id) ON DELETE SET NULL`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS closed_by_setter_id INTEGER REFERENCES setters(id) ON DELETE SET NULL`,
    sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_churned_at TIMESTAMPTZ`,
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
    sql`CREATE INDEX IF NOT EXISTS idx_api_usage_ts ON api_usage (ts DESC)`,
    sql`CREATE INDEX IF NOT EXISTS idx_api_usage_provider_ts ON api_usage (provider, ts DESC)`,
    sql`
      UPDATE leads
      SET list_id = (SELECT id FROM lists WHERE name = 'Inbox')
      WHERE list_id IS NULL
    `,
  ]);

  // Welle 4 – Provisions-Backfill: bestehende "Kunde"-Leads bekommen Setter/Closer
  // aus last_setter_id, damit sie sofort in der Provisionsberechnung zählen.
  // Idempotent (nur NULL-Felder werden gefüllt) → läuft bei jedem Boot harmlos.
  await sql`
    UPDATE leads
    SET set_by_setter_id    = COALESCE(set_by_setter_id, last_setter_id),
        closed_by_setter_id = COALESCE(closed_by_setter_id, last_setter_id)
    WHERE lead_status = 'won'
      AND last_setter_id IS NOT NULL
      AND (set_by_setter_id IS NULL OR closed_by_setter_id IS NULL)
  `;
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
  qualified_info: QualifiedInfo | null;
  customer_churned_at: string | null;
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
    qualifiedInfo: r.qualified_info ?? null,
    customerChurnedAt: r.customer_churned_at ?? null,
  };
}

const LEAD_SELECT = sql`
  l.*,
  l.qualified_info,
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

/**
 * Liefert alle "gesetteten" Leads: Status >= interested.
 * Sortiert nach letzter Aktivität (last_contact desc) damit die hottest Sachen
 * oben stehen.
 */
export async function dbQualifiedLeads(): Promise<DbLead[]> {
  await ensureSchema();
  const rows = await sql<DbLeadRow[]>`
    SELECT ${LEAD_SELECT}
    FROM leads l
    LEFT JOIN setters s ON s.id = l.last_setter_id
    WHERE l.lead_status IN ('follow_up', 'interested', 'call_scheduled', 'won')
    ORDER BY
      CASE l.lead_status
        WHEN 'follow_up' THEN 1
        WHEN 'interested' THEN 2
        WHEN 'call_scheduled' THEN 3
        WHEN 'won' THEN 4
        ELSE 5
      END,
      l.next_action_at ASC NULLS LAST,
      l.last_contact DESC NULLS LAST,
      l.last_seen DESC
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
  qualifiedInfo?: QualifiedInfo;
  /** Kunden-Kündigung umschalten (stoppt/startet die wiederkehrende Setting-Fee). */
  customerChurned?: boolean;
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
  if (patch.qualifiedInfo !== undefined) {
    // JSONB merge: alte Felder beibehalten, neue überschreiben.
    // sql.json() bindet als nativen JSONB-Wert.
    // CASE-Fallback: wenn der existierende Wert KEIN Object ist (z.B. Array
    // aus Legacy-Bug oder NULL), fangen wir bei {} neu an — sonst würde
    // Postgres' || zwei Arrays konkatenieren statt sauber zu mergen.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonValue = sql.json(patch.qualifiedInfo as any);
    fragments.push(
      sql`qualified_info = (
        CASE WHEN jsonb_typeof(qualified_info) = 'object'
          THEN qualified_info
          ELSE '{}'::jsonb
        END
      ) || ${jsonValue}`,
    );
  }

  // Setter merken, sobald er irgendwas am Lead bewegt
  if (setterId !== null && (patch.leadStatus !== undefined || patch.bumpCallCount || patch.setLastContact)) {
    fragments.push(sql`last_setter_id = ${setterId}`);
  }

  // Provision-Tracking: wer hat gesettet (Termin gebucht) / geclosed (won).
  // set_by = erster Setter, der den Sales-Call vereinbart hat (COALESCE = nicht überschreiben).
  if (setterId !== null && patch.leadStatus === "call_scheduled") {
    fragments.push(sql`set_by_setter_id = COALESCE(set_by_setter_id, ${setterId})`);
  }
  // closed_by = Setter, der auf "Kunde" setzt; set_by als Fallback ebenfalls füllen
  // (falls direkt geclosed wurde, ohne vorher Call zu vereinbaren).
  if (setterId !== null && patch.leadStatus === "won") {
    fragments.push(sql`closed_by_setter_id = ${setterId}`);
    fragments.push(sql`set_by_setter_id = COALESCE(set_by_setter_id, ${setterId})`);
  }

  // Kunden-Kündigung umschalten (für die wiederkehrende Setting-Fee).
  if (patch.customerChurned !== undefined) {
    fragments.push(
      patch.customerChurned ? sql`customer_churned_at = NOW()` : sql`customer_churned_at = NULL`,
    );
  }

  if (fragments.length > 0) {
    const setClause = fragments.reduce((acc, frag, i) =>
      i === 0 ? frag : sql`${acc}, ${frag}`,
    );
    await sql`UPDATE leads SET ${setClause} WHERE uid = ${uid}`;
  }

  // Status-Wechsel ins Event-Log – nur wenn sich der Status wirklich geändert hat,
  // damit der Leaderboard-Count nicht aufgebläht wird, wenn jemand nur Notizen speichert.
  const statusChanged =
    patch.leadStatus !== undefined && patch.leadStatus !== prior.leadStatus;
  if (statusChanged) {
    await sql`
      INSERT INTO lead_events (lead_uid, setter_id, from_status, to_status)
      VALUES (${uid}, ${setterId}, ${prior.leadStatus}, ${patch.leadStatus!})
    `;
  }

  const updated = await dbGetLead(uid);

  // Sales-Hub-Webhook: bei Übergang in eine qualifizierte Stufe (interested /
  // call_scheduled) den Lead pushen. notifySalesHub entscheidet selbst, ob der
  // Ziel-Status relevant ist, und wirft nie – der Status ist oben schon committed.
  if (statusChanged && updated) {
    await notifySalesHub(updated, prior.leadStatus, updated.leadStatus);
  }

  return updated;
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

/** Setzt die E-Mail eines Leads (z.B. nach Per-Lead-Website-Crawl). */
export async function dbSetLeadEmail(uid: string, email: string): Promise<void> {
  await ensureSchema();
  await sql`UPDATE leads SET email = ${email} WHERE uid = ${uid}`;
}

// =============================================================================
// ENRICHMENT-CACHE – DataForSEO-Profil & Website-Check pro Lead (1× bezahlen)
// =============================================================================

/** Liest die gecachte Anreicherung eines Leads (ohne externen API-Call). */
export async function dbGetLeadEnrichment(uid: string): Promise<LeadEnrichment | null> {
  await ensureSchema();
  const rows = await sql<{ enrichment: LeadEnrichment | null }[]>`
    SELECT enrichment FROM leads WHERE uid = ${uid}
  `;
  return rows[0]?.enrichment ?? null;
}

/** JSONB-Merge in die enrichment-Spalte – bestehende Keys bleiben erhalten. */
async function mergeEnrichment(uid: string, patch: Partial<LeadEnrichment>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonValue = sql.json(patch as any);
  await sql`
    UPDATE leads SET enrichment = (
      CASE WHEN jsonb_typeof(enrichment) = 'object' THEN enrichment ELSE '{}'::jsonb END
    ) || ${jsonValue}
    WHERE uid = ${uid}
  `;
}

export async function dbSaveLeadWebsite(uid: string, website: WebsiteCheck): Promise<void> {
  await ensureSchema();
  await mergeEnrichment(uid, { website, websiteAt: new Date().toISOString() });
}

export async function dbSaveLeadMarket(uid: string, market: MarketCheck): Promise<void> {
  await ensureSchema();
  await mergeEnrichment(uid, { market, marketAt: new Date().toISOString() });
}

export async function dbSaveLeadReviews(uid: string, reviews: ReviewItem[]): Promise<void> {
  await ensureSchema();
  await mergeEnrichment(uid, { reviews, reviewsAt: new Date().toISOString() });
}

export async function dbSaveLeadCompetitors(uid: string, competitors: CompetitorCheck): Promise<void> {
  await ensureSchema();
  await mergeEnrichment(uid, { competitors, competitorsAt: new Date().toISOString() });
}

export async function dbSaveLeadRankedKeywords(uid: string, rankedKeywords: RankedKeyword[]): Promise<void> {
  await ensureSchema();
  await mergeEnrichment(uid, { rankedKeywords, rankedKeywordsAt: new Date().toISOString() });
}

export async function dbSaveLeadKeywordVolumes(uid: string, keywordVolumes: KeywordVolume[]): Promise<void> {
  await ensureSchema();
  await mergeEnrichment(uid, { keywordVolumes, keywordVolumesAt: new Date().toISOString() });
}

// =============================================================================
// SETTERS – Team-Verwaltung
// =============================================================================

interface SetterRow {
  id: number;
  name: string;
  color: string;
  is_admin: boolean;
  setting_fee: number;
  closing_fee: number;
  created_at: string;
}

const SETTER_COLS = sql`id, name, color, is_admin, setting_fee::float8 AS setting_fee, closing_fee::float8 AS closing_fee, created_at`;

function mapSetter(r: SetterRow): Setter {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    isAdmin: r.is_admin,
    settingFee: Number(r.setting_fee) || 0,
    closingFee: Number(r.closing_fee) || 0,
    createdAt: r.created_at,
  };
}

export async function dbListSetters(): Promise<Setter[]> {
  await ensureSchema();
  const rows = await sql<SetterRow[]>`
    SELECT ${SETTER_COLS} FROM setters ORDER BY is_admin DESC, name ASC
  `;
  return rows.map(mapSetter);
}

export async function dbCreateSetter(input: {
  name: string;
  pin: string;
  color?: string;
  isAdmin?: boolean;
  settingFee?: number;
  closingFee?: number;
}): Promise<Setter> {
  await ensureSchema();
  const name = input.name.trim();
  const pin = input.pin.trim();
  if (!name) throw new Error("Name darf nicht leer sein");
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN muss 4–8 Ziffern haben");
  const settingFee = Math.max(0, Number(input.settingFee ?? 20)) || 0;
  const closingFee = Math.max(0, Number(input.closingFee ?? 80)) || 0;

  const rows = await sql<SetterRow[]>`
    INSERT INTO setters (name, pin, color, is_admin, setting_fee, closing_fee)
    VALUES (${name}, ${pin}, ${input.color ?? "#e11d48"}, ${input.isAdmin ?? false}, ${settingFee}, ${closingFee})
    RETURNING ${SETTER_COLS}
  `;
  return mapSetter(rows[0]);
}

export async function dbUpdateSetter(
  id: number,
  patch: {
    name?: string;
    pin?: string;
    color?: string;
    isAdmin?: boolean;
    settingFee?: number;
    closingFee?: number;
  },
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
  if (patch.settingFee !== undefined) {
    fragments.push(sql`setting_fee = ${Math.max(0, Number(patch.settingFee)) || 0}`);
  }
  if (patch.closingFee !== undefined) {
    fragments.push(sql`closing_fee = ${Math.max(0, Number(patch.closingFee)) || 0}`);
  }
  if (fragments.length === 0) return;
  const setClause = fragments.reduce((acc, frag, i) => (i === 0 ? frag : sql`${acc}, ${frag}`));
  await sql`UPDATE setters SET ${setClause} WHERE id = ${id}`;
}

export async function dbDeleteSetter(id: number): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM setters WHERE id = ${id}`;
}

export async function dbVerifySetterPin(setterId: number, pin: string): Promise<Setter | null> {
  await ensureSchema();
  const rows = await sql<(SetterRow & { pin: string })[]>`
    SELECT ${SETTER_COLS}, pin FROM setters WHERE id = ${setterId}
  `;
  const row = rows[0];
  if (!row || row.pin !== pin) return null;
  return mapSetter(row);
}

export async function dbGetSetter(id: number): Promise<Setter | null> {
  await ensureSchema();
  const rows = await sql<SetterRow[]>`SELECT ${SETTER_COLS} FROM setters WHERE id = ${id}`;
  return rows[0] ? mapSetter(rows[0]) : null;
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

// =============================================================================
// PROVISIONEN – zweistufig: Setting-Fee (wiederkehrend) + Closing-Fee (einmalig)
// =============================================================================

/**
 * Provisions-Übersicht aller Setter (USD). Zwei Komponenten:
 *  - Setting-Fee: settingFee × aktive Kunden, die der Setter gesettet hat
 *    (lead_status='won' UND customer_churned_at IS NULL, set_by_setter_id = Setter)
 *    → wiederkehrend, gilt jeden Monat erneut, solange der Kunde aktiv ist.
 *  - Closing-Fee: closingFee × Closings (won-Events mit setter_id = Setter)
 *    → einmalig; closedMonth = laufender Monat, closedTotal = all-time.
 *
 * COUNT(DISTINCT lead_uid) bei den won-Events, damit mehrfaches "won" nicht
 * doppelt zählt.
 */
export async function dbCommissions(): Promise<CommissionSummary[]> {
  await ensureSchema();
  const rows = await sql<
    {
      setter_id: number;
      name: string;
      color: string;
      setting_fee: number;
      closing_fee: number;
      active_customers: number;
      closed_month: number;
      closed_total: number;
    }[]
  >`
    SELECT
      s.id    AS setter_id,
      s.name,
      s.color,
      s.setting_fee::float8 AS setting_fee,
      s.closing_fee::float8 AS closing_fee,
      COALESCE(ac.active_customers, 0)::int AS active_customers,
      COALESCE(cm.closed_month, 0)::int     AS closed_month,
      COALESCE(ct.closed_total, 0)::int     AS closed_total
    FROM setters s
    LEFT JOIN (
      SELECT set_by_setter_id AS sid, COUNT(*) AS active_customers
      FROM leads
      WHERE lead_status = 'won' AND customer_churned_at IS NULL AND set_by_setter_id IS NOT NULL
      GROUP BY set_by_setter_id
    ) ac ON ac.sid = s.id
    LEFT JOIN (
      SELECT setter_id AS sid, COUNT(DISTINCT lead_uid) AS closed_month
      FROM lead_events
      WHERE to_status = 'won' AND ts >= date_trunc('month', now()) AND setter_id IS NOT NULL
      GROUP BY setter_id
    ) cm ON cm.sid = s.id
    LEFT JOIN (
      SELECT setter_id AS sid, COUNT(DISTINCT lead_uid) AS closed_total
      FROM lead_events
      WHERE to_status = 'won' AND setter_id IS NOT NULL
      GROUP BY setter_id
    ) ct ON ct.sid = s.id
    GROUP BY s.id, s.name, s.color, s.setting_fee, s.closing_fee,
             ac.active_customers, cm.closed_month, ct.closed_total
    ORDER BY s.name ASC
  `;

  return rows.map((r) => {
    const settingFee = Number(r.setting_fee) || 0;
    const closingFee = Number(r.closing_fee) || 0;
    const activeCustomers = Number(r.active_customers);
    const closedMonth = Number(r.closed_month);
    const closedTotal = Number(r.closed_total);
    const recurringMonth = settingFee * activeCustomers;
    const closingMonth = closingFee * closedMonth;
    return {
      setterId: r.setter_id,
      name: r.name,
      color: r.color,
      settingFee,
      closingFee,
      activeCustomers,
      recurringMonth,
      closedMonth,
      closedTotal,
      closingMonth,
      monthTotal: recurringMonth + closingMonth,
    };
  });
}

// =============================================================================
// API-USAGE – Verbrauchs-Tracking pro Provider
// =============================================================================

/**
 * Schreibt eine Usage-Zeile. Fehler werden nur geloggt, nie geworfen — Tracking
 * darf eine echte Suche nicht zum Crashen bringen.
 */
export async function dbRecordUsage(
  provider: string,
  operation: string,
  units: number,
  costEur: number,
): Promise<void> {
  try {
    await ensureSchema();
    await sql`
      INSERT INTO api_usage (provider, operation, units, cost_eur)
      VALUES (${provider}, ${operation}, ${units}, ${costEur})
    `;
  } catch (e) {
    console.error("[usage] insert failed", e);
  }
}

export interface UsageWindow {
  units: number;
  costEur: number;
  calls: number;
}

export interface ProviderUsage {
  provider: string;
  today: UsageWindow;
  week: UsageWindow;
  month: UsageWindow;
  total: UsageWindow;
  operations: Array<{ operation: string; calls: number; units: number; costEur: number }>;
}

/** Aggregiert nach Provider × Zeitfenster (heute / 7d / 30d / all-time). */
export async function dbUsageStats(): Promise<ProviderUsage[]> {
  await ensureSchema();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();
  const weekIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const rows = await sql<
    {
      provider: string;
      today_units: string;
      today_cost: string;
      today_calls: string;
      week_units: string;
      week_cost: string;
      week_calls: string;
      month_units: string;
      month_cost: string;
      month_calls: string;
      total_units: string;
      total_cost: string;
      total_calls: string;
    }[]
  >`
    SELECT
      provider,
      COALESCE(SUM(units)    FILTER (WHERE ts >= ${todayIso}), 0)::text AS today_units,
      COALESCE(SUM(cost_eur) FILTER (WHERE ts >= ${todayIso}), 0)::text AS today_cost,
      COALESCE(COUNT(*)      FILTER (WHERE ts >= ${todayIso}), 0)::text AS today_calls,
      COALESCE(SUM(units)    FILTER (WHERE ts >= ${weekIso}),  0)::text AS week_units,
      COALESCE(SUM(cost_eur) FILTER (WHERE ts >= ${weekIso}),  0)::text AS week_cost,
      COALESCE(COUNT(*)      FILTER (WHERE ts >= ${weekIso}),  0)::text AS week_calls,
      COALESCE(SUM(units)    FILTER (WHERE ts >= ${monthIso}), 0)::text AS month_units,
      COALESCE(SUM(cost_eur) FILTER (WHERE ts >= ${monthIso}), 0)::text AS month_cost,
      COALESCE(COUNT(*)      FILTER (WHERE ts >= ${monthIso}), 0)::text AS month_calls,
      COALESCE(SUM(units),    0)::text AS total_units,
      COALESCE(SUM(cost_eur), 0)::text AS total_cost,
      COALESCE(COUNT(*),      0)::text AS total_calls
    FROM api_usage
    GROUP BY provider
    ORDER BY provider
  `;

  // Pro Provider auch die Operation-Aufschlüsselung holen (kompakt, all-time).
  const opRows = await sql<
    { provider: string; operation: string; calls: string; units: string; cost: string }[]
  >`
    SELECT
      provider,
      operation,
      COUNT(*)::text     AS calls,
      SUM(units)::text   AS units,
      SUM(cost_eur)::text AS cost
    FROM api_usage
    GROUP BY provider, operation
    ORDER BY provider, SUM(cost_eur) DESC
  `;

  return rows.map((r) => ({
    provider: r.provider,
    today: { units: Number(r.today_units), costEur: Number(r.today_cost), calls: Number(r.today_calls) },
    week:  { units: Number(r.week_units),  costEur: Number(r.week_cost),  calls: Number(r.week_calls) },
    month: { units: Number(r.month_units), costEur: Number(r.month_cost), calls: Number(r.month_calls) },
    total: { units: Number(r.total_units), costEur: Number(r.total_cost), calls: Number(r.total_calls) },
    operations: opRows
      .filter((o) => o.provider === r.provider)
      .map((o) => ({
        operation: o.operation,
        calls: Number(o.calls),
        units: Number(o.units),
        costEur: Number(o.cost),
      })),
  }));
}

// =============================================================================
// COVERAGE – welche Städte / Dienstleistungen wurden schon gescrapt
// =============================================================================

export interface CoverageRow {
  ort: string;
  dienstleistung: string;
  total: number;
  called: number;
  touched: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export async function dbCoverage(): Promise<CoverageRow[]> {
  await ensureSchema();
  const rows = await sql<
    {
      ort: string;
      dienstleistung: string;
      total: string;
      called: string;
      touched: string;
      first_seen: string | null;
      last_seen: string | null;
    }[]
  >`
    SELECT
      COALESCE(NULLIF(TRIM(ort), ''), '?') AS ort,
      COALESCE(NULLIF(TRIM(dienstleistung), ''), '?') AS dienstleistung,
      COUNT(*)::text                                       AS total,
      COUNT(*) FILTER (WHERE call_count > 0)::text         AS called,
      COUNT(*) FILTER (WHERE lead_status <> 'new')::text   AS touched,
      MIN(first_seen)::text AS first_seen,
      MAX(last_seen)::text  AS last_seen
    FROM leads
    GROUP BY 1, 2
    ORDER BY COUNT(*) DESC, 1, 2
  `;
  return rows.map((r) => ({
    ort: r.ort,
    dienstleistung: r.dienstleistung,
    total: Number(r.total),
    called: Number(r.called),
    touched: Number(r.touched),
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
  }));
}

// =============================================================================
// GEO-CACHE – Lat/Lng für Städte, einmal über Nominatim geholt
// =============================================================================

// =============================================================================
// GLOBAL LOOKUP – nach Telefonnummer oder Firmenname suchen
// =============================================================================

export interface LeadLookupRow {
  uid: string;
  firmenname: string;
  telefon: string;
  adresse: string;
  ort: string;
  dienstleistung: string;
  leadStatus: string;
  callCount: number;
  lastContact: string | null;
  listId: number | null;
  listName: string | null;
  lastSetterName: string | null;
  lastSetterColor: string | null;
}

/**
 * Sucht Leads per Telefonnummer (Format egal) ODER per Firmennamen.
 *
 * Telefon-Match: alle Nicht-Ziffern werden aus DB-Spalte und Query gestrippt,
 * dann LIKE %<digits>%. So matcht +49 212 1234567, 0212 1234567 und
 * "021212345" alle dieselbe Nummer.
 *
 * Plus 0/49-Mapping: wenn die Query mit 0 anfängt, probieren wir auch
 * "49" + Rest, damit eine eingegebene 02121234567 auch +49212 1234567
 * findet.
 */
export async function dbLookupLeads(query: string): Promise<LeadLookupRow[]> {
  await ensureSchema();
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const digits = trimmed.replace(/\D/g, "");
  // 0-Prefix (D) → 49-Prefix (international) als zweite Variante mitprobieren
  const altDigits =
    digits.length >= 4 && digits.startsWith("0") ? "49" + digits.slice(1) : null;
  const phoneCandidates = altDigits ? [digits, altDigits] : digits ? [digits] : [];

  const rows = await sql<
    {
      uid: string;
      firmenname: string;
      telefon: string;
      adresse: string;
      ort: string;
      dienstleistung: string;
      lead_status: string;
      call_count: number;
      last_contact: string | null;
      list_id: number | null;
      list_name: string | null;
      last_setter_name: string | null;
      last_setter_color: string | null;
    }[]
  >`
    SELECT
      l.uid,
      l.firmenname,
      l.telefon,
      l.adresse,
      l.ort,
      l.dienstleistung,
      l.lead_status,
      l.call_count,
      l.last_contact::text,
      l.list_id,
      ls.name AS list_name,
      s.name  AS last_setter_name,
      s.color AS last_setter_color
    FROM leads l
    LEFT JOIN lists ls   ON ls.id = l.list_id
    LEFT JOIN setters s  ON s.id  = l.last_setter_id
    WHERE
      ${
        phoneCandidates.length > 0
          ? sql`regexp_replace(l.telefon, '[^0-9]', '', 'g') ILIKE ANY(${phoneCandidates.map((d) => `%${d}%`)})`
          : sql`FALSE`
      }
      OR l.firmenname ILIKE ${"%" + trimmed + "%"}
    ORDER BY l.last_seen DESC
    LIMIT 25
  `;

  return rows.map((r) => ({
    uid: r.uid,
    firmenname: r.firmenname,
    telefon: r.telefon,
    adresse: r.adresse,
    ort: r.ort,
    dienstleistung: r.dienstleistung,
    leadStatus: r.lead_status,
    callCount: r.call_count,
    lastContact: r.last_contact,
    listId: r.list_id,
    listName: r.list_name,
    lastSetterName: r.last_setter_name,
    lastSetterColor: r.last_setter_color,
  }));
}

export interface CityDetail {
  ort: string;
  byService: Array<{ dienstleistung: string; total: number; called: number; touched: number }>;
  byPlz: Array<{ plz: string; total: number; called: number; touched: number }>;
  byStatus: Array<{ status: string; count: number }>;
}

export async function dbCityDetail(ort: string): Promise<CityDetail> {
  await ensureSchema();
  const [byService, byPlz, byStatus] = await Promise.all([
    sql<
      { dienstleistung: string; total: string; called: string; touched: string }[]
    >`
      SELECT
        COALESCE(NULLIF(TRIM(dienstleistung), ''), '?') AS dienstleistung,
        COUNT(*)::text                                     AS total,
        COUNT(*) FILTER (WHERE call_count > 0)::text       AS called,
        COUNT(*) FILTER (WHERE lead_status <> 'new')::text AS touched
      FROM leads
      WHERE ort = ${ort}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `,
    sql<
      { plz: string; total: string; called: string; touched: string }[]
    >`
      SELECT
        COALESCE(SUBSTRING(adresse FROM '[0-9]{5}'), '?') AS plz,
        COUNT(*)::text                                     AS total,
        COUNT(*) FILTER (WHERE call_count > 0)::text       AS called,
        COUNT(*) FILTER (WHERE lead_status <> 'new')::text AS touched
      FROM leads
      WHERE ort = ${ort}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `,
    sql<{ status: string; count: string }[]>`
      SELECT
        COALESCE(NULLIF(lead_status, ''), 'new') AS status,
        COUNT(*)::text AS count
      FROM leads
      WHERE ort = ${ort}
      GROUP BY 1
    `,
  ]);

  return {
    ort,
    byService: byService.map((r) => ({
      dienstleistung: r.dienstleistung,
      total: Number(r.total),
      called: Number(r.called),
      touched: Number(r.touched),
    })),
    byPlz: byPlz.map((r) => ({
      plz: r.plz,
      total: Number(r.total),
      called: Number(r.called),
      touched: Number(r.touched),
    })),
    byStatus: byStatus.map((r) => ({
      status: r.status,
      count: Number(r.count),
    })),
  };
}

export async function dbGetCachedCoord(
  query: string,
): Promise<{ lat: number; lng: number; polygon: string | null } | null> {
  await ensureSchema();
  const rows = await sql<{ lat: string; lng: string; polygon: string | null }[]>`
    SELECT lat::text, lng::text, polygon FROM geo_cache WHERE query = ${query.toLowerCase()}
  `;
  if (rows.length === 0) return null;
  return {
    lat: Number(rows[0].lat),
    lng: Number(rows[0].lng),
    polygon: rows[0].polygon,
  };
}

export async function dbSetCachedCoord(
  query: string,
  lat: number,
  lng: number,
  polygon: string | null = null,
): Promise<void> {
  await ensureSchema();
  await sql`
    INSERT INTO geo_cache (query, lat, lng, polygon)
    VALUES (${query.toLowerCase()}, ${lat}, ${lng}, ${polygon})
    ON CONFLICT (query) DO UPDATE
      SET lat     = EXCLUDED.lat,
          lng     = EXCLUDED.lng,
          polygon = COALESCE(EXCLUDED.polygon, geo_cache.polygon)
  `;
}
