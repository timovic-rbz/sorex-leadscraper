import type {
  CompetitorCheck,
  Lead,
  MarketCheck,
  RankedKeyword,
  ReviewItem,
  WebsiteCheck,
} from "./types";
import { getApiKey } from "./api-keys";
import {
  recordDataForSeoLighthouse,
  recordDataForSeoMapsSearch,
  recordDataForSeoOnPage,
  recordDataForSeoRankedKeywords,
  recordDataForSeoReviews,
  recordDataForSeoSearchVolume,
  recordDataForSeoSerp,
} from "./usage";

// Google-Maps-SERP, synchroner "Live"-Endpoint (kein Polling nötig).
const MAPS_URL = "https://api.dataforseo.com/v3/serp/google/maps/live/advanced";
// Website-Analyse: schneller OnPage-Check + (langsamere) Lighthouse-Scores.
const ONPAGE_INSTANT_URL = "https://api.dataforseo.com/v3/on_page/instant_pages";
const LIGHTHOUSE_LIVE_URL = "https://api.dataforseo.com/v3/on_page/lighthouse/live/json";
// Ranking + Markt: organisches SERP-Ranking + Such-Volumen.
const SERP_ORGANIC_URL = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
const SEARCH_VOLUME_URL =
  "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";
// Reviews (task-basiert: erst posten, dann pollen).
const REVIEWS_POST_URL = "https://api.dataforseo.com/v3/business_data/google/reviews/task_post";
const REVIEWS_GET_URL = "https://api.dataforseo.com/v3/business_data/google/reviews/task_get";
// Keywords, für die eine Domain bei Google rankt (DataForSEO Labs).
const RANKED_KEYWORDS_URL =
  "https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live";
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
 * Macht aus einem DataForSEO-HTTP-Fehler eine verständliche, handlungsweisende
 * Meldung – statt den rohen JSON-Body durchzureichen. 401 = Login falsch/leer,
 * 402 = kein Guthaben.
 */
async function dfsHttpError(label: string, r: Response): Promise<Error> {
  if (r.status === 401) {
    return new Error(
      "DataForSEO-Login abgelehnt (401). Bitte unter Einstellungen → DataForSEO die Zugangsdaten " +
        "im Format login:passwort prüfen. Wichtig: das API-Passwort von app.dataforseo.com/api-access " +
        "verwenden – NICHT das normale Account-Passwort.",
    );
  }
  if (r.status === 402) {
    return new Error("DataForSEO: Kein Guthaben mehr (402). Bitte den Account aufladen.");
  }
  const body = (await r.text().catch(() => "")).slice(0, 160);
  return new Error(`${label} ${r.status}: ${body}`);
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

  if (!r.ok) throw await dfsHttpError("DataForSEO", r);

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

// =============================================================================
// WEBSITE-CHECK – existiert eine Website und wie gut ist sie optimiert?
// Kombiniert OnPage (schnell, SEO-Mängel) + Lighthouse (Scores, langsamer).
// =============================================================================

interface DfsOnPageChecks {
  no_title?: boolean;
  no_description?: boolean;
  no_h1_tag?: boolean;
  no_image_alt?: boolean;
  no_favicon?: boolean;
  high_loading_time?: boolean;
  is_http?: boolean;
  has_render_blocking_resources?: boolean;
  low_content_rate?: boolean;
  duplicate_title_tag?: boolean;
  deprecated_html_tags?: boolean;
}

interface DfsOnPageItem {
  onpage_score?: number;
  status_code?: number;
  page_timing?: { duration_time?: number };
  meta?: { title?: string; description?: string };
  content?: { plain_text_word_count?: number };
  checks?: DfsOnPageChecks;
}

interface DfsOnPageResponse {
  tasks?: {
    status_code?: number;
    status_message?: string;
    result?: { items?: DfsOnPageItem[] }[] | null;
  }[];
}

interface LhCategory {
  score?: number | null;
}
interface LhCategories {
  performance?: LhCategory;
  seo?: LhCategory;
  accessibility?: LhCategory;
  "best-practices"?: LhCategory;
  best_practices?: LhCategory;
}
interface LhResult {
  categories?: LhCategories;
  lighthouse?: { categories?: LhCategories };
  lighthouse_result?: { categories?: LhCategories };
  items?: { categories?: LhCategories }[];
}
interface DfsLhResponse {
  tasks?: {
    status_code?: number;
    status_message?: string;
    result?: LhResult[] | null;
  }[];
}

/**
 * Analysiert eine Website über DataForSEO. OnPage läuft immer (schnell, günstig);
 * Lighthouse nur auf Wunsch (opts.lighthouse) – das ist der teure/langsame Teil.
 * Beide laufen parallel & unabhängig: scheitert Lighthouse (z.B. Timeout), kommen
 * die OnPage-Daten trotzdem zurück. Wirft nur, wenn OnPage selbst fehlschlägt.
 */
export async function checkWebsite(
  rawUrl: string,
  opts: { lighthouse?: boolean } = {},
): Promise<WebsiteCheck> {
  const cred = ((await credentials()) ?? "").trim();
  if (!cred.includes(":")) {
    throw new Error(
      "Keine DataForSEO-Credentials konfiguriert. Unter Einstellungen im Format login:passwort hinterlegen.",
    );
  }
  const auth = Buffer.from(cred).toString("base64");
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };

  const [onpageRes, lhRes] = await Promise.allSettled([
    runOnPage(url, headers),
    opts.lighthouse ? runLighthouse(url, headers) : Promise.resolve<Partial<WebsiteCheck>>({}),
  ]);

  const result: WebsiteCheck = {
    url,
    onpageScore: null,
    loadTimeMs: null,
    isHttps: url.toLowerCase().startsWith("https"),
    hasTitle: null,
    hasDescription: null,
    hasH1: null,
    imagesHaveAlt: null,
    wordCount: null,
    issues: [],
    onpageError: null,
    lhPerformance: null,
    lhSeo: null,
    lhBestPractices: null,
    lhAccessibility: null,
    lighthouseError: null,
  };

  if (onpageRes.status === "fulfilled") {
    Object.assign(result, onpageRes.value);
  } else {
    // OnPage ist die Basis – schlägt sie fehl (Creds/Guthaben), ist der ganze Check hin.
    throw new Error(
      (onpageRes.reason as Error)?.message ?? "Website-Analyse fehlgeschlagen",
    );
  }
  if (opts.lighthouse) {
    if (lhRes.status === "fulfilled") {
      Object.assign(result, lhRes.value);
    } else {
      result.lighthouseError = (lhRes.reason as Error)?.message ?? "Lighthouse fehlgeschlagen";
    }
  }
  return result;
}

async function runOnPage(
  url: string,
  headers: Record<string, string>,
): Promise<Partial<WebsiteCheck>> {
  const r = await fetch(ONPAGE_INSTANT_URL, {
    method: "POST",
    headers,
    body: JSON.stringify([{ url, enable_javascript: false }]),
  });
  if (!r.ok) throw await dfsHttpError("DataForSEO OnPage", r);
  const data = (await r.json()) as DfsOnPageResponse;
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO OnPage: ${task?.status_message ?? "Fehler"}`);
  }
  void recordDataForSeoOnPage();
  const item = task.result?.[0]?.items?.[0];
  if (!item) throw new Error("Keine OnPage-Daten erhalten");
  const c = item.checks ?? {};
  return {
    onpageScore: item.onpage_score != null ? Math.round(item.onpage_score) : null,
    loadTimeMs: item.page_timing?.duration_time ?? null,
    isHttps: c.is_http === undefined ? url.toLowerCase().startsWith("https") : !c.is_http,
    hasTitle: c.no_title === undefined ? null : !c.no_title,
    hasDescription: c.no_description === undefined ? null : !c.no_description,
    hasH1: c.no_h1_tag === undefined ? null : !c.no_h1_tag,
    imagesHaveAlt: c.no_image_alt === undefined ? null : !c.no_image_alt,
    wordCount: item.content?.plain_text_word_count ?? null,
    issues: buildIssues(c),
    onpageError: null,
  };
}

const ISSUE_LABELS: { key: keyof DfsOnPageChecks; label: string }[] = [
  { key: "no_title", label: "Kein Title-Tag" },
  { key: "no_description", label: "Keine Meta-Description" },
  { key: "no_h1_tag", label: "Keine H1-Überschrift" },
  { key: "no_image_alt", label: "Bilder ohne Alt-Text" },
  { key: "no_favicon", label: "Kein Favicon" },
  { key: "high_loading_time", label: "Lange Ladezeit" },
  { key: "is_http", label: "Kein HTTPS" },
  { key: "has_render_blocking_resources", label: "Render-blockierende Ressourcen" },
  { key: "low_content_rate", label: "Wenig Textinhalt" },
  { key: "duplicate_title_tag", label: "Doppelter Title" },
  { key: "deprecated_html_tags", label: "Veraltete HTML-Tags" },
];

function buildIssues(c: DfsOnPageChecks): string[] {
  return ISSUE_LABELS.filter(({ key }) => c[key] === true).map(({ label }) => label);
}

async function runLighthouse(
  url: string,
  headers: Record<string, string>,
): Promise<Partial<WebsiteCheck>> {
  // Lighthouse rendert die ganze Seite und dauert 20–40s. Hartes Timeout, damit
  // die Vercel-Function nicht stirbt und die OnPage-Daten trotzdem zurückkommen.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const r = await fetch(LIGHTHOUSE_LIVE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify([{ url, for_mobile: false }]),
      signal: ctrl.signal,
    });
    if (!r.ok) throw await dfsHttpError("DataForSEO Lighthouse", r);
    const data = (await r.json()) as DfsLhResponse;
    const task = data.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      throw new Error(`DataForSEO Lighthouse: ${task?.status_message ?? "Fehler"}`);
    }
    void recordDataForSeoLighthouse();
    const cats = findCategories(task.result?.[0]);
    return {
      lhPerformance: scoreToPct(cats?.performance?.score),
      lhSeo: scoreToPct(cats?.seo?.score),
      lhBestPractices: scoreToPct(cats?.["best-practices"]?.score ?? cats?.best_practices?.score),
      lhAccessibility: scoreToPct(cats?.accessibility?.score),
      lighthouseError: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Lighthouse-JSON-Struktur variiert je nach DataForSEO-Version – defensiv suchen. */
function findCategories(result: LhResult | undefined): LhCategories | null {
  if (!result) return null;
  return (
    result.categories ??
    result.lighthouse?.categories ??
    result.lighthouse_result?.categories ??
    result.items?.[0]?.categories ??
    null
  );
}

/** Lighthouse-Scores kommen als 0–1; auf 0–100 runden (tolerant, falls schon 0–100). */
function scoreToPct(score: number | null | undefined): number | null {
  if (score == null) return null;
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  return Math.round(n <= 1 ? n * 100 : n);
}

// =============================================================================
// MARKT & RANKING – organisches Google-Ranking + Such-Volumen zum Keyword
// =============================================================================

/** Basic-Auth-Header aus den gespeicherten Credentials (oder Fehler). */
async function authHeader(): Promise<string> {
  const cred = ((await credentials()) ?? "").trim();
  if (!cred.includes(":")) {
    throw new Error(
      "Keine DataForSEO-Credentials konfiguriert. Unter Einstellungen im Format login:passwort hinterlegen.",
    );
  }
  return `Basic ${Buffer.from(cred).toString("base64")}`;
}

interface DfsSerpItem {
  type?: string;
  rank_absolute?: number;
  domain?: string;
  title?: string;
}
interface DfsSerpResponse {
  tasks?: {
    status_code?: number;
    status_message?: string;
    result?: { items?: DfsSerpItem[] }[] | null;
  }[];
}
interface DfsVolItem {
  keyword?: string;
  search_volume?: number | null;
  competition?: string | null;
  cpc?: number | null;
}
interface DfsVolResponse {
  tasks?: {
    status_code?: number;
    status_message?: string;
    result?: DfsVolItem[] | null;
  }[];
}

/**
 * Markt-Check zum Hauptkeyword (Dienstleistung + Ort): organisches Google-
 * Ranking des Leads + monatliches Suchvolumen. Beide Calls parallel & robust.
 */
export async function getMarketCheck(params: {
  service: string;
  city: string;
  websiteDomain?: string;
}): Promise<MarketCheck> {
  const auth = await authHeader();
  const headers = { Authorization: auth, "Content-Type": "application/json" };
  const keyword = `${params.service} ${params.city}`.trim().replace(/\s+/g, " ").toLowerCase();

  const [serpRes, volRes] = await Promise.allSettled([
    runSerpRanking(keyword, headers, params.websiteDomain),
    runSearchVolume(keyword, headers),
  ]);

  const market: MarketCheck = {
    keyword,
    searchVolume: null,
    competition: "",
    cpc: null,
    rank: null,
    rankDepth: 20,
    topCompetitors: [],
  };
  if (serpRes.status === "fulfilled") Object.assign(market, serpRes.value);
  if (volRes.status === "fulfilled") Object.assign(market, volRes.value);
  if (serpRes.status === "rejected" && volRes.status === "rejected") {
    throw serpRes.reason instanceof Error ? serpRes.reason : new Error("Markt-Analyse fehlgeschlagen");
  }
  return market;
}

const normDomain = (d: string | undefined): string => (d ?? "").toLowerCase().replace(/^www\./, "");

async function runSerpRanking(
  keyword: string,
  headers: Record<string, string>,
  websiteDomain?: string,
): Promise<Partial<MarketCheck>> {
  const depth = 20;
  const r = await fetch(SERP_ORGANIC_URL, {
    method: "POST",
    headers,
    body: JSON.stringify([{ keyword, language_code: "de", location_code: LOCATION_CODE_DE, depth }]),
  });
  if (!r.ok) throw await dfsHttpError("DataForSEO SERP", r);
  const data = (await r.json()) as DfsSerpResponse;
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO SERP: ${task?.status_message ?? "Fehler"}`);
  }
  void recordDataForSeoSerp();
  const items = (task.result?.[0]?.items ?? []).filter((i) => i.type === "organic");
  const target = normDomain(websiteDomain);
  const mine = target ? items.find((i) => normDomain(i.domain) === target) : undefined;
  const rank = mine?.rank_absolute ?? null;
  const topCompetitors = items
    .filter((i) => normDomain(i.domain) !== target)
    .filter((i) => rank == null || (i.rank_absolute ?? 999) < rank)
    .slice(0, 3)
    .map((i) => ({ rank: i.rank_absolute ?? 0, domain: normDomain(i.domain), title: i.title ?? "" }));
  return { rank, rankDepth: depth, topCompetitors };
}

async function runSearchVolume(
  keyword: string,
  headers: Record<string, string>,
): Promise<Partial<MarketCheck>> {
  const r = await fetch(SEARCH_VOLUME_URL, {
    method: "POST",
    headers,
    body: JSON.stringify([{ keywords: [keyword], language_code: "de", location_code: LOCATION_CODE_DE }]),
  });
  if (!r.ok) throw await dfsHttpError("DataForSEO Keywords", r);
  const data = (await r.json()) as DfsVolResponse;
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO Keywords: ${task?.status_message ?? "Fehler"}`);
  }
  void recordDataForSeoSearchVolume();
  const item = task.result?.[0];
  return {
    searchVolume: item?.search_volume ?? null,
    competition: item?.competition ?? "",
    cpc: item?.cpc ?? null,
  };
}

// =============================================================================
// KONKURRENZ – lokaler Maps-Vergleich (Bewertung, Reviews, Website ja/nein)
// =============================================================================

/**
 * Konkurrenz-Vergleich aus dem lokalen Google-Maps-Umfeld. Nutzt dieselbe
 * Maps-Suche wie das Scrapen (ein Call, ~0,2 ct) und stellt den Lead seinen
 * Mitbewerbern gegenüber (Bewertung, Anzahl Reviews, Website ja/nein).
 */
export async function getCompetitors(
  service: string,
  city: string,
  selfName?: string,
): Promise<CompetitorCheck> {
  const leads = await searchDataForSeo(service, city, 20);
  const norm = (s: string) => s.trim().toLowerCase();
  const self = selfName ? norm(selfName) : "";

  const competitors = leads.map((l) => ({
    name: l.firmenname,
    rating: l.bewertung ? Number(l.bewertung) || null : null,
    reviews: l.anzahlReviews ?? 0,
    hasWebsite: Boolean(l.webseite),
    isSelf: self !== "" && norm(l.firmenname) === self,
  }));

  const rated = competitors.filter((c) => c.rating != null);
  const avgRating = rated.length
    ? rated.reduce((a, c) => a + (c.rating ?? 0), 0) / rated.length
    : null;
  const withWebsite = competitors.filter((c) => c.hasWebsite).length;

  // Nach Bewertung (dann Review-Anzahl) sortieren = "Qualitäts-Ranking" des Felds.
  const sorted = [...competitors].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviews - a.reviews,
  );
  const selfIdx = sorted.findIndex((c) => c.isSelf);

  return {
    keyword: `${service} ${city}`.trim(),
    total: competitors.length,
    avgRating: avgRating != null ? Math.round(avgRating * 10) / 10 : null,
    withWebsite,
    selfRank: selfIdx >= 0 ? selfIdx + 1 : null,
    competitors: sorted.slice(0, 8),
  };
}

// =============================================================================
// REVIEWS – Bewertungstexte (task-basiert: posten → pollen)
// =============================================================================

interface DfsReviewItem {
  rating?: { value?: number };
  review_text?: string;
  text?: string;
  time_ago?: string;
  profile_name?: string;
}

/** Reviews-Task anlegen (sortiert nach niedrigster Bewertung). Liefert die Task-ID. */
export async function postReviewsTask(params: {
  cid?: string;
  placeId?: string;
  name?: string;
}): Promise<string> {
  if (!params.cid && !params.placeId && !params.name) {
    throw new Error("Kein Identifikator (cid/place_id/Name) für Reviews übergeben.");
  }
  const headers = { Authorization: await authHeader(), "Content-Type": "application/json" };
  const target = params.cid
    ? { cid: params.cid }
    : params.placeId
      ? { place_id: params.placeId }
      : { keyword: params.name };
  const r = await fetch(REVIEWS_POST_URL, {
    method: "POST",
    headers,
    body: JSON.stringify([
      { ...target, language_code: "de", location_code: LOCATION_CODE_DE, depth: 10, sort_by: "lowest_rating" },
    ]),
  });
  if (!r.ok) throw await dfsHttpError("DataForSEO Reviews", r);
  const data = (await r.json()) as { tasks?: { id?: string; status_message?: string }[] };
  const id = data.tasks?.[0]?.id;
  if (!id) throw new Error(`DataForSEO Reviews: ${data.tasks?.[0]?.status_message ?? "Task fehlgeschlagen"}`);
  return id;
}

/** Reviews-Task abfragen. ready=false bedeutet: noch in Arbeit, später erneut pollen. */
export async function getReviewsTask(id: string): Promise<{ ready: boolean; reviews: ReviewItem[] }> {
  const r = await fetch(`${REVIEWS_GET_URL}/${encodeURIComponent(id)}`, {
    headers: { Authorization: await authHeader() },
  });
  if (!r.ok) throw await dfsHttpError("DataForSEO Reviews", r);
  const data = (await r.json()) as {
    tasks?: { status_code?: number; result?: { items?: DfsReviewItem[] }[] | null }[];
  };
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) return { ready: false, reviews: [] };
  const items = task.result?.[0]?.items ?? [];
  const reviews: ReviewItem[] = items.map((i) => ({
    rating: i.rating?.value ?? null,
    text: (i.review_text ?? i.text ?? "").trim(),
    timeAgo: i.time_ago ?? "",
    author: i.profile_name ?? "",
  }));
  void recordDataForSeoReviews(reviews.length);
  return { ready: true, reviews };
}

// =============================================================================
// RANKED KEYWORDS – für welche Keywords rankt die Domain (DataForSEO Labs)
// =============================================================================

interface DfsRankedItem {
  keyword_data?: { keyword?: string; keyword_info?: { search_volume?: number | null } };
  ranked_serp_element?: {
    serp_item?: { rank_group?: number; rank_absolute?: number; type?: string };
  };
}
interface DfsRankedResponse {
  tasks?: {
    status_code?: number;
    status_message?: string;
    result?: { items?: DfsRankedItem[] }[] | null;
  }[];
}

/**
 * Keywords, für die eine Domain bei Google organisch rankt – sortiert nach
 * Suchvolumen. Nur sinnvoll für optimierte Seiten (UI gated das auf onpage_score).
 */
export async function getRankedKeywords(rawUrl: string): Promise<RankedKeyword[]> {
  const target = rawUrl
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim();
  if (!target) throw new Error("Keine gültige Domain für Ranked Keywords.");

  const headers = { Authorization: await authHeader(), "Content-Type": "application/json" };
  const r = await fetch(RANKED_KEYWORDS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify([
      {
        target,
        language_code: "de",
        location_code: LOCATION_CODE_DE,
        limit: 50,
        order_by: ["keyword_data.keyword_info.search_volume,desc"],
      },
    ]),
  });
  if (!r.ok) throw await dfsHttpError("DataForSEO Ranked Keywords", r);
  const data = (await r.json()) as DfsRankedResponse;
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO Ranked Keywords: ${task?.status_message ?? "Fehler"}`);
  }
  void recordDataForSeoRankedKeywords();

  const items = task.result?.[0]?.items ?? [];
  return items
    .map((i) => {
      const serp = i.ranked_serp_element?.serp_item;
      return {
        keyword: i.keyword_data?.keyword ?? "",
        position: serp?.rank_group ?? serp?.rank_absolute ?? 0,
        searchVolume: i.keyword_data?.keyword_info?.search_volume ?? null,
        type: serp?.type,
      };
    })
    .filter((k) => k.keyword && k.position > 0 && (k.type === undefined || k.type === "organic"))
    .map(({ keyword, position, searchVolume }) => ({ keyword, position, searchVolume }))
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .slice(0, 25);
}
