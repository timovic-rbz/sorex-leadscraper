"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ListWithStats } from "@/lib/types";

export default function CallModePage() {
  const router = useRouter();
  const [lists, setLists] = useState<ListWithStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/lists")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { lists: ListWithStats[] }) => setLists(d.lists ?? []))
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">📞 Anruf-Modus</h1>
          <p className="mt-1 text-sm text-stone-500">
            Liste wählen → fokussiert einen Lead nach dem anderen abtelefonieren, ohne Ablenkung.
          </p>
        </div>
        <Link href="/lists" className="btn-ghost h-9">
          Beenden
        </Link>
      </header>

      {error && (
        <div className="card mb-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">❌ {error}</div>
      )}
      {!lists && <p className="text-stone-500">Lade Listen…</p>}
      {lists && lists.length === 0 && (
        <div className="card p-6 text-center text-sm text-stone-500">Noch keine Listen vorhanden.</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {lists?.map((list) => {
          const toCall = (list.byStatus.new ?? 0) + (list.byStatus.no_answer ?? 0);
          return (
            <button
              key={list.id}
              onClick={() => router.push(`/lists/${list.id}?call=1`)}
              disabled={toCall === 0}
              className="card flex items-center justify-between gap-3 p-5 text-left transition hover:border-rose-300 hover:shadow-sm disabled:opacity-50"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold">{list.name}</div>
                <div className="text-xs text-stone-500">{list.total} Leads gesamt</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-2xl font-bold tabular-nums text-rose-600">{toCall}</div>
                <div className="text-[10px] uppercase tracking-wider text-stone-400">abzutelefonieren</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
