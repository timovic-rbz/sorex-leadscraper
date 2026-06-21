import type { Lead } from "./types";
import { getApiKey } from "./api-keys";
import { recordDataForSeoMapsSearch } from "./usage";

// Google-Maps-SERP, synchroner "Live"-Endpoint (kein Polling nötig).
const MAPS_URL = "https://api.dataforseo.com/v3/serp/google/maps/live/advanced";
// location_code für Deutschland (DataForSEO-Standortkatalog).
const LOCATION_CODE_DE = 2276;

interface DfsRating {
  value?: number;
  votes_count?: number;
}

interface DfsTime {
  hour?: number;
  minute?: number;
}

interface DfsWorkHours {
  timetable?: Record<string, { open?: DfsTime; close?: DfsTime }[] | null>;
}

interface DfsMapsItem {
  type?: string;
  title?: string;
  phone?: string;
  address?: string;
  url?: string;
  domain?: string;
  category?: string;
  rating?: DfsRating;
  place_id?: string;
  cid?: string;
  feature_id?: string;
  work_hours?: DfsWorkHours;
}

interface DfsTask {
  status_code?: number;
  status_message?: string;
  result?: { items?: DfsMapsItem[] }[] | null;
}

interface DfsResponse {
  status_code?: number;
  status_message?: string;
  tasks?: DfsTask[];
}

/**
 * Lead-Suche über DataForSEO (Google-Maps-SERP). Spiegelt das Verhalten von
 * searchGoogle: "Dienstleistung in Ort" → Liste von Firmen-Leads.
 *
 * Auth läuft über Basic-Auth mit "login:passwort". Die Credentials liegen unter
 * Einstellungen (Provider `dataforseo`) oder als Env-Var – siehe credentials().
 */
export async function searchDataForSeo(
  service: string,
  city: string,
  maxResults = 20,
  creds?: string,
): Promise<Lead[]> {
  const cred = (creds ?? (await credentials()) ?? "").trim();
  if (!cred.includes(":")) {
    throw new Error(
      "Keine DataForSEO-Credentials konfiguriert. Unter Einstellungen im Format login:passwort " +
        "hinterlegen (oder DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD setzen).",
    );
  }
  const auth = Buffer.from(cred).toString("base64");
  const depth = Math.min(100, Math.max(1, maxResults));

  const r = await fetch(MAPS_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        keyword: `${service} ${city}`,
        language_code: "de",
        location_code: LOCATION_CODE_DE,
        depth,
      },
    ]),
  });

  if (!r.ok) {
    // 401 = falsche Credentials, 402 = kein Guthaben – Text durchreichen.
    throw new Error(`DataForSEO ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }

  const data = (await r.json()) as DfsResponse;
  const task = data.tasks?.[0];
  // DataForSEO antwortet mit HTTP 200 auch bei Task-Fehlern; Status steckt im Body.
  if (!task || task.status_code !== 20000) {
    const msg = task?.status_message ?? data.status_message ?? "unbekannter Fehler";
    throw new Error(`DataForSEO: ${msg}`);
  }

  const items = (task.result?.[0]?.items ?? []).filter((i) => i.type === "maps_search");
  // Verbrauch protokollieren – ein Live-Advanced-Call kostet pauschal, egal wie
  // viele Treffer; wir loggen die Trefferzahl als units fürs Dashboard.
  void recordDataForSeoMapsSearch(items.length);

  return items.slice(0, maxResults).map((i) => itemToLead(i, service, city));
}

/** Credentials aus DB (Settings) oder Env-Var. */
async function credentials(): Promise<string | null> {
  const stored = await getApiKey("dataforseo");
  if (stored) return stored;
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (login && password) return `${login}:${password}`;
  return null;
}

function itemToLead(i: DfsMapsItem, service: string, city: string): Lead {
  const id = i.place_id ?? i.cid ?? i.feature_id ?? `${i.title ?? "?"}-${i.address ?? ""}`;
  return {
    uid: `dataforseo:${id}`,
    source: "dataforseo",
    firmenname: i.title ?? "",
    telefon: i.phone ?? "",
    adresse: i.address ?? "",
    webseite: i.url ?? "",
    email: "",
    bewertung: i.rating?.value != null ? String(i.rating.value) : "",
    anzahlReviews: i.rating?.votes_count ?? 0,
    googleMaps: i.cid ? `https://www.google.com/maps?cid=${i.cid}` : "",
    oeffnungszeiten: formatWorkHours(i.work_hours),
    kategorie: i.category ?? "",
    status: "",
    ort: city,
    dienstleistung: service,
  };
}

const DAY_MAP: [string, string][] = [
  ["monday", "Montag"],
  ["tuesday", "Dienstag"],
  ["wednesday", "Mittwoch"],
  ["thursday", "Donnerstag"],
  ["friday", "Freitag"],
  ["saturday", "Samstag"],
  ["sunday", "Sonntag"],
];

/**
 * Wandelt DataForSEOs work_hours.timetable in das gleiche Pipe-Format um, das
 * auch Google Places liefert ("Montag: 09:00–17:00 | Dienstag: …"), damit der
 * "jetzt geöffnet"-Parser auf den Lead-Karten direkt funktioniert.
 */
function formatWorkHours(wh: DfsWorkHours | undefined): string {
  const tt = wh?.timetable;
  if (!tt) return "";
  const parts: string[] = [];
  for (const [en, de] of DAY_MAP) {
    const ranges = tt[en];
    if (ranges === undefined) continue;
    if (ranges === null) {
      parts.push(`${de}: geschlossen`);
      continue;
    }
    const formatted = ranges
      .filter((r) => r.open && r.close)
      .map((r) => `${hhmm(r.open)}–${hhmm(r.close)}`)
      .join(", ");
    parts.push(`${de}: ${formatted || "geschlossen"}`);
  }
  return parts.join(" | ");
}

function hhmm(t: DfsTime | undefined): string {
  const h = String(t?.hour ?? 0).padStart(2, "0");
  const m = String(t?.minute ?? 0).padStart(2, "0");
  return `${h}:${m}`;
}
