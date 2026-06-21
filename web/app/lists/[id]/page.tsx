"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { use } from "react";
import {
  LEAD_STATUS_META,
  LEAD_STATUS_ORDER,
  type BusinessProfile,
  type DbLead,
  type LeadEnrichment,
  type LeadStatus,
  type List,
  type MarketCheck,
  type ReviewItem,
  type WebsiteCheck,
} from "@/lib/types";
import { GoogleProfileButton } from "@/components/GoogleProfileButton";

const HIDDEN_STATUSES_KEY = "lead-board:hidden-statuses";
const WEBSITE_FILTER_KEY = "lead-board:website-filter";

type WebsiteFilter = "all" | "with" | "without";

function loadHidden(): Set<LeadStatus> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(HIDDEN_STATUSES_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as LeadStatus[]);
  } catch {
    return new Set();
  }
}

function saveHidden(hidden: Set<LeadStatus>) {
  try {
    localStorage.setItem(HIDDEN_STATUSES_KEY, JSON.stringify([...hidden]));
  } catch {
    /* localStorage voll oder disabled — egal */
  }
}

function loadWebsiteFilter(): WebsiteFilter {
  if (typeof window === "undefined") return "all";
  try {
    const v = localStorage.getItem(WEBSITE_FILTER_KEY);
    if (v === "with" || v === "without") return v;
    return "all";
  } catch {
    return "all";
  }
}

function saveWebsiteFilter(v: WebsiteFilter) {
  try {
    localStorage.setItem(WEBSITE_FILTER_KEY, v);
  } catch {
    /* egal */
  }
}

interface ListResponse {
  list: List;
  leads: DbLead[];
}

export default function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const deepLinkUid = searchParams.get("lead");
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<DbLead | null>(null);
  const [hidden, setHidden] = useState<Set<LeadStatus>>(() => new Set());
  const [websiteFilter, setWebsiteFilter] = useState<WebsiteFilter>("all");

  useEffect(() => {
    setHidden(loadHidden());
    setWebsiteFilter(loadWebsiteFilter());
  }, []);

  // Deep-Link aus der Telefonnummern-Suche: ?lead=<uid> → Modal automatisch öffnen
  useEffect(() => {
    if (!data || !deepLinkUid) return;
    const target = data.leads.find((l) => l.uid === deepLinkUid);
    if (target) setOpenLead(target);
  }, [data, deepLinkUid]);

  function toggleHidden(s: LeadStatus) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      saveHidden(next);
      return next;
    });
  }

  function changeWebsiteFilter(v: WebsiteFilter) {
    setWebsiteFilter(v);
    saveWebsiteFilter(v);
  }

  async function reload() {
    try {
      const r = await fetch(`/api/lists/${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as ListResponse;
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    reload();
  }, [id]);

  const grouped = useMemo(() => {
    const g: Record<LeadStatus, DbLead[]> = {
      new: [], no_answer: [], follow_up: [], interested: [], call_scheduled: [],
      won: [], not_interested: [], lost: [],
    };
    if (!data) return g;
    for (const lead of data.leads) {
      // Website-Filter vor dem Gruppieren — Counts spiegeln das echte Sicht-Set
      if (websiteFilter === "with" && !lead.webseite) continue;
      if (websiteFilter === "without" && lead.webseite) continue;
      const s = (lead.leadStatus ?? "new") as LeadStatus;
      (g[s] ?? g.new).push(lead);
    }
    return g;
  }, [data, websiteFilter]);

  // Header-Counts: separat berechnet, damit man sieht wieviel rausgefiltert wurde
  const totalCounts = useMemo(() => {
    if (!data) return { total: 0, withWebsite: 0, withoutWebsite: 0 };
    let withWebsite = 0;
    let withoutWebsite = 0;
    for (const l of data.leads) {
      if (l.webseite) withWebsite++;
      else withoutWebsite++;
    }
    return { total: data.leads.length, withWebsite, withoutWebsite };
  }, [data]);

  // Aktuell sichtbare Leads (Website-Filter + nicht ausgeblendete Status-Spalten)
  // – das Set, auf das sich die Batch-Anreicherung bezieht.
  const visibleLeads = useMemo(
    () => LEAD_STATUS_ORDER.filter((s) => !hidden.has(s)).flatMap((s) => grouped[s]),
    [grouped, hidden],
  );

  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);

  async function enrichVisible() {
    const leads = visibleLeads;
    if (leads.length === 0 || batch) return;
    // Profil (~0,2 ct) + Website-OnPage (~0,1 ct, nur wenn Website da). Lighthouse
    // bewusst NICHT im Batch (zu teuer/langsam). Bereits gecachte = gratis.
    const estCt = (leads.length * 0.3).toFixed(1);
    const ok = window.confirm(
      `${leads.length} sichtbare Leads anreichern?\n\n` +
        `• Business-Profil (~0,2 ct/Lead)\n` +
        `• Website-Check OnPage (~0,1 ct, nur mit Website)\n` +
        `• Lighthouse NICHT im Batch (einzeln im Lead nachladbar)\n\n` +
        `Geschätzt: ~${estCt} ct. Bereits geladene Leads werden übersprungen (gratis).`,
    );
    if (!ok) return;

    setBatch({ done: 0, total: leads.length });
    const queue = [...leads];
    let done = 0;
    const worker = async () => {
      while (queue.length) {
        const lead = queue.shift();
        if (!lead) break;
        await enrichOne(lead);
        done++;
        setBatch({ done, total: leads.length });
      }
    };
    // Begrenzte Parallelität, damit DataForSEO nicht rate-limitet.
    await Promise.all([worker(), worker(), worker()]);
    setBatch(null);
  }

  if (error)
    return (
      <div className="mx-auto max-w-7xl p-6 lg:p-10">
        <div className="card border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">❌ {error}</div>
      </div>
    );

  if (!data) return <div className="p-6"><p className="text-stone-500">Lade...</p></div>;

  return (
    <div className="mx-auto max-w-[1900px] p-4 lg:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/lists" className="inline-flex items-center gap-1 rounded-full bg-white border border-stone-200 px-3.5 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50">
            ‹ Listen
          </Link>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{data.list.name}</h1>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-medium text-stone-500 tabular-nums">
            {data.leads.length} Leads
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={enrichVisible}
            disabled={batch != null || visibleLeads.length === 0}
            title="Profil + Website-Check für alle sichtbaren Leads laden (gecachte werden übersprungen)"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            {batch ? `✨ Anreichern… ${batch.done}/${batch.total}` : `✨ Sichtbare anreichern (${visibleLeads.length})`}
          </button>
          <Link href="/" className="btn-primary">+ Mehr Leads suchen</Link>
        </div>
      </header>

      {/* Website-Filter (Segmented Control) */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-stone-500">Website:</span>
        <div className="inline-flex gap-0.5 rounded-full bg-stone-100 p-0.5">
          <WebsitePill
            active={websiteFilter === "all"}
            onClick={() => changeWebsiteFilter("all")}
            label={`Alle (${totalCounts.total})`}
          />
          <WebsitePill
            active={websiteFilter === "without"}
            onClick={() => changeWebsiteFilter("without")}
            label={`🌐✗ Ohne (${totalCounts.withoutWebsite})`}
            color="text-amber-700"
          />
          <WebsitePill
            active={websiteFilter === "with"}
            onClick={() => changeWebsiteFilter("with")}
            label={`🌐 Mit (${totalCounts.withWebsite})`}
            color="text-emerald-700"
          />
        </div>
      </div>

      {/* Status-Filter-Leiste: outline-Chips mit Status-Punkt; ausgegraute kollabieren */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        {LEAD_STATUS_ORDER.map((s) => {
          const meta = LEAD_STATUS_META[s];
          const count = grouped[s].length;
          const isHidden = hidden.has(s);
          return (
            <button
              key={s}
              onClick={() => toggleHidden(s)}
              className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-medium transition ${
                isHidden
                  ? "border-stone-200 bg-white text-stone-400 hover:border-stone-300 hover:text-stone-600"
                  : "border-stone-200 bg-white text-stone-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-stone-300"
              }`}
              title={isHidden ? `${meta.label} einblenden` : `${meta.label} ausblenden`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full transition"
                style={{ background: isHidden ? "#d6d3d1" : meta.accent }}
              />
              <span>{meta.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  isHidden ? "bg-stone-100 text-stone-400" : "bg-stone-100 text-stone-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Kanban – horizontal scrollbar mit min-Width pro Spalte */}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
        <div className="flex gap-3.5 min-w-fit">
          {LEAD_STATUS_ORDER.map((status) => {
            const meta = LEAD_STATUS_META[status];
            const leads = grouped[status];
            const isHidden = hidden.has(status);
            const isEmpty = leads.length === 0;

            // Versteckt → schmaler Streifen mit vertikalem Label, klick zum Aufklappen
            if (isHidden) {
              return (
                <button
                  key={status}
                  onClick={() => toggleHidden(status)}
                  className="flex w-11 shrink-0 flex-col items-center gap-2 rounded-3xl bg-stone-100/70 py-3 text-xs text-stone-500 transition hover:bg-stone-200/70"
                  title="Einblenden"
                >
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: meta.accent }} />
                  <span className="rounded-full bg-white px-1.5 py-0.5 tabular-nums shadow-sm">
                    {leads.length}
                  </span>
                  <span
                    className="mt-1 whitespace-nowrap font-medium text-stone-500"
                    style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                  >
                    {meta.label}
                  </span>
                </button>
              );
            }

            return (
              <div
                key={status}
                className="flex w-72 shrink-0 flex-col rounded-3xl bg-stone-100/70 p-2.5 sm:w-80"
              >
                <div className="flex items-center justify-between px-2 py-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: meta.accent }} />
                    <span className="truncate">{meta.label}</span>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-500 tabular-nums shadow-sm">
                    {leads.length}
                  </span>
                </div>
                <div className="flex max-h-[72vh] flex-col gap-2.5 overflow-y-auto p-0.5 pt-1.5">
                  {isEmpty && (
                    <p className="px-2 py-8 text-center text-xs text-stone-400">noch leer</p>
                  )}
                  {leads.map((l) => (
                    <LeadCard key={l.uid} lead={l} onClick={() => setOpenLead(l)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {openLead && (() => {
        // Durchlauf-Modus: Queue = die Leads der Spalte, aus der dieser Lead
        // geöffnet wurde (in Anzeige-Reihenfolge, inkl. aktivem Website-Filter).
        const queueStatus = (openLead.leadStatus ?? "new") as LeadStatus;
        const queue = grouped[queueStatus] ?? [];
        const queueIndex = queue.findIndex((l) => l.uid === openLead.uid);
        const nextLead = queueIndex >= 0 ? queue[queueIndex + 1] ?? null : null;
        return (
          <LeadModal
            key={openLead.uid}
            lead={openLead}
            queuePosition={queueIndex >= 0 ? queueIndex + 1 : null}
            queueTotal={queue.length}
            nextName={nextLead?.firmenname ?? null}
            onClose={() => setOpenLead(null)}
            onSaved={(advance) => {
              // Board im Hintergrund neu laden (Counts aktualisieren),
              // dann entweder zum nächsten Lead springen oder schließen.
              reload();
              setOpenLead(advance && nextLead ? nextLead : null);
            }}
          />
        );
      })()}
    </div>
  );
}

function WebsitePill({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1 font-medium transition ${
        active
          ? "bg-white shadow-sm " + (color ?? "text-stone-900")
          : "text-stone-500 hover:text-stone-700"
      }`}
    >
      {label}
    </button>
  );
}

function LeadCard({ lead, onClick }: { lead: DbLead; onClick: () => void }) {
  const today = getTodayHours(lead.oeffnungszeiten);
  const accent = LEAD_STATUS_META[lead.leadStatus ?? "new"].accent;
  const footer = leadFooter(lead);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group relative shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-stone-200 bg-white py-3 pl-4 pr-3 text-left text-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_6px_16px_rgba(0,0,0,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
    >
      {/* Farbiger Status-Akzent am linken Rand */}
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: accent }} aria-hidden />

      {/* Name (max. 2 Zeilen) + Website-/Google-Buttons rechts */}
      <div className="flex items-start justify-between gap-2">
        <div className="line-clamp-2 flex-1 font-semibold leading-snug text-stone-900">
          {lead.firmenname}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {lead.webseite && <GlobeLink href={lead.webseite} />}
          <GoogleProfileButton name={lead.firmenname} ort={lead.ort} size="sm" />
        </div>
      </div>

      {/* Telefon: ganze Zeile, Whitespace nicht brechen */}
      {lead.telefon && (
        <div className="mt-2 flex items-center gap-1.5 text-rose-600">
          <PhoneIcon />
          <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums">
            {lead.telefon}
          </span>
        </div>
      )}

      {/* Öffnungszeiten heute (live geöffnet/zu) */}
      {today && (
        <div className="mt-2">
          <OpenNowChip today={today} />
        </div>
      )}

      {/* Adresse mit Pin-Icon */}
      {lead.adresse && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-stone-500">
          <PinIcon />
          <span className="line-clamp-1">{lead.adresse}</span>
        </div>
      )}

      {/* Fußzeile: Status-Punkt + adaptiver Kontext (Notiz / Wiedervorlage / Versuche) */}
      <div className="mt-2.5 flex items-center gap-2 border-t border-stone-100 pt-2 text-[11px] text-stone-500">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} aria-hidden />
        <span className="line-clamp-1 flex-1">{footer}</span>
        {lead.lastSetterName && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
            style={{ background: lead.lastSetterColor ?? "#525252" }}
            title={`von ${lead.lastSetterName}`}
          />
        )}
      </div>
    </div>
  );
}

/** Adaptive Kontextzeile für die Karte: zeigt das jeweils Relevanteste. */
function leadFooter(lead: DbLead): string {
  const status = lead.leadStatus ?? "new";
  if ((status === "follow_up" || status === "call_scheduled") && lead.nextActionAt) {
    const label = status === "call_scheduled" ? "Call" : "Wiedervorlage";
    return `${label} ${fmtRelDateTime(lead.nextActionAt)}`;
  }
  const note = lead.notes?.trim();
  if (note) return note;
  if (lead.callCount > 0) {
    const when = lead.lastContact ? ` · ${fmtRelDateTime(lead.lastContact)}` : "";
    return `${lead.callCount}× versucht${when}`;
  }
  return "noch nicht versucht";
}

/** "heute 11:24" / "gestern 16:10" / "morgen 14:00" / "12.05. 14:00". */
function fmtRelDateTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day0 = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day0(d) - day0(now)) / 86_400_000);
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const day =
    diff === 0 ? "heute"
    : diff === -1 ? "gestern"
    : diff === 1 ? "morgen"
    : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return `${day} ${time}`;
}

function GlobeLink({ href }: { href: string }) {
  const url = /^https?:\/\//i.test(href) ? href : `https://${href}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Webseite öffnen"
      className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
    >
      <GlobeIcon />
    </a>
  );
}

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="mt-px shrink-0 text-stone-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

const DAY_NAMES_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

interface TodayHours {
  /** Rohwert der heutigen Zeiten, z.B. "09:00–17:00" oder "geschlossen". */
  label: string;
  /** Heute ganztägig geschlossen. */
  closedAllDay: boolean;
  /** Gerade jetzt geöffnet (anhand der lokalen Uhrzeit). */
  openNow: boolean;
  /** Wenn jetzt geöffnet: wann heute geschlossen wird. */
  closesAt: string | null;
  /** Wenn jetzt zu, aber heute noch eine Öffnung kommt: nächste Öffnungszeit. */
  opensAt: string | null;
}

/**
 * Parst die heutigen Öffnungszeiten aus dem Google-Format
 * ("Montag: 09:00–17:00 | Dienstag: …") und berechnet, ob gerade geöffnet ist.
 * Liefert null, wenn es keine verwertbaren Zeiten für heute gibt
 * (z.B. OSM-Format ohne Wochentag-Prefix).
 */
function getTodayHours(raw: string | null | undefined): TodayHours | null {
  if (!raw) return null;
  const todayName = DAY_NAMES_DE[new Date().getDay()];
  const parts = raw.split("|").map((p) => p.trim());
  const todayPart = parts.find((p) => p.toLowerCase().startsWith(todayName.toLowerCase() + ":"));
  if (!todayPart) return null;
  const value = todayPart.slice(todayPart.indexOf(":") + 1).trim().replace(/\s*Uhr\s*$/i, "");
  if (!value) return null;
  if (/geschlossen/i.test(value)) {
    return { label: "geschlossen", closedAllDay: true, openNow: false, closesAt: null, opensAt: null };
  }

  // Alle HH:MM–HH:MM Bereiche heraussammeln (Bindestrich, Halbgeviert- oder Geviertstrich).
  const ranges: { start: number; end: number; startLabel: string; endLabel: string }[] = [];
  const re = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    ranges.push({
      start: +m[1] * 60 + +m[2],
      end: +m[3] * 60 + +m[4],
      startLabel: `${m[1].padStart(2, "0")}:${m[2]}`,
      endLabel: `${m[3].padStart(2, "0")}:${m[4]}`,
    });
  }
  if (ranges.length === 0) {
    // Zeiten nicht parsebar → wenigstens Rohwert anzeigen, ohne Live-Status.
    return { label: value, closedAllDay: false, openNow: false, closesAt: null, opensAt: null };
  }

  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const current = ranges.find((r) => now >= r.start && now < r.end) ?? null;
  const upcoming = current
    ? null
    : ranges.filter((r) => r.start > now).sort((a, b) => a.start - b.start)[0] ?? null;
  return {
    label: value,
    closedAllDay: false,
    openNow: !!current,
    closesAt: current?.endLabel ?? null,
    opensAt: upcoming?.startLabel ?? null,
  };
}

/** Kompakter Chip für die Kanban-Karte: Live-Status der heutigen Öffnungszeiten. */
function OpenNowChip({ today }: { today: TodayHours }) {
  let cls = "bg-stone-100 text-stone-500";
  let text = today.label;
  if (today.openNow) {
    cls = "bg-emerald-50 text-emerald-700";
    text = today.closesAt ? `geöffnet · bis ${today.closesAt}` : "geöffnet";
  } else if (today.opensAt) {
    cls = "bg-amber-50 text-amber-700";
    text = `öffnet ${today.opensAt}`;
  } else if (today.closedAllDay) {
    text = "geschlossen";
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium ${cls}`}>
      <ClockIcon />
      {text}
    </span>
  );
}

/** Prominentes Badge im Lead-Modal: lohnt sich ein Anruf gerade jetzt? */
function OpenNowBadge({ today }: { today: TodayHours }) {
  if (today.openNow) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        Jetzt geöffnet{today.closesAt && ` · bis ${today.closesAt}`}
      </span>
    );
  }
  const text = today.opensAt
    ? `Geschlossen · öffnet ${today.opensAt}`
    : today.closedAllDay
      ? "Heute geschlossen"
      : `Geschlossen · ${today.label}`;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-500 ring-1 ring-stone-200">
      <span className="h-2 w-2 rounded-full bg-stone-400" />
      {text}
    </span>
  );
}

// ============================================================================
// Lead-Modal
// ============================================================================

function LeadModal({
  lead,
  queuePosition,
  queueTotal,
  nextName,
  onClose,
  onSaved,
}: {
  lead: DbLead;
  queuePosition: number | null;
  queueTotal: number;
  nextName: string | null;
  onClose: () => void;
  /** advance=true → nach Status-Aktion zum nächsten Lead springen statt schließen. */
  onSaved: (advance: boolean) => void;
}) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [nextActionAt, setNextActionAt] = useState(
    lead.nextActionAt ? toDatetimeLocal(lead.nextActionAt) : "",
  );
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Gecachte DataForSEO-Anreicherung laden (reiner DB-Read, kostenlos), damit
  // bereits Bezahltes sofort ohne erneuten API-Call angezeigt wird.
  const [enrichment, setEnrichment] = useState<LeadEnrichment | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/leads/${encodeURIComponent(lead.uid)}/enrichment`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { enrichment?: LeadEnrichment | null } | null) => {
        if (active) setEnrichment(d?.enrichment ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [lead.uid]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setErrorMsg(null);
    try {
      const r = await fetch(`/api/leads/${encodeURIComponent(lead.uid)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      return true;
    } catch (e) {
      setErrorMsg((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: LeadStatus, extra: Record<string, unknown> = {}) {
    const body: Record<string, unknown> = {
      leadStatus: status,
      setLastContact: true,
      notes,
      ...extra,
    };
    if (status === "no_answer") body.bumpCallCount = true;
    const ok = await patch(body);
    if (ok) onSaved(true); // Status geändert → weiter zum nächsten Lead
  }

  async function saveNotesOnly() {
    const ok = await patch({ notes, nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : null });
    if (ok) onSaved(false); // nur Notiz gespeichert → Fenster schließen, nicht springen
  }

  async function scheduleCall() {
    if (!nextActionAt) {
      setErrorMsg("Bitte Termin-Datum wählen");
      return;
    }
    await setStatus("call_scheduled", { nextActionAt: new Date(nextActionAt).toISOString() });
  }

  async function scheduleFollowUp() {
    // Wiedervorlage: Status setzen, Datum ist optional (sonst "irgendwann später")
    const extra: Record<string, unknown> = {};
    if (nextActionAt) extra.nextActionAt = new Date(nextActionAt).toISOString();
    await setStatus("follow_up", extra);
  }

  const currentMeta = LEAD_STATUS_META[lead.leadStatus ?? "new"];
  const today = getTodayHours(lead.oeffnungszeiten);

  // Tastenkürzel fürs schnelle Abtelefonieren: 1–5 = Anruf-Resultat, Esc = schließen.
  // Greift nicht, während in einem Eingabefeld (Notizen/Termin) getippt wird.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (busy || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "1": e.preventDefault(); setStatus("no_answer"); break;
        case "2": e.preventDefault(); scheduleFollowUp(); break;
        case "3": e.preventDefault(); setStatus("interested"); break;
        case "4": e.preventDefault(); setStatus("won"); break;
        case "5": e.preventDefault(); setStatus("not_interested"); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, notes, nextActionAt]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 p-6">
          <div className="flex-1 min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {queuePosition && queueTotal > 1 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-100 tabular-nums">
                  📋 {queuePosition} / {queueTotal}
                </span>
              )}
              <span className={`inline-flex items-center gap-1.5 rounded-full ${currentMeta.color} px-3 py-1 text-xs font-medium text-white`}>
                {currentMeta.emoji} {currentMeta.label}
              </span>
              {lead.kategorie && <span className="pill text-xs">{lead.kategorie}</span>}
              {lead.lastSetterName && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-700 ring-1 ring-stone-200">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: lead.lastSetterColor ?? "#525252" }}
                  />
                  zuletzt von {lead.lastSetterName}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold tracking-tight">{lead.firmenname}</h2>
            {lead.adresse && <p className="mt-1 text-sm text-stone-500">{lead.adresse}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <CloseIcon />
          </button>
        </div>

        {/* Hauptaktion: Telefon */}
        <div className="space-y-3 border-b border-stone-100 px-6 py-5">
          {today && (
            <div>
              <OpenNowBadge today={today} />
            </div>
          )}
          {lead.telefon ? (
            <a
              href={`tel:${lead.telefon}`}
              className="flex items-center gap-3 rounded-2xl bg-neutral-900 px-5 py-4 text-white transition hover:bg-neutral-800"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600">
                <PhoneIcon />
              </div>
              <div className="flex-1">
                <div className="text-xs uppercase tracking-wide text-stone-400">Anrufen</div>
                <div className="text-lg font-semibold">{lead.telefon}</div>
              </div>
              <span className="text-xs text-stone-400">tap to call</span>
            </a>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-200 px-5 py-4 text-sm text-stone-400">
              📞 Keine Telefonnummer vorhanden
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ContactPill href={lead.email ? `mailto:${lead.email}` : undefined} icon="✉️" label={lead.email || "Keine E-Mail"} disabled={!lead.email} />
            <ContactPill href={lead.webseite || undefined} icon="🌐" label="Webseite" external disabled={!lead.webseite} />
            <ContactPill
              href={`https://www.google.com/search?q=${encodeURIComponent([lead.firmenname, lead.ort].filter(Boolean).join(" "))}`}
              icon="🅖"
              label="Google-Profil"
              external
            />
            <ContactPill href={lead.googleMaps || undefined} icon="🗺" label="Maps" external disabled={!lead.googleMaps} />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 px-6 py-4">
          <InfoPanel label="Anrufe" value={String(lead.callCount ?? 0)} />
          <InfoPanel label="Letzter Kontakt" value={lead.lastContact ? new Date(lead.lastContact).toLocaleDateString("de-DE") : "—"} />
          <InfoPanel label="Wiedervorlage" value={lead.nextActionAt ? new Date(lead.nextActionAt).toLocaleDateString("de-DE") : "—"} />
        </div>

        {/* DataForSEO Business-Profil (on-demand, gecacht) */}
        <BusinessProfileSection lead={lead} initial={enrichment?.profile ?? null} />

        {/* DataForSEO Website-Check (on-demand, gecacht) */}
        <WebsiteCheckSection lead={lead} initial={enrichment?.website ?? null} />

        {/* DataForSEO Ranking & Markt (on-demand, gecacht) */}
        <MarketCheckSection lead={lead} initial={enrichment?.market ?? null} />

        {/* DataForSEO negative Reviews (on-demand, gecacht) */}
        <ReviewsSection lead={lead} initial={enrichment?.reviews ?? null} />

        {/* Status-Aktionen */}
        <div className="border-t border-stone-100 px-6 py-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-stone-500">📞 Anruf-Resultat</span>
            <span className="hidden text-[10px] text-stone-400 sm:inline">Tasten 1–5 · Esc schließt</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <StatusButton color="bg-yellow-500 hover:bg-yellow-600" onClick={() => setStatus("no_answer")} disabled={busy} shortcut="1">
              📵 Nicht erreicht
            </StatusButton>
            <StatusButton color="bg-cyan-600 hover:bg-cyan-700" onClick={scheduleFollowUp} disabled={busy} shortcut="2">
              🔄 Wiedervorlage
            </StatusButton>
            <StatusButton color="bg-orange-500 hover:bg-orange-600" onClick={() => setStatus("interested")} disabled={busy} shortcut="3">
              🔥 Interessiert
            </StatusButton>
            <StatusButton color="bg-emerald-600 hover:bg-emerald-700" onClick={() => setStatus("won")} disabled={busy} shortcut="4">
              🏆 Kunde
            </StatusButton>
            <StatusButton color="bg-stone-700 hover:bg-stone-800" onClick={() => setStatus("not_interested")} disabled={busy} shortcut="5">
              ❌ Kein Interesse
            </StatusButton>
          </div>

          {/* Durchlauf-Hinweis: kündigt das automatische Weiterspringen an */}
          {nextName ? (
            <p className="mt-3 text-[11px] text-stone-500">
              Nach der Auswahl geht es direkt weiter zu{" "}
              <span className="font-medium text-stone-700">{nextName}</span>
              {queuePosition && queueTotal > 0 && (
                <span className="text-stone-400"> · noch {queueTotal - queuePosition} in dieser Spalte</span>
              )}
            </p>
          ) : queuePosition && queueTotal > 1 ? (
            <p className="mt-3 text-[11px] text-stone-500">
              Letzter Lead in dieser Spalte — danach schließt sich das Fenster.
            </p>
          ) : null}

          <div className="mt-5">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">
              📅 Wiedervorlage / Folge-Call planen
            </div>
            <p className="-mt-1 mb-2 text-[11px] text-stone-500">
              Datum optional — wird für <em>Wiedervorlage</em> als Erinnerung gespeichert
              und ist für <em>Call vereinbart</em> Pflicht.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="label-base">Termin</label>
                <input
                  type="datetime-local"
                  value={nextActionAt}
                  onChange={(e) => setNextActionAt(e.target.value)}
                  className="input-base"
                />
              </div>
              <button
                onClick={scheduleFollowUp}
                disabled={busy}
                className="rounded-full bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                🔄 Wiedervorlage
              </button>
              <button onClick={scheduleCall} disabled={busy} className="rounded-full bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50">
                📅 Call vereinbart
              </button>
              <button onClick={() => setStatus("lost")} disabled={busy} className="btn-ghost">🪦 Verloren</button>
              <button onClick={() => setStatus("new")} disabled={busy} className="btn-ghost">↩️ Auf Neu</button>
            </div>
          </div>
        </div>

        {/* Notizen */}
        <div className="border-t border-stone-100 px-6 py-5">
          <label className="label-base">Notizen</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder={'z.B. "Inhaberin Frau Müller. Hat zwei eigene Studios. Will Demo am 12.05. um 14 Uhr."'}
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm placeholder:text-stone-400 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
          />
          <div className="mt-3 flex justify-end">
            <button onClick={saveNotesOnly} disabled={busy} className="btn-dark">💾 Notizen + Wiedervorlage speichern</button>
          </div>
        </div>

        {errorMsg && <div className="border-t border-rose-200 bg-rose-50 px-6 py-3 text-sm text-rose-700">❌ {errorMsg}</div>}
      </div>
    </div>
  );
}

function ContactPill({ href, icon, label, external, disabled }: { href?: string; icon: string; label: string; external?: boolean; disabled?: boolean }) {
  const cls = `flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
    disabled ? "border-stone-200 bg-stone-50 text-stone-400" : "border-stone-200 bg-white text-stone-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
  }`;
  if (disabled || !href) return <div className={cls}>{icon} <span className="truncate">{label}</span></div>;
  return (
    <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className={cls}>
      {icon} <span className="truncate">{label}</span>
    </a>
  );
}

function InfoPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function StatusButton({ color, onClick, children, disabled, shortcut }: { color: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; shortcut?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`relative rounded-full ${color} px-3 py-2.5 text-sm font-medium text-white transition disabled:opacity-50`}>
      {shortcut && (
        <kbd className="absolute left-1.5 top-1.5 hidden h-4 w-4 items-center justify-center rounded bg-white/25 text-[10px] font-bold tabular-nums sm:flex">
          {shortcut}
        </kbd>
      )}
      {children}
    </button>
  );
}

// ============================================================================
// Business-Profil (DataForSEO) – on-demand im Modal nachgeladen
// ============================================================================

/** Google-CID aus einem Maps-Link (…?cid=123…) ziehen, sonst undefined. */
function extractCid(mapsUrl: string | undefined): string | undefined {
  if (!mapsUrl) return undefined;
  return mapsUrl.match(/[?&]cid=(\d+)/)?.[1];
}

/** Reine Domain aus einer URL (ohne www), sonst undefined. */
function domainOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Reichert einen Lead an (Profil + Website-OnPage), serverseitig gecacht.
 * Fehler pro Lead werden geschluckt, damit ein Batch nicht abbricht.
 */
async function enrichOne(lead: DbLead): Promise<void> {
  const cid = extractCid(lead.googleMaps);
  const placeId = lead.uid.startsWith("google:") ? lead.uid.slice("google:".length) : undefined;
  try {
    await fetch("/api/business-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: lead.uid,
        cid,
        placeId,
        name: lead.firmenname,
        address: lead.adresse,
        ort: lead.ort,
      }),
    });
  } catch {
    /* ignorieren – Batch läuft weiter */
  }
  if (lead.webseite) {
    try {
      await fetch("/api/website-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: lead.uid, url: lead.webseite, lighthouse: false }),
      });
    } catch {
      /* ignorieren */
    }
  }
}

function BusinessProfileSection({
  lead,
  initial,
}: {
  lead: DbLead;
  initial: BusinessProfile | null;
}) {
  const [profile, setProfile] = useState<BusinessProfile | null>(initial);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(initial));
  const [error, setError] = useState<string | null>(null);

  // Cache kommt asynchron nach dem ersten Render rein → übernehmen.
  useEffect(() => {
    if (initial) {
      setProfile(initial);
      setLoaded(true);
    }
  }, [initial]);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const cid = extractCid(lead.googleMaps);
      const placeId = lead.uid.startsWith("google:")
        ? lead.uid.slice("google:".length)
        : undefined;
      const r = await fetch("/api/business-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: lead.uid,
          cid,
          placeId,
          name: lead.firmenname,
          address: lead.adresse,
          ort: lead.ort,
          force,
        }),
      });
      const d = (await r.json()) as { profile?: BusinessProfile | null; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setProfile(d.profile ?? null);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-stone-100 px-6 py-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
          🔎 Business-Profil
        </span>
        {!loaded ? (
          <button
            onClick={() => load(false)}
            disabled={loading}
            className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? "⏳ Lädt…" : "Profil laden"}
          </button>
        ) : (
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="text-[11px] font-medium text-stone-400 transition hover:text-stone-600 disabled:opacity-50"
          >
            {loading ? "⏳…" : "↻ Aktualisieren"}
          </button>
        )}
      </div>

      {!loaded && !loading && !error && (
        <p className="text-[11px] text-stone-400">
          Lädt zusätzliche Details über DataForSEO (Beschreibung, ob das Profil beansprucht ist,
          Ausstattung, Foto-Anzahl, Review-Themen). Verbraucht ~0,2 ct, danach gecacht.
        </p>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          ❌ {error}
        </div>
      )}
      {loaded && !profile && !error && (
        <p className="text-sm text-stone-500">Kein Profil bei DataForSEO gefunden.</p>
      )}
      {profile && <ProfileBody profile={profile} />}
    </div>
  );
}

function ProfileBody({ profile }: { profile: BusinessProfile }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {profile.isClaimed !== null &&
          (profile.isClaimed ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
              ✅ Profil beansprucht
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"
              title="Inhaber hat das Google-Profil nicht beansprucht – guter Outreach-Aufhänger"
            >
              ⚠️ Profil nicht beansprucht
            </span>
          ))}
        {profile.priceLevel && (
          <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
            {profile.priceLevel}
          </span>
        )}
        {profile.totalPhotos != null && (
          <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 tabular-nums">
            📷 {profile.totalPhotos} Fotos
          </span>
        )}
        {profile.ratingValue != null && (
          <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 tabular-nums">
            ⭐ {profile.ratingValue}
            {profile.ratingVotes != null && ` · ${profile.ratingVotes}`}
          </span>
        )}
      </div>

      {profile.description && <p className="text-stone-600">{profile.description}</p>}

      {(profile.category || profile.additionalCategories.length > 0) && (
        <ChipRow
          label="Kategorien"
          items={[profile.category, ...profile.additionalCategories].filter(Boolean)}
        />
      )}
      {profile.attributes.length > 0 && (
        <ChipRow label="Ausstattung" items={profile.attributes.slice(0, 16)} />
      )}
      {profile.placeTopics.length > 0 && (
        <ChipRow
          label="Bewertungs-Themen"
          items={profile.placeTopics.map((t) => `${t.topic}${t.count ? ` (${t.count})` : ""}`)}
        />
      )}

      {(profile.bookOnlineUrl || profile.contactUrl) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {profile.bookOnlineUrl && (
            <a
              href={profile.bookOnlineUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
            >
              📅 Online buchen
            </a>
          )}
          {profile.contactUrl && (
            <a
              href={profile.contactUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
            >
              🔗 Kontaktseite
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-stone-400">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={`${it}-${i}`}
            className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600"
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Website-Check (DataForSEO OnPage + Lighthouse) – on-demand im Modal
// ============================================================================

function WebsiteCheckSection({
  lead,
  initial,
}: {
  lead: DbLead;
  initial: WebsiteCheck | null;
}) {
  const [check, setCheck] = useState<WebsiteCheck | null>(initial);
  const [loading, setLoading] = useState<null | "onpage" | "lighthouse">(null);
  const [error, setError] = useState<string | null>(null);

  const hasWebsite = Boolean(lead.webseite);

  useEffect(() => {
    if (initial) setCheck(initial);
  }, [initial]);

  async function run(opts: { lighthouse?: boolean; force?: boolean } = {}) {
    setLoading(opts.lighthouse ? "lighthouse" : "onpage");
    setError(null);
    try {
      const r = await fetch("/api/website-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: lead.uid,
          url: lead.webseite,
          lighthouse: opts.lighthouse ?? false,
          force: opts.force ?? false,
        }),
      });
      const d = (await r.json()) as { check?: WebsiteCheck; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setCheck(d.check ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  const hasLighthouse = check && (check.lhPerformance != null || check.lighthouseError != null);

  return (
    <div className="border-t border-stone-100 px-6 py-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
          🌐 Website-Check
        </span>
        {hasWebsite && (
          <div className="flex items-center gap-3">
            {check && !hasLighthouse && (
              <button
                onClick={() => run({ lighthouse: true, force: true })}
                disabled={loading != null}
                className="rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
              >
                {loading === "lighthouse" ? "⏳ Lighthouse…" : "🔦 Lighthouse laden"}
              </button>
            )}
            {!check ? (
              <button
                onClick={() => run()}
                disabled={loading != null}
                className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
              >
                {loading === "onpage" ? "⏳ Analysiere…" : "Website prüfen"}
              </button>
            ) : (
              <button
                onClick={() => run({ lighthouse: hasLighthouse ? true : false, force: true })}
                disabled={loading != null}
                className="text-[11px] font-medium text-stone-400 transition hover:text-stone-600 disabled:opacity-50"
              >
                {loading === "onpage" ? "⏳…" : "↻ Aktualisieren"}
              </button>
            )}
          </div>
        )}
      </div>

      {!hasWebsite ? (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800 ring-1 ring-amber-100">
          ⚠️ Keine Website hinterlegt — idealer Lead für einen Webauftritt.
        </div>
      ) : !check && loading == null && !error ? (
        <p className="text-[11px] text-stone-400">
          Prüft die Website per DataForSEO (OnPage-Mängel, ~0,1 ct). Lighthouse-Scores optional
          danach nachladen. Ergebnis wird gecacht.
        </p>
      ) : null}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          ❌ {error}
        </div>
      )}
      {check && <WebsiteCheckBody check={check} />}
    </div>
  );
}

function WebsiteCheckBody({ check }: { check: WebsiteCheck }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {check.onpageScore != null && (
          <ScorePill label="OnPage" value={check.onpageScore} />
        )}
        {check.lhPerformance != null && <ScorePill label="Performance" value={check.lhPerformance} />}
        {check.lhSeo != null && <ScorePill label="SEO" value={check.lhSeo} />}
        {check.lhBestPractices != null && (
          <ScorePill label="Best Practices" value={check.lhBestPractices} />
        )}
        {check.lhAccessibility != null && (
          <ScorePill label="Barrierefrei" value={check.lhAccessibility} />
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-stone-500">
        <span className={check.isHttps ? "text-emerald-600" : "text-rose-600"}>
          {check.isHttps ? "🔒 HTTPS" : "⚠️ Kein HTTPS"}
        </span>
        {check.loadTimeMs != null && <span>· ⏱ {(check.loadTimeMs / 1000).toFixed(1)}s Ladezeit</span>}
        {check.wordCount != null && <span>· 📝 {check.wordCount} Wörter</span>}
      </div>

      {check.issues.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-stone-400">
            SEO-Mängel
          </div>
          <div className="flex flex-wrap gap-1.5">
            {check.issues.map((it) => (
              <span
                key={it}
                className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700"
              >
                {it}
              </span>
            ))}
          </div>
        </div>
      )}
      {check.onpageScore != null && check.issues.length === 0 && (
        <p className="text-[11px] text-emerald-600">✅ Keine groben OnPage-Mängel gefunden.</p>
      )}

      {check.onpageError && (
        <p className="text-[11px] text-stone-400">OnPage nicht verfügbar: {check.onpageError}</p>
      )}
      {check.lighthouseError && (
        <p className="text-[11px] text-stone-400">
          Lighthouse nicht verfügbar: {check.lighthouseError}
        </p>
      )}
    </div>
  );
}

/** Score-Pill mit Ampelfarbe (rot &lt;50, gelb &lt;90, grün ≥90 – Lighthouse-Konvention). */
function ScorePill({ label, value }: { label: string; value: number }) {
  const tone =
    value >= 90
      ? "bg-emerald-100 text-emerald-800"
      : value >= 50
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      <span className="tabular-nums">{value}</span>
      <span className="font-medium opacity-80">{label}</span>
    </span>
  );
}

// ============================================================================
// Ranking & Markt (DataForSEO SERP + Suchvolumen) – on-demand im Modal
// ============================================================================

function MarketCheckSection({ lead, initial }: { lead: DbLead; initial: MarketCheck | null }) {
  const [market, setMarket] = useState<MarketCheck | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setMarket(initial);
  }, [initial]);

  async function run(force = false) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/market-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: lead.uid,
          service: lead.dienstleistung,
          city: lead.ort,
          websiteDomain: domainOf(lead.webseite),
          force,
        }),
      });
      const d = (await r.json()) as { market?: MarketCheck | null; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setMarket(d.market ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-stone-100 px-6 py-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
          📊 Ranking &amp; Markt
        </span>
        {!market ? (
          <button
            onClick={() => run(false)}
            disabled={loading}
            className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? "⏳ Prüfe…" : "Markt prüfen"}
          </button>
        ) : (
          <button
            onClick={() => run(true)}
            disabled={loading}
            className="text-[11px] font-medium text-stone-400 transition hover:text-stone-600 disabled:opacity-50"
          >
            {loading ? "⏳…" : "↻ Aktualisieren"}
          </button>
        )}
      </div>

      {!market && !loading && !error && (
        <p className="text-[11px] text-stone-400">
          Google-Ranking für „{lead.dienstleistung} {lead.ort}" + monatliches Suchvolumen. Verbraucht
          ~5 ct (Suchvolumen), danach gecacht.
        </p>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          ❌ {error}
        </div>
      )}
      {market && <MarketBody market={market} hasWebsite={Boolean(lead.webseite)} />}
    </div>
  );
}

function MarketBody({ market, hasWebsite }: { market: MarketCheck; hasWebsite: boolean }) {
  const rankTone =
    market.rank == null
      ? "bg-rose-100 text-rose-800"
      : market.rank <= 3
        ? "bg-emerald-100 text-emerald-800"
        : market.rank <= 10
          ? "bg-amber-100 text-amber-800"
          : "bg-rose-100 text-rose-800";
  const compDe =
    market.competition === "HIGH"
      ? "hoch"
      : market.competition === "MEDIUM"
        ? "mittel"
        : market.competition === "LOW"
          ? "niedrig"
          : "";
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${rankTone}`}>
          📍{" "}
          {market.rank != null
            ? `Platz ${market.rank}`
            : hasWebsite
              ? `Nicht in Top ${market.rankDepth}`
              : "Kein organisches Ranking"}
        </span>
        {market.searchVolume != null && (
          <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 tabular-nums">
            🔎 {market.searchVolume.toLocaleString("de-DE")} Suchen/Monat
          </span>
        )}
        {compDe && (
          <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
            Wettbewerb {compDe}
          </span>
        )}
        {market.cpc != null && market.cpc > 0 && (
          <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 tabular-nums">
            CPC {market.cpc.toFixed(2)} €
          </span>
        )}
      </div>
      <p className="text-[11px] text-stone-400">Keyword: „{market.keyword}"</p>

      {market.topCompetitors.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-stone-400">
            Stehen über diesem Lead
          </div>
          <ol className="space-y-1">
            {market.topCompetitors.map((c) => (
              <li key={c.domain} className="flex items-center gap-2 text-[12px] text-stone-600">
                <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-stone-400">
                  {c.rank}.
                </span>
                <span className="truncate">{c.domain}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Negative Reviews (DataForSEO, task-basiert mit Polling) – on-demand im Modal
// ============================================================================

interface ReviewsResponse {
  ready: boolean;
  reviews?: ReviewItem[];
  taskId?: string;
  error?: string;
}

function ReviewsSection({ lead, initial }: { lead: DbLead; initial: ReviewItem[] | null }) {
  const [reviews, setReviews] = useState<ReviewItem[] | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  useEffect(() => {
    if (initial) setReviews(initial);
  }, [initial]);

  async function postReviews(payload: Record<string, unknown>): Promise<ReviewsResponse> {
    const r = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: lead.uid, ...payload }),
    });
    const d = (await r.json()) as ReviewsResponse;
    if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
    return d;
  }

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const cid = extractCid(lead.googleMaps);
      const placeId = lead.uid.startsWith("google:") ? lead.uid.slice("google:".length) : undefined;
      let res = await postReviews({ cid, placeId, name: lead.firmenname, force });
      if (res.ready) {
        if (mounted.current) setReviews(res.reviews ?? []);
        return;
      }
      // Polling: alle 6s, bis zu ~2 Min.
      for (let i = 0; i < 20 && res.taskId && mounted.current; i++) {
        await wait(6000);
        if (!mounted.current) return;
        res = await postReviews({ taskId: res.taskId });
        if (res.ready) {
          if (mounted.current) setReviews(res.reviews ?? []);
          return;
        }
      }
      throw new Error("Reviews noch nicht bereit – bitte später erneut versuchen.");
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  return (
    <div className="border-t border-stone-100 px-6 py-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
          💬 Negative Bewertungen
        </span>
        {!reviews ? (
          <button
            onClick={() => load(false)}
            disabled={loading}
            className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading ? "⏳ Lädt… (dauert)" : "Reviews laden"}
          </button>
        ) : (
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="text-[11px] font-medium text-stone-400 transition hover:text-stone-600 disabled:opacity-50"
          >
            {loading ? "⏳…" : "↻ Aktualisieren"}
          </button>
        )}
      </div>

      {!reviews && !loading && !error && (
        <p className="text-[11px] text-stone-400">
          Holt die schlechtesten Bewertungstexte als Gesprächsaufhänger. Läuft asynchron – kann ein
          paar Sekunden bis zu 1–2 Min dauern. Danach gecacht.
        </p>
      )}
      {loading && (
        <p className="text-[11px] text-stone-400">⏳ Reviews werden bei DataForSEO geholt…</p>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          ❌ {error}
        </div>
      )}
      {reviews && reviews.length === 0 && !loading && (
        <p className="text-sm text-stone-500">Keine Bewertungen gefunden.</p>
      )}
      {reviews && reviews.length > 0 && (
        <ul className="space-y-2.5">
          {reviews.slice(0, 6).map((rv, i) => (
            <ReviewRow key={i} review={rv} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewRow({ review }: { review: ReviewItem }) {
  const low = review.rating != null && review.rating <= 2;
  return (
    <li className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
            low ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          ⭐ {review.rating ?? "?"}
        </span>
        {review.author && <span className="text-[11px] text-stone-500">{review.author}</span>}
        {review.timeAgo && <span className="text-[11px] text-stone-400">· {review.timeAgo}</span>}
      </div>
      {review.text && <p className="text-[13px] leading-snug text-stone-700">{review.text}</p>}
    </li>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
