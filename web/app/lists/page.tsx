"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LEAD_STATUS_META, LEAD_STATUS_ORDER, type ListWithStats } from "@/lib/types";

export default function ListsPage() {
  const [lists, setLists] = useState<ListWithStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    fetch("/api/lists")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { lists: ListWithStats[] };
        setLists(data.lists);
      })
      .catch((e) => setError((e as Error).message));
  }, [refresh]);

  async function deleteList(id: number, name: string) {
    if (!confirm(`Liste "${name}" löschen? Alle Leads gehen verloren.`)) return;
    const r = await fetch(`/api/lists/${id}`, { method: "DELETE" });
    if (!r.ok) {
      alert(`Fehler: ${r.status}`);
      return;
    }
    setRefresh((n) => n + 1);
  }

  if (error)
    return (
      <div className="mx-auto max-w-6xl p-6 lg:p-10">
        <div className="card border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          <p className="font-semibold">DB nicht erreichbar: {error}</p>
          <p className="mt-2 text-xs text-rose-700">
            Setze <code className="rounded bg-rose-100 px-1 py-0.5">POSTGRES_URL</code> in <code>.env.local</code> oder verbinde Vercel-Postgres.
          </p>
        </div>
      </div>
    );

  if (!lists) return <div className="mx-auto max-w-6xl p-6 lg:p-10"><p className="text-stone-500">Lade...</p></div>;

  const totalLeads = lists.reduce((sum, l) => sum + l.total, 0);

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Listen</h1>
          <p className="mt-2 text-sm text-stone-500">
            {lists.length} {lists.length === 1 ? "Liste" : "Listen"} · {totalLeads} Leads insgesamt
          </p>
        </div>
        <Link href="/" className="btn-primary">+ Neue Suche</Link>
      </header>

      {lists.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 p-12 text-center">
          <div className="text-5xl">📋</div>
          <p className="text-stone-600">Noch keine Listen angelegt.</p>
          <Link href="/" className="btn-primary">🔍 Erste Suche starten</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {lists.map((l) => (
            <ListCard key={l.id} list={l} onDelete={() => deleteList(l.id, l.name)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ListCard({ list, onDelete }: { list: ListWithStats; onDelete: () => void }) {
  const interestCount = (list.byStatus.interested ?? 0) + (list.byStatus.call_scheduled ?? 0);
  const wonCount = list.byStatus.won ?? 0;

  return (
    <div className="card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-4 flex items-start justify-between gap-3">
        <Link href={`/lists/${list.id}`} className="block flex-1 min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight hover:text-rose-600">{list.name}</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            {list.total} Leads · erstellt {new Date(list.createdAt).toLocaleDateString("de-DE")}
          </p>
        </Link>
        <button onClick={onDelete} className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-rose-600" title="Liste löschen">
          <TrashIcon />
        </button>
      </div>

      {/* Highlight-Stats */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <MiniStat label="Total" value={list.total} />
        <MiniStat label="🔥 + 📅" value={interestCount} accent={interestCount > 0} />
        <MiniStat label="🏆 Kunden" value={wonCount} success={wonCount > 0} />
      </div>

      {/* Status-Strip */}
      <div className="grid grid-cols-7 gap-1.5">
        {LEAD_STATUS_ORDER.map((s) => {
          const count = list.byStatus[s] ?? 0;
          const meta = LEAD_STATUS_META[s];
          const filled = count > 0;
          return (
            <div
              key={s}
              className={`flex flex-col items-center justify-center rounded-lg py-2 text-xs transition ${
                filled ? meta.color + " text-white" : "bg-stone-100 text-stone-400"
              }`}
              title={`${meta.label}: ${count}`}
            >
              <div className="text-base leading-none">{meta.emoji}</div>
              <div className="mt-1 font-mono font-semibold">{count}</div>
            </div>
          );
        })}
      </div>

      <Link href={`/lists/${list.id}`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-rose-600 hover:underline">
        Cold-Calling starten →
      </Link>
    </div>
  );
}

function MiniStat({ label, value, accent, success }: { label: string; value: number; accent?: boolean; success?: boolean }) {
  const cls = accent
    ? "bg-rose-50 text-rose-700"
    : success
    ? "bg-emerald-50 text-emerald-700"
    : "bg-stone-50 text-stone-700";
  return (
    <div className={`rounded-xl ${cls} px-2 py-2 text-center`}>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}
