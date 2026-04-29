import { sql } from "@vercel/postgres";
import type { DbLead, Lead, LeadStatus, List, ListWithStats } from "./types";
import { LEAD_STATUS_ORDER } from "./types";

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

  // Default-Liste 'Inbox' für ungebundene Leads (z.B. aus alten Versionen)
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

  // CRM-Erweiterungen idempotent (alte Deployments bleiben kompatibel)
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS list_id INTEGER REFERENCES lists(id) ON DELETE CASCADE`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'new'`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact TIMESTAMPTZ`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_count INTEGER DEFAULT 0`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ`;

  // Backfill: Leads ohne Liste → Inbox
  await sql`
    UPDATE leads
    SET list_id = (SELECT id FROM lists WHERE name = 'Inbox')
    WHERE list_id IS NULL
  `;

  initialized = true;
}

// =============================================================================
// LISTS
// =============================================================================

export async function dbCreateList(name: string): Promise<List> {
  await ensureSchema();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name darf nicht leer sein");
  const result = await sql.query<{ id: number; name: string; created_at: string }>(
    `INSERT INTO lists (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, created_at`,
    [trimmed],
  );
  const r = result.rows[0];
  return { id: r.id, name: r.name, createdAt: r.created_at };
}

export async function dbDeleteList(id: number): Promise<void> {
  await ensureSchema();
  await sql.query("DELETE FROM lists WHERE id = $1", [id]);
}

export async function dbListsAll(): Promise<ListWithStats[]> {
  await ensureSchema();
  const result = await sql.query<{
    id: number;
    name: string;
    created_at: string;
    total: string;
    by_status: Record<string, number>;
  }>(
    `
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
    `,
  );

  return result.rows.map((r) => {
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
  const result = await sql.query<{ id: number; name: string; created_at: string }>(
    "SELECT id, name, created_at FROM lists WHERE id = $1",
    [id],
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return { id: r.id, name: r.name, createdAt: r.created_at };
}

// =============================================================================
// LEADS – Lookup, Upsert, Update
// =============================================================================

export async function dbExistingUids(uids: string[]): Promise<Set<string>> {
  if (uids.length === 0) return new Set();
  await ensureSchema();
  const result = await sql.query<{ uid: string }>(
    "SELECT uid FROM leads WHERE uid = ANY($1::text[])",
    [uids],
  );
  return new Set(result.rows.map((r) => r.uid));
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

  for (const l of leads) {
    await sql.query(
      `
      INSERT INTO leads (
        uid, list_id, source, firmenname, telefon, adresse, webseite, email,
        bewertung, anzahl_reviews, google_maps, oeffnungszeiten, kategorie,
        status, ort, dienstleistung, last_seen
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, NOW())
      ON CONFLICT(uid) DO UPDATE SET
        list_id   = COALESCE(leads.list_id, EXCLUDED.list_id),
        last_seen = NOW(),
        email     = COALESCE(NULLIF(EXCLUDED.email, ''),    leads.email),
        telefon   = COALESCE(NULLIF(EXCLUDED.telefon, ''),  leads.telefon),
        webseite  = COALESCE(NULLIF(EXCLUDED.webseite, ''), leads.webseite)
      `,
      [
        l.uid, listId, l.source, l.firmenname, l.telefon, l.adresse, l.webseite, l.email,
        l.bewertung, l.anzahlReviews, l.googleMaps, l.oeffnungszeiten, l.kategorie,
        l.status, l.ort, l.dienstleistung,
      ],
    );
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
  const result = await sql.query<DbLeadRow>(
    `SELECT * FROM leads WHERE list_id = $1 ORDER BY last_contact DESC NULLS LAST, last_seen DESC`,
    [listId],
  );
  return result.rows.map(rowToDbLead);
}

export async function dbLoadAll(): Promise<DbLead[]> {
  await ensureSchema();
  const result = await sql.query<DbLeadRow>("SELECT * FROM leads ORDER BY last_seen DESC");
  return result.rows.map(rowToDbLead);
}

export async function dbCount(): Promise<number> {
  await ensureSchema();
  const result = await sql.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM leads");
  return Number(result.rows[0]?.count ?? 0);
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

  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (patch.leadStatus !== undefined) {
    updates.push(`lead_status = $${i++}`);
    params.push(patch.leadStatus);
  }
  if (patch.notes !== undefined) {
    updates.push(`notes = $${i++}`);
    params.push(patch.notes);
  }
  if (patch.nextActionAt !== undefined) {
    updates.push(`next_action_at = $${i++}`);
    params.push(patch.nextActionAt);
  }
  if (patch.listId !== undefined) {
    updates.push(`list_id = $${i++}`);
    params.push(patch.listId);
  }
  if (patch.bumpCallCount) {
    updates.push(`call_count = call_count + 1`);
  }
  if (patch.setLastContact) {
    updates.push(`last_contact = NOW()`);
  }

  if (updates.length === 0) return await dbGetLead(uid);

  params.push(uid);
  await sql.query(`UPDATE leads SET ${updates.join(", ")} WHERE uid = $${i}`, params);
  return await dbGetLead(uid);
}

export async function dbGetLead(uid: string): Promise<DbLead | null> {
  await ensureSchema();
  const result = await sql.query<DbLeadRow>("SELECT * FROM leads WHERE uid = $1", [uid]);
  return result.rows.length > 0 ? rowToDbLead(result.rows[0]) : null;
}
