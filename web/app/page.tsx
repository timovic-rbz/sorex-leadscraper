"use client";

import { useEffect, useState } from "react";
import type { Lead, List, SearchResponse, Source } from "@/lib/types";

type TabId = "single" | "bulk";
type LeadWithStatus = Lead & { dbStatus: "neu" | "bekannt" };

// ---------- helpers ----------
async function checkExisting(uids: string[]): Promise<Set<string>> {
  if (uids.length === 0) return new Set();
  const r = await fetch("/api/leads?action=check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uids }),
  });
  if (!r.ok) return new Set();
  const data = (await r.json()) as { existing: string[] };
  return new Set(data.existing);
}

async function annotate(leads: Lead[]): Promise<LeadWithStatus[]> {
  const existing = await checkExisting(leads.map((l) => l.uid));
  return leads.map((l) => ({ ...l, dbStatus: existing.has(l.uid) ? "bekannt" : "neu" }));
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [headers.join(";"), ...rows.map((r) => headers.map((h) => escape(r[h])).join(";"))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- main page ----------
export default function Page() {
  const [source, setSource] = useState<Source>("osm");
  const [scrapeEmails, setScrapeEmails] = useState(true);
  const [tab, setTab] = useState<TabId>("single");

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Leads suchen</h1>
          <p className="mt-2 text-sm text-stone-500">Daten ziehen, in eine Liste speichern, dann unter <a href="/lists" className="text-rose-600 hover:underline">Listen</a> abarbeiten.</p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <span className="pill">{source === "osm" ? "🌍 OSM" : "🔵 Google"}</span>
          <span className="pill">{scrapeEmails ? "📧 E-Mail an" : "📧 E-Mail aus"}</span>
        </div>
      </header>

      <section className="card mb-6 flex flex-wrap items-center gap-4 px-5 py-4">
        <span className="text-sm font-medium text-stone-600">Quelle</span>
        <div className="flex gap-1 rounded-full bg-stone-100 p-1">
          <Toggle active={source === "osm"} onClick={() => setSource("osm")}>🌍 OpenStreetMap</Toggle>
          <Toggle active={source === "google"} onClick={() => setSource("google")}>🔵 Google Places</Toggle>
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={scrapeEmails} onChange={(e) => setScrapeEmails(e.target.checked)} className="h-4 w-4 accent-rose-600" />
          <span>E-Mails von Webseiten crawlen</span>
        </label>
      </section>

      <nav className="mb-4 flex gap-2">
        <TabPill active={tab === "single"} onClick={() => setTab("single")}>🔍 Einzelsuche</TabPill>
        <TabPill active={tab === "bulk"} onClick={() => setTab("bulk")}>📦 Bulk-Suche</TabPill>
      </nav>

      {tab === "single" && <SingleTab source={source} scrapeEmails={scrapeEmails} />}
      {tab === "bulk" && <BulkTab source={source} scrapeEmails={scrapeEmails} />}
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-white text-neutral-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
      }`}
    >
      {children}
    </button>
  );
}

function TabPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-5 py-2 text-sm font-medium transition ${
        active ? "bg-neutral-900 text-white" : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
      }`}
    >
      {children}
    </button>
  );
}

// ---------- Single ----------
function SingleTab({ source, scrapeEmails }: { source: Source; scrapeEmails: boolean }) {
  const [ort, setOrt] = useState("");
  const [dl, setDl] = useState("");
  const [maxResults, setMaxResults] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ stats: SearchResponse; leads: LeadWithStatus[] } | null>(null);

  async function run() {
    if (!ort || !dl) {
      setError("Bitte Ort und Dienstleistung angeben.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ort, dienstleistung: dl, source, maxResults, scrapeEmails }),
      });
      const data = (await r.json()) as SearchResponse | { error: string };
      if (!r.ok || "error" in data) throw new Error("error" in data ? data.error : `HTTP ${r.status}`);
      const leads = await annotate(data.leads);
      leads.sort((a, b) => {
        if (a.dbStatus !== b.dbStatus) return a.dbStatus === "neu" ? -1 : 1;
        return b.anzahlReviews - a.anzahlReviews;
      });
      setResult({ stats: data, leads });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_2fr_1fr_auto]">
          <Field label="Ort" value={ort} onChange={setOrt} placeholder="z.B. Düsseldorf" />
          <Field label="Dienstleistung" value={dl} onChange={setDl} placeholder="z.B. Kosmetik" />
          <NumberField label="Max. Leads" value={maxResults} onChange={setMaxResults} min={5} max={60} step={5} />
          <div className="flex items-end">
            <button onClick={run} disabled={loading} className="btn-primary w-full md:w-auto">
              {loading ? "⏳ Suche..." : "🚀 Leads suchen"}
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {result && (
        <ResultsPanel
          leads={result.leads}
          stats={result.stats}
          filenameBase={`leads_${ort}_${dl}`.toLowerCase().replace(/\s+/g, "_")}
          defaultListName={`${ort} ${dl}`.trim()}
        />
      )}
    </div>
  );
}

// ---------- Bulk ----------
function BulkTab({ source, scrapeEmails }: { source: Source; scrapeEmails: boolean }) {
  const [orteText, setOrteText] = useState("");
  const [dlText, setDlText] = useState("");
  const [maxResults, setMaxResults] = useState(20);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<LeadWithStatus[] | null>(null);

  const orte = orteText.split("\n").map((s) => s.trim()).filter(Boolean);
  const dls = dlText.split("\n").map((s) => s.trim()).filter(Boolean);
  const combos = orte.flatMap((o) => dls.map((d) => ({ ort: o, dl: d })));

  async function run() {
    setRunning(true);
    setErrors([]);
    setResult(null);
    setProgress({ done: 0, total: combos.length, current: "" });

    const all: Lead[] = [];
    const errs: string[] = [];

    for (let i = 0; i < combos.length; i++) {
      const { ort, dl } = combos[i];
      setProgress({ done: i, total: combos.length, current: `${dl} in ${ort}` });
      try {
        const r = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ort, dienstleistung: dl, source, maxResults, scrapeEmails }),
        });
        const data = (await r.json()) as SearchResponse | { error: string };
        if (!r.ok || "error" in data) throw new Error("error" in data ? data.error : `HTTP ${r.status}`);
        all.push(...data.leads);
      } catch (e) {
        errs.push(`${dl} in ${ort}: ${(e as Error).message}`);
      }
    }

    const map = new Map<string, Lead>();
    for (const l of all) map.set(l.uid, l);
    const unique = [...map.values()];

    const annotated = await annotate(unique);
    annotated.sort((a, b) => {
      if (a.dbStatus !== b.dbStatus) return a.dbStatus === "neu" ? -1 : 1;
      return b.anzahlReviews - a.anzahlReviews;
    });

    setResult(annotated);
    setErrors(errs);
    setProgress({ done: combos.length, total: combos.length, current: "" });
    setRunning(false);
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <p className="mb-4 text-sm text-stone-500">Sucht alle Kombinationen von Orten × Dienstleistungen.</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_2fr_1fr]">
          <TextField label={`Orte – ${orte.length}`} value={orteText} onChange={setOrteText} placeholder={"Düsseldorf\nKöln\nLangenfeld"} rows={6} />
          <TextField label={`Dienstleistungen – ${dls.length}`} value={dlText} onChange={setDlText} placeholder={"Kosmetik\nFriseur"} rows={6} />
          <NumberField label="Max pro Suche" value={maxResults} onChange={setMaxResults} min={5} max={60} step={5} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button disabled={running || combos.length === 0} onClick={run} className="btn-primary">
            {running ? `⏳ ${progress.done}/${progress.total} – ${progress.current}` : `🚀 Bulk-Suche (${combos.length})`}
          </button>
          {progress.total > 0 && running && (
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-rose-600 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-medium text-amber-700">⚠️ {errors.length} Fehler</summary>
          <pre className="mt-3 whitespace-pre-wrap text-xs text-stone-600">{errors.join("\n")}</pre>
        </details>
      )}

      {result && (
        <ResultsPanel
          leads={result}
          stats={{
            leads: result,
            totalFound: result.length,
            withPhone: result.filter((l) => l.telefon).length,
            withWebsite: result.filter((l) => l.webseite).length,
            withEmail: result.filter((l) => l.email).length,
          }}
          filenameBase="leads_bulk"
          defaultListName="Bulk-Suche"
        />
      )}
    </div>
  );
}

// ---------- Shared ----------
function ResultsPanel({
  leads,
  stats,
  filenameBase,
  defaultListName,
}: {
  leads: LeadWithStatus[];
  stats: SearchResponse;
  filenameBase: string;
  defaultListName: string;
}) {
  const [onlyNew, setOnlyNew] = useState(false);

  const nNew = leads.filter((l) => l.dbStatus === "neu").length;
  const nKnown = leads.filter((l) => l.dbStatus === "bekannt").length;
  const view = onlyNew ? leads.filter((l) => l.dbStatus === "neu") : leads;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Leads" value={leads.length} dark />
        <Stat label="🆕 neu" value={nNew} accent />
        <Stat label="🔁 bekannt" value={nKnown} />
        <Stat label="📞 mit Telefon" value={stats.withPhone} />
        <Stat label="✉️ mit E-Mail" value={stats.withEmail} />
      </div>

      <SaveBar leads={leads} defaultListName={defaultListName} />

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="h-4 w-4 accent-rose-600" />
            Nur neue zeigen ({nNew})
          </label>
          <button
            onClick={() => downloadCsv(`${filenameBase}.csv`, view as unknown as Record<string, unknown>[])}
            className="btn-ghost h-9 px-4"
          >
            ⬇️ CSV
          </button>
        </div>
        <LeadsTable leads={view} />
      </div>
    </div>
  );
}

function SaveBar({ leads, defaultListName }: { leads: LeadWithStatus[]; defaultListName: string }) {
  const [lists, setLists] = useState<List[]>([]);
  const [selected, setSelected] = useState<string>("__new__");
  const [newName, setNewName] = useState(defaultListName);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/lists")
      .then((r) => (r.ok ? r.json() : { lists: [] }))
      .then((data: { lists?: List[] }) => {
        const ls = data.lists ?? [];
        setLists(ls);
        if (ls.length > 0) setSelected(String(ls[0].id));
      })
      .catch(() => setLists([]));
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      let listId: number;
      if (selected === "__new__") {
        if (!newName.trim()) {
          setMsg("Name für neue Liste fehlt");
          setSaving(false);
          return;
        }
        const r = await fetch("/api/lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim() }),
        });
        const data = (await r.json()) as { list?: List; error?: string };
        if (!r.ok || !data.list) throw new Error(data.error ?? `HTTP ${r.status}`);
        listId = data.list.id;
      } else {
        listId = Number(selected);
      }

      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads, listId }),
      });
      const data = (await r.json()) as { inserted?: number; updated?: number; error?: string };
      if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);
      setMsg(`✅ ${data.inserted} neu, ${data.updated} aktualisiert.`);
      if (selected === "__new__") {
        const lr = await fetch("/api/lists");
        const ldata = (await lr.json()) as { lists?: List[] };
        setLists(ldata.lists ?? []);
        setSelected(String(listId));
      }
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card flex flex-wrap items-end gap-4 p-5">
      <div className="flex-1 min-w-[200px]">
        <label className="label-base">In Liste speichern</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="input-base">
          {lists.map((l) => (
            <option key={l.id} value={String(l.id)}>{l.name}</option>
          ))}
          <option value="__new__">+ Neue Liste anlegen…</option>
        </select>
      </div>
      {selected === "__new__" && (
        <div className="flex-1 min-w-[200px]">
          <Field label="Name der neuen Liste" value={newName} onChange={setNewName} placeholder="z.B. Düsseldorf Kosmetik" />
        </div>
      )}
      <button disabled={saving} onClick={save} className="btn-dark">
        {saving ? "⏳ Speichere..." : "💾 Speichern"}
      </button>
      {msg && (
        <span className="text-sm">
          {msg}
          {msg.startsWith("✅") && <a href="/lists" className="ml-2 text-rose-600 hover:underline">→ Zur Liste</a>}
        </span>
      )}
    </div>
  );
}

function LeadsTable({ leads }: { leads: LeadWithStatus[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-5 py-3">DB</th>
            <th className="px-5 py-3">Firma</th>
            <th className="px-5 py-3">Telefon</th>
            <th className="px-5 py-3">E-Mail</th>
            <th className="px-5 py-3">Webseite</th>
            <th className="px-5 py-3">Adresse</th>
            <th className="px-5 py-3">Bewertung</th>
            <th className="px-5 py-3">Kategorie</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.uid} className="border-t border-stone-100 hover:bg-stone-50/50">
              <td className="px-5 py-3">{l.dbStatus === "neu" ? "🆕" : "🔁"}</td>
              <td className="px-5 py-3 font-medium">{l.firmenname}</td>
              <td className="px-5 py-3">{l.telefon && <a className="text-rose-600 hover:underline" href={`tel:${l.telefon}`}>{l.telefon}</a>}</td>
              <td className="px-5 py-3">{l.email && <a className="text-rose-600 hover:underline" href={`mailto:${l.email}`}>{l.email}</a>}</td>
              <td className="px-5 py-3">
                {l.webseite && (
                  <a className="text-rose-600 hover:underline" href={l.webseite} target="_blank" rel="noreferrer">
                    {l.webseite.replace(/^https?:\/\/(www\.)?/, "").slice(0, 30)}
                  </a>
                )}
              </td>
              <td className="px-5 py-3 text-stone-500">{l.adresse}</td>
              <td className="px-5 py-3">{l.bewertung && `${l.bewertung} (${l.anzahlReviews})`}</td>
              <td className="px-5 py-3 text-stone-500">{l.kategorie}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, dark, accent }: { label: string; value: number | string; dark?: boolean; accent?: boolean }) {
  const cls = dark ? "card-dark" : accent ? "card bg-rose-50 border-rose-100" : "card";
  return (
    <div className={`${cls} p-4`}>
      <div className={`text-xs ${dark ? "text-stone-400" : "text-stone-500"}`}>{label}</div>
      <div className={`mt-1 text-3xl font-semibold tracking-tight ${accent ? "text-rose-700" : ""}`}>{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label-base">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input-base" />
    </label>
  );
}

function NumberField({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <label className="block">
      <span className="label-base">{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} className="input-base" />
    </label>
  );
}

function TextField({ label, value, onChange, placeholder, rows }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows: number }) {
  return (
    <label className="block">
      <span className="label-base">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm placeholder:text-stone-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 transition"
      />
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="card border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">❌ {message}</div>;
}
