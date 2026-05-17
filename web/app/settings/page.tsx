"use client";

import { useEffect, useState } from "react";

interface ProviderEntry {
  id: string;
  name: string;
  purpose: string;
  description: string;
  docsUrl: string;
  placeholder: string;
  patternHint: string;
  configured: boolean;
  masked: string | null;
  updatedAt: string | null;
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const r = await fetch("/api/settings");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { providers: ProviderEntry[] };
      setProviders(data.providers);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-10">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Einstellungen</h1>
        <p className="mt-2 text-sm text-stone-500">
          API-Keys, die das Tool nutzt. Werden in der Datenbank gespeichert – nicht im Frontend.
        </p>
      </header>

      {error && (
        <div className="card mb-6 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          ❌ {error}
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">API-Keys</h2>
        {providers === null && <p className="text-sm text-stone-500">Lade...</p>}
        {providers?.map((p) => (
          <ProviderCard key={p.id} provider={p} onChange={reload} />
        ))}
      </section>
    </div>
  );
}

function ProviderCard({ provider, onChange }: { provider: ProviderEntry; onChange: () => void }) {
  const [editing, setEditing] = useState(!provider.configured);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id, value }),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);
      setMsg({ kind: "ok", text: "Gespeichert." });
      setValue("");
      setEditing(false);
      onChange();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Key für ${provider.name} wirklich löschen?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/settings?provider=${encodeURIComponent(provider.id)}`, {
        method: "DELETE",
      });
      const data = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || data.error) throw new Error(data.error ?? `HTTP ${r.status}`);
      setEditing(true);
      onChange();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{provider.name}</h3>
            {provider.configured ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                ✓ aktiv
              </span>
            ) : (
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
                nicht gesetzt
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm font-medium text-stone-700">{provider.purpose}</p>
          <p className="mt-1.5 text-sm text-stone-500">{provider.description}</p>
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm text-rose-600 hover:underline"
          >
            → Key besorgen
          </a>
        </div>
      </div>

      <div className="mt-4 border-t border-stone-100 pt-4">
        {!editing && provider.configured && (
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded-lg bg-stone-50 px-3 py-2 font-mono text-sm text-stone-700">
              {provider.masked}
            </code>
            {provider.updatedAt && (
              <span className="text-xs text-stone-400">
                aktualisiert {new Date(provider.updatedAt).toLocaleString("de-DE")}
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <button onClick={() => setEditing(true)} className="btn-ghost h-9 px-4">
                ✏️ Ändern
              </button>
              <button
                onClick={remove}
                disabled={busy}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-rose-200 bg-white px-4 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition"
              >
                🗑 Löschen
              </button>
            </div>
          </div>
        )}

        {editing && (
          <div className="space-y-3">
            <label className="block">
              <span className="label-base">Key</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={provider.placeholder}
                className="input-base font-mono"
              />
              <span className="mt-1 block text-xs text-stone-400">{provider.patternHint}</span>
            </label>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy || !value} className="btn-primary">
                {busy ? "⏳ Speichere..." : "💾 Speichern"}
              </button>
              {provider.configured && (
                <button
                  onClick={() => {
                    setEditing(false);
                    setValue("");
                    setMsg(null);
                  }}
                  className="btn-ghost"
                >
                  Abbrechen
                </button>
              )}
            </div>
          </div>
        )}

        {msg && (
          <p
            className={`mt-3 text-sm ${
              msg.kind === "ok" ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {msg.kind === "ok" ? "✅ " : "❌ "}
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
