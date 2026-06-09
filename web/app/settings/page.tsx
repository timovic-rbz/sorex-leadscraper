"use client";

import { useEffect, useState } from "react";
import type { Setter } from "@/lib/types";

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

const COLOR_PALETTE = [
  "#e11d48", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

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

      <section className="mb-12 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">📊 Verbrauch</h2>
        <p className="text-sm text-stone-500">
          Externe API-Calls + geschätzte Kosten. Wird automatisch mitgeloggt sobald eine Suche
          läuft — keine externe Abrechnung, nur lokale Schätzung auf Listenpreis-Basis.
        </p>
        <UsageSection />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">API-Keys</h2>
        {providers === null && <p className="text-sm text-stone-500">Lade...</p>}
        {providers?.map((p) => (
          <ProviderCard key={p.id} provider={p} onChange={reload} />
        ))}
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Admin-Passwort</h2>
        <p className="text-sm text-stone-500">
          Master-Passwort für den „Admin-Login" auf der Login-Seite. Wenn hier nichts gesetzt ist,
          gilt das Server-Env <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">APP_PASSWORD</code>.
          Beides parallel aktiv – das Env bleibt als Recovery, falls du das UI-Passwort vergisst.
        </p>
        <AdminPasswordSection />
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Team (Setter)</h2>
        <p className="text-sm text-stone-500">
          Wer darf sich einloggen und Leads bearbeiten? Setter sehen nur Listen + Leaderboard.
          Admins dürfen zusätzlich scrapen, das Team verwalten und Einstellungen ändern.
        </p>
        <TeamSection />
      </section>
    </div>
  );
}

// ============================================================================
// Verbrauchs-Sektion
// ============================================================================

interface UsageWindow {
  units: number;
  costEur: number;
  calls: number;
}

interface ProviderUsage {
  provider: string;
  today: UsageWindow;
  week: UsageWindow;
  month: UsageWindow;
  total: UsageWindow;
  operations: Array<{ operation: string; calls: number; units: number; costEur: number }>;
}

const PROVIDER_META: Record<string, { name: string; unit: string; icon: string }> = {
  google_places: { name: "Google Places", unit: "Adressen", icon: "🗺️" },
  anthropic: { name: "Anthropic (Claude)", unit: "Tokens", icon: "🤖" },
  openai: { name: "OpenAI (GPT)", unit: "Tokens", icon: "💬" },
};

function UsageSection() {
  const [usage, setUsage] = useState<ProviderUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = (await r.json()) as { usage: ProviderUsage[] };
        setUsage(d.usage);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) {
    return (
      <div className="card border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        ❌ {error}
      </div>
    );
  }

  if (usage === null) {
    return <p className="text-sm text-stone-500">Lade...</p>;
  }

  if (usage.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 p-8 text-center">
        <div className="text-4xl">📈</div>
        <p className="text-sm text-stone-600">
          Noch keine API-Calls protokolliert. Sobald du die erste Suche startest, taucht's hier auf.
        </p>
      </div>
    );
  }

  // Team-Gesamt-Banner
  const monthTotalEur = usage.reduce((acc, u) => acc + u.month.costEur, 0);
  const monthTotalCalls = usage.reduce((acc, u) => acc + u.month.calls, 0);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-4 bg-gradient-to-br from-rose-50 to-amber-50 p-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Letzte 30 Tage · alle Provider
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-stone-900">
            {formatEur(monthTotalEur)}
          </div>
          <div className="mt-1 text-xs text-stone-500">{monthTotalCalls} API-Calls</div>
        </div>
        <div className="text-right text-xs text-stone-500">
          Geschätzt auf Listenpreis<br />
          (Google: $32/1000 Text Search,<br />
          AI: aktuelle Token-Preise)
        </div>
      </div>

      {usage.map((u) => (
        <UsageCard key={u.provider} usage={u} />
      ))}
    </div>
  );
}

function UsageCard({ usage }: { usage: ProviderUsage }) {
  const meta = PROVIDER_META[usage.provider] ?? {
    name: usage.provider,
    unit: "Einheiten",
    icon: "📊",
  };

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-50 text-xl">
          {meta.icon}
        </div>
        <div>
          <h3 className="text-base font-semibold">{meta.name}</h3>
          <p className="text-xs text-stone-500">{meta.unit}</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-lg font-bold tabular-nums">{formatEur(usage.total.costEur)}</div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500">All-time</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <WindowStat label="Heute" w={usage.today} unit={meta.unit} />
        <WindowStat label="Letzte 7 Tage" w={usage.week} unit={meta.unit} />
        <WindowStat label="Letzte 30 Tage" w={usage.month} unit={meta.unit} />
        <WindowStat label="All-time" w={usage.total} unit={meta.unit} />
      </div>

      {usage.operations.length > 0 && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-xs font-medium text-stone-500 hover:text-stone-700">
            Aufschlüsselung nach Operation ({usage.operations.length})
          </summary>
          <div className="mt-3 space-y-1 rounded-lg bg-stone-50 p-3">
            {usage.operations.map((op) => (
              <div
                key={op.operation}
                className="flex items-center justify-between text-xs text-stone-600"
              >
                <span className="font-mono">{op.operation}</span>
                <span>
                  <span className="tabular-nums">{op.calls}</span>× ·{" "}
                  <span className="tabular-nums">{op.units}</span> {meta.unit} ·{" "}
                  <span className="font-semibold tabular-nums">{formatEur(op.costEur)}</span>
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function WindowStat({ label, w, unit }: { label: string; w: UsageWindow; unit: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums text-stone-900">
        {formatEur(w.costEur)}
      </div>
      <div className="mt-0.5 text-[10px] text-stone-500">
        {w.calls}× · {w.units.toLocaleString("de-DE")} {unit}
      </div>
    </div>
  );
}

function formatEur(eur: number): string {
  // Bei sehr kleinen Beträgen Cent anzeigen statt 0.00€
  if (eur > 0 && eur < 0.01) return "< 1ct";
  return eur.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function AdminPasswordSection() {
  const [status, setStatus] = useState<{ dbConfigured: boolean; envConfigured: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/admin-password");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { dbConfigured: boolean; envConfigured: boolean };
      setStatus(d);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setMsg(null);
    if (pw1.length < 4) {
      setMsg({ kind: "err", text: "Mindestens 4 Zeichen." });
      return;
    }
    if (pw1 !== pw2) {
      setMsg({ kind: "err", text: "Passwörter stimmen nicht überein." });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw1 }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || d.error) throw new Error(d.error ?? `HTTP ${r.status}`);
      setMsg({ kind: "ok", text: "Passwort gespeichert." });
      setPw1("");
      setPw2("");
      setEditing(false);
      load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm("UI-Passwort entfernen? Danach gilt wieder nur das Server-Env APP_PASSWORD.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin-password", { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMsg({ kind: "ok", text: "UI-Passwort entfernt." });
      load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      {status === null && <p className="text-sm text-stone-500">Lade...</p>}

      {status && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          {status.dbConfigured ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-700">
              ✓ UI-Passwort aktiv
            </span>
          ) : (
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 font-medium text-stone-600">
              kein UI-Passwort
            </span>
          )}
          {status.envConfigured ? (
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 font-medium text-blue-700">
              ⛑ Env-Recovery aktiv
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-700">
              ⚠ Kein Env-Recovery
            </span>
          )}
        </div>
      )}

      {!editing && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEditing(true)} className="btn-primary">
            {status?.dbConfigured ? "✏️ Ändern" : "+ Passwort setzen"}
          </button>
          {status?.dbConfigured && (
            <button
              onClick={clear}
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-rose-200 bg-white px-4 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition"
            >
              🗑 Entfernen
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-3">
          <label className="block">
            <span className="label-base">Neues Passwort (min. 4 Zeichen)</span>
            <input
              type="password"
              autoComplete="new-password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              className="input-base"
            />
          </label>
          <label className="block">
            <span className="label-base">Wiederholen</span>
            <input
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              className="input-base"
            />
          </label>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy || !pw1 || !pw2} className="btn-primary">
              {busy ? "Speichere..." : "💾 Speichern"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setPw1("");
                setPw2("");
                setMsg(null);
              }}
              className="btn-ghost"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`mt-3 text-sm ${msg.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
          {msg.kind === "ok" ? "✅ " : "❌ "}
          {msg.text}
        </p>
      )}
    </div>
  );
}

function TeamSection() {
  const [setters, setSetters] = useState<Setter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function reload() {
    try {
      const r = await fetch("/api/setters");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { setters: Setter[] };
      setSetters(d.setters);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function remove(id: number, name: string) {
    if (!confirm(`Setter "${name}" wirklich entfernen?`)) return;
    const r = await fetch(`/api/setters?id=${id}`, { method: "DELETE" });
    if (!r.ok) {
      alert(`Fehler: ${r.status}`);
      return;
    }
    reload();
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          ❌ {error}
        </div>
      )}

      {setters === null && <p className="text-sm text-stone-500">Lade...</p>}

      {setters?.map((s) => (
        <SetterRow key={s.id} setter={s} onChange={reload} onRemove={() => remove(s.id, s.name)} />
      ))}

      {setters && setters.length === 0 && !showForm && (
        <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          Noch kein Team. Lege den ersten Setter an.
        </div>
      )}

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Setter hinzufügen</button>
      )}

      {showForm && (
        <NewSetterForm
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function SetterRow({
  setter,
  onChange,
  onRemove,
}: {
  setter: Setter;
  onChange: () => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(setter.name);
  const [pin, setPin] = useState("");
  const [color, setColor] = useState(setter.color);
  const [isAdmin, setIsAdmin] = useState(setter.isAdmin);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { id: setter.id, name, color, isAdmin };
      if (pin) body.pin = pin;
      const r = await fetch("/api/setters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        alert(`Fehler: ${d.error ?? r.status}`);
        return;
      }
      setEditing(false);
      setPin("");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="card flex items-center gap-3 p-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
          style={{ background: setter.color }}
        >
          {setter.name
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{setter.name}</span>
            {setter.isAdmin && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Admin
              </span>
            )}
          </div>
          <div className="text-xs text-stone-500">
            angelegt {new Date(setter.createdAt).toLocaleDateString("de-DE")}
          </div>
        </div>
        <button onClick={() => setEditing(true)} className="btn-ghost h-9 px-4">
          ✏️ Ändern
        </button>
        <button
          onClick={onRemove}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-rose-200 bg-white px-4 text-sm text-rose-700 hover:bg-rose-50 transition"
        >
          🗑
        </button>
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label-base">Name</span>
          <input className="input-base" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="label-base">Neue PIN (4–8 Ziffern, leer = unverändert)</span>
          <input
            className="input-base font-mono"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            maxLength={8}
          />
        </label>
      </div>
      <div>
        <span className="label-base">Farbe</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-stone-900" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
        Admin-Rechte (Suche + Einstellungen)
      </label>
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="btn-primary">
          {busy ? "Speichere..." : "💾 Speichern"}
        </button>
        <button onClick={() => setEditing(false)} className="btn-ghost">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function NewSetterForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/setters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pin, color, isAdmin }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <h3 className="font-semibold">Neuer Setter</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label-base">Name</span>
          <input className="input-base" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Max" />
        </label>
        <label className="block">
          <span className="label-base">PIN (4–8 Ziffern)</span>
          <input
            className="input-base font-mono"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            maxLength={8}
            placeholder="1234"
          />
        </label>
      </div>
      <div>
        <span className="label-base">Farbe</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-stone-900" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
        Admin-Rechte
      </label>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">❌ {error}</div>}
      <div className="flex gap-2">
        <button onClick={create} disabled={busy || !name || !pin} className="btn-primary">
          {busy ? "Lege an..." : "Anlegen"}
        </button>
        <button onClick={onCancel} className="btn-ghost">
          Abbrechen
        </button>
      </div>
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
