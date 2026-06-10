"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { use } from "react";
import {
  LEAD_STATUS_META,
  LEAD_STATUS_ORDER,
  type DbLead,
  type LeadStatus,
  type List,
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
      new: [], no_answer: [], interested: [], call_scheduled: [],
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

  if (error)
    return (
      <div className="mx-auto max-w-7xl p-6 lg:p-10">
        <div className="card border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">❌ {error}</div>
      </div>
    );

  if (!data) return <div className="p-6"><p className="text-stone-500">Lade...</p></div>;

  return (
    <div className="mx-auto max-w-[1900px] p-4 lg:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/lists" className="rounded-full bg-white border border-stone-200 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50">
            ← Listen
          </Link>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{data.list.name}</h1>
          <span className="pill bg-stone-50">{data.leads.length} Leads</span>
        </div>
        <Link href="/" className="btn-ghost h-9">+ Mehr Leads suchen</Link>
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

      {/* Status-Filter-Leiste: aktive Status sind sichtbar, ausgegraute kollabieren */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-stone-500">Anzeigen:</span>
        {LEAD_STATUS_ORDER.map((s) => {
          const meta = LEAD_STATUS_META[s];
          const count = grouped[s].length;
          const isHidden = hidden.has(s);
          return (
            <button
              key={s}
              onClick={() => toggleHidden(s)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition ${
                isHidden
                  ? "border-stone-200 bg-white text-stone-400 hover:text-stone-700"
                  : "border-transparent text-white shadow-sm " + meta.color
              }`}
              title={isHidden ? `${meta.label} einblenden` : `${meta.label} ausblenden`}
            >
              <span>{meta.emoji}</span>
              <span>{meta.label}</span>
              <span
                className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                  isHidden ? "bg-stone-100" : "bg-white/25"
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
        <div className="flex gap-3 min-w-fit">
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
                  className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50/60 py-3 text-xs text-stone-500 transition hover:bg-stone-100"
                  title="Einblenden"
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full ${meta.color} text-white text-xs`}>
                    {meta.emoji}
                  </span>
                  <span className="rounded-full bg-stone-100 px-1.5 py-0.5 tabular-nums">
                    {leads.length}
                  </span>
                  <span
                    className="mt-1 whitespace-nowrap text-stone-400"
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
                className={`flex w-72 shrink-0 flex-col rounded-2xl border border-stone-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:w-80 ${
                  isEmpty ? "bg-stone-50/40" : "bg-white"
                }`}
              >
                <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${meta.color} text-white text-xs`}>
                      {meta.emoji}
                    </span>
                    <span className="truncate">{meta.label}</span>
                  </div>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                    {leads.length}
                  </span>
                </div>
                <div className="flex max-h-[72vh] flex-col gap-2 overflow-y-auto p-2">
                  {isEmpty && (
                    <p className="px-2 py-6 text-center text-xs text-stone-400">noch leer</p>
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

      {openLead && (
        <LeadModal
          lead={openLead}
          onClose={() => setOpenLead(null)}
          onSaved={() => {
            setOpenLead(null);
            reload();
          }}
        />
      )}
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
  const noWebsite = !lead.webseite;
  const today = parseTodayHours(lead.oeffnungszeiten);
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
      className="cursor-pointer rounded-xl border border-stone-200 bg-white p-3 text-left text-sm transition hover:border-rose-200 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
    >
      {/* Name – darf 2 Zeilen brauchen, danach Ellipsis. G-Button rechts daneben. */}
      <div className="flex items-start justify-between gap-2">
        <div className="line-clamp-2 flex-1 font-semibold leading-snug text-stone-900">
          {lead.firmenname}
        </div>
        <GoogleProfileButton name={lead.firmenname} ort={lead.ort} size="sm" />
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

      {/* Inline-Chips: Öffnungszeiten heute + "keine Website" */}
      {(today || noWebsite) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {today && (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                today.closed ? "bg-stone-100 text-stone-500" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              🕒 {today.label}
            </span>
          )}
          {noWebsite && (
            <span
              title="Kein Webauftritt"
              className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
            >
              🌐✗ keine Website
            </span>
          )}
        </div>
      )}

      {lead.adresse && (
        <div className="mt-2 line-clamp-1 text-[11px] text-stone-500">{lead.adresse}</div>
      )}

      {/* Footer: Anruf-Status + Datum + Setter-Badge in einer Zeile */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-stone-100 pt-2 text-[10px] text-stone-400">
        <span className="truncate">
          {lead.callCount > 0 ? `${lead.callCount}× angerufen` : "noch nicht versucht"}
        </span>
        <span className="shrink-0">
          {lead.lastContact && new Date(lead.lastContact).toLocaleDateString("de-DE")}
        </span>
      </div>
      {lead.lastSetterName && (
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-stone-50 px-2 py-0.5 text-[10px] font-medium text-stone-600">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: lead.lastSetterColor ?? "#525252" }}
          />
          von {lead.lastSetterName}
        </div>
      )}
    </div>
  );
}

const DAY_NAMES_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function parseTodayHours(raw: string | null | undefined): { label: string; closed: boolean } | null {
  if (!raw) return null;
  const todayName = DAY_NAMES_DE[new Date().getDay()];
  const parts = raw.split("|").map((p) => p.trim());
  const todayPart = parts.find((p) => p.toLowerCase().startsWith(todayName.toLowerCase() + ":"));
  if (!todayPart) return null;
  const value = todayPart.slice(todayPart.indexOf(":") + 1).trim().replace(/\s*Uhr\s*$/i, "");
  if (!value) return null;
  const closed = /geschlossen/i.test(value);
  return { label: closed ? "geschlossen" : value, closed };
}

// ============================================================================
// Lead-Modal
// ============================================================================

function LeadModal({
  lead,
  onClose,
  onSaved,
}: {
  lead: DbLead;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [nextActionAt, setNextActionAt] = useState(
    lead.nextActionAt ? toDatetimeLocal(lead.nextActionAt) : "",
  );
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    if (ok) onSaved();
  }

  async function saveNotesOnly() {
    const ok = await patch({ notes, nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : null });
    if (ok) onSaved();
  }

  async function scheduleCall() {
    if (!nextActionAt) {
      setErrorMsg("Bitte Wiedervorlage-Datum wählen");
      return;
    }
    await setStatus("call_scheduled", { nextActionAt: new Date(nextActionAt).toISOString() });
  }

  const currentMeta = LEAD_STATUS_META[lead.leadStatus ?? "new"];

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

        {/* Status-Aktionen */}
        <div className="border-t border-stone-100 px-6 py-5">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">📞 Anruf-Resultat</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatusButton color="bg-yellow-500 hover:bg-yellow-600" onClick={() => setStatus("no_answer")} disabled={busy}>
              📵 Nicht erreicht
            </StatusButton>
            <StatusButton color="bg-orange-500 hover:bg-orange-600" onClick={() => setStatus("interested")} disabled={busy}>
              🔥 Interessiert
            </StatusButton>
            <StatusButton color="bg-emerald-600 hover:bg-emerald-700" onClick={() => setStatus("won")} disabled={busy}>
              🏆 Kunde
            </StatusButton>
            <StatusButton color="bg-stone-700 hover:bg-stone-800" onClick={() => setStatus("not_interested")} disabled={busy}>
              ❌ Kein Interesse
            </StatusButton>
          </div>

          <div className="mt-5">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">📅 Folge-Call vereinbaren</div>
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

function StatusButton({ color, onClick, children, disabled }: { color: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-full ${color} px-3 py-2.5 text-sm font-medium text-white transition disabled:opacity-50`}>
      {children}
    </button>
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
