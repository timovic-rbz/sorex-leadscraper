"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

// Leaflet braucht window — daher Map-Komponente lazy + SSR aus
const CoverageMap = dynamic(() => import("./CoverageMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 text-sm text-stone-500">
      Lade Karte…
    </div>
  ),
});

interface CoverageRow {
  ort: string;
  dienstleistung: string;
  total: number;
  called: number;
  touched: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

type Tab = "table" | "map";

export default function CoveragePage() {
  const [rows, setRows] = useState<CoverageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("table");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/coverage")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { rows: CoverageRow[] }) => setRows(d.rows))
      .catch((e) => setError((e as Error).message));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.ort.toLowerCase().includes(q) || r.dienstleistung.toLowerCase().includes(q),
    );
  }, [rows, query]);

  // Aggregat über Städte (Map nutzt das)
  const byCity = useMemo(() => {
    const m = new Map<
      string,
      { ort: string; total: number; called: number; touched: number; services: string[] }
    >();
    for (const r of rows ?? []) {
      const e = m.get(r.ort);
      if (e) {
        e.total += r.total;
        e.called += r.called;
        e.touched += r.touched;
        if (!e.services.includes(r.dienstleistung)) e.services.push(r.dienstleistung);
      } else {
        m.set(r.ort, {
          ort: r.ort,
          total: r.total,
          called: r.called,
          touched: r.touched,
          services: [r.dienstleistung],
        });
      }
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const totalLeads = rows?.reduce((s, r) => s + r.total, 0) ?? 0;
  const totalCalled = rows?.reduce((s, r) => s + r.called, 0) ?? 0;
  const totalCombos = rows?.length ?? 0;
  const totalCities = byCity.length;

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">🗺 Coverage</h1>
        <p className="mt-1 text-sm text-stone-500">
          Wo wurde schon gescrapt + angerufen — damit du keine Stadt zweimal abgrast.
        </p>
      </header>

      {error && (
        <div className="card mb-6 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          ❌ {error}
        </div>
      )}

      {/* Highlight-Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Städte" value={totalCities} icon="🏙️" />
        <Stat label="Stadt × Dienstleistung" value={totalCombos} icon="🔀" />
        <Stat label="Leads insgesamt" value={totalLeads} icon="📋" />
        <Stat
          label="Angerufen"
          value={`${totalCalled} (${totalLeads ? Math.round((totalCalled / totalLeads) * 100) : 0}%)`}
          icon="📞"
        />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-full bg-stone-100 p-1">
          <TabPill active={tab === "table"} onClick={() => setTab("table")}>
            📋 Tabelle
          </TabPill>
          <TabPill active={tab === "map"} onClick={() => setTab("map")}>
            🗺 Karte (NRW)
          </TabPill>
        </div>
        {tab === "table" && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Stadt oder Dienstleistung filtern…"
            className="input-base !w-auto max-w-xs flex-1"
          />
        )}
      </div>

      {rows === null && <p className="text-stone-500">Lade…</p>}

      {tab === "table" && rows && (
        <CoverageTable rows={filtered} />
      )}

      {tab === "map" && rows && (
        <CoverageMap cities={byCity} />
      )}
    </div>
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-50 text-xl">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold tabular-nums text-stone-900">{value}</div>
        <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
      </div>
    </div>
  );
}

function CoverageTable({ rows }: { rows: CoverageRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center text-sm text-stone-500">
        <div className="text-4xl">🌱</div>
        <p>Noch nichts gescrapt. Starte eine Suche und komm hierher zurück.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500">
          <tr>
            <th className="px-4 py-3">Stadt</th>
            <th className="px-4 py-3">Dienstleistung</th>
            <th className="px-4 py-3 text-right">Leads</th>
            <th className="px-4 py-3 text-right">Angerufen</th>
            <th className="px-4 py-3 text-right">Bearbeitet</th>
            <th className="px-4 py-3">Fortschritt</th>
            <th className="px-4 py-3 text-right">Letzter Scrape</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((r, i) => {
            const calledPct = r.total > 0 ? Math.round((r.called / r.total) * 100) : 0;
            const touchedPct = r.total > 0 ? Math.round((r.touched / r.total) * 100) : 0;
            return (
              <tr key={`${r.ort}-${r.dienstleistung}-${i}`} className="hover:bg-stone-50/60">
                <td className="px-4 py-3 font-medium">{r.ort}</td>
                <td className="px-4 py-3 text-stone-600">{r.dienstleistung}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{r.total}</td>
                <td className="px-4 py-3 text-right tabular-nums text-stone-700">
                  {r.called} <span className="text-stone-400">({calledPct}%)</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-stone-700">{r.touched}</td>
                <td className="px-4 py-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100 ring-1 ring-stone-200">
                    <div className="h-full bg-rose-200" style={{ width: `${touchedPct}%` }} />
                    <div
                      className="-mt-2 h-full bg-rose-600"
                      style={{ width: `${calledPct}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-xs text-stone-500">
                  {r.lastSeen
                    ? new Date(r.lastSeen).toLocaleDateString("de-DE")
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
