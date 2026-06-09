"use client";

import { useEffect, useRef, useState } from "react";

interface PublicSetter {
  id: number;
  name: string;
  color: string;
}

export default function LoginPage() {
  const [setters, setSetters] = useState<PublicSetter[] | null>(null);
  const [selected, setSelected] = useState<PublicSetter | null>(null);
  const [pin, setPin] = useState("");
  const [bootstrapPw, setBootstrapPw] = useState("");
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch("/api/setters/public")
      .then((r) => r.json())
      .then((d: { setters: PublicSetter[] }) => setSetters(d.setters ?? []))
      .catch(() => setSetters([]));
  }, []);

  useEffect(() => {
    if (selected) {
      setPin("");
      setError(null);
      setTimeout(() => pinInputRef.current?.focus(), 50);
    }
  }, [selected]);

  function fromParam(): string {
    if (typeof window === "undefined") return "/lists";
    const p = new URL(window.location.href).searchParams.get("from");
    return p && p !== "/login" ? p : "/lists";
  }

  async function loginSetter() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setterId: selected.id, pin }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      window.location.href = fromParam();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loginBootstrap() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: bootstrapPw }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      window.location.href = (setters?.length ?? 0) > 0 ? fromParam() : "/settings";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const noSetters = setters !== null && setters.length === 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 via-white to-rose-50/40 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900 text-2xl font-bold text-white shadow-lg">
            S
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Soreax Leadscraper</h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {showBootstrap ? "Admin-Login" : "Setter-Login"}
          </p>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          {!showBootstrap && (
            <>
              {setters === null && (
                <p className="py-8 text-center text-sm text-stone-500">Lade Team...</p>
              )}

              {noSetters && (
                <div className="rounded-xl bg-amber-50 p-4 text-center text-sm text-amber-800">
                  Noch keine Setter angelegt. Bitte zuerst per{" "}
                  <button onClick={() => setShowBootstrap(true)} className="underline">
                    Admin-Login
                  </button>{" "}
                  einloggen und das Team in den Einstellungen anlegen.
                </div>
              )}

              {setters && setters.length > 0 && !selected && (
                <>
                  <p className="mb-4 text-center text-sm text-stone-500">Wer bist du?</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {setters.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelected(s)}
                        className="flex flex-col items-center gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-center transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-sm"
                      >
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
                          style={{ background: s.color }}
                        >
                          {initials(s.name)}
                        </div>
                        <span className="text-sm font-medium text-stone-800">{s.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {selected && (
                <div>
                  <div className="mb-4 flex items-center gap-3 rounded-2xl bg-stone-50 p-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
                      style={{ background: selected.color }}
                    >
                      {initials(selected.name)}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{selected.name}</div>
                      <button
                        onClick={() => setSelected(null)}
                        className="text-xs text-stone-500 hover:underline"
                      >
                        ← Wechseln
                      </button>
                    </div>
                  </div>

                  <label className="block">
                    <span className="label-base">PIN</span>
                    <input
                      ref={pinInputRef}
                      type="password"
                      inputMode="numeric"
                      pattern="\d*"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && loginSetter()}
                      placeholder="• • • •"
                      className="input-base text-center text-2xl tracking-[0.5em] font-mono"
                      maxLength={8}
                    />
                  </label>

                  <button
                    onClick={loginSetter}
                    disabled={busy || !pin}
                    className="btn-primary mt-4 w-full justify-center disabled:opacity-50"
                  >
                    {busy ? "Anmelde..." : "Anmelden"}
                  </button>
                </div>
              )}

              <div className="mt-6 border-t border-stone-100 pt-4 text-center">
                <button
                  onClick={() => setShowBootstrap(true)}
                  className="text-xs text-stone-500 hover:text-stone-700 hover:underline"
                >
                  Admin-Login
                </button>
              </div>
            </>
          )}

          {showBootstrap && (
            <div>
              <label className="block">
                <span className="label-base">Admin-Passwort</span>
                <input
                  type="password"
                  value={bootstrapPw}
                  onChange={(e) => setBootstrapPw(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loginBootstrap()}
                  placeholder="Master-Passwort"
                  className="input-base"
                  autoFocus
                />
                <span className="mt-1 block text-xs text-stone-400">
                  APP_PASSWORD aus den Server-Env-Vars.
                </span>
              </label>

              <button
                onClick={loginBootstrap}
                disabled={busy || !bootstrapPw}
                className="btn-primary mt-4 w-full justify-center disabled:opacity-50"
              >
                {busy ? "Anmelde..." : "Als Admin anmelden"}
              </button>

              <div className="mt-6 border-t border-stone-100 pt-4 text-center">
                <button
                  onClick={() => setShowBootstrap(false)}
                  className="text-xs text-stone-500 hover:text-stone-700 hover:underline"
                >
                  ← Zurück zum Setter-Login
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              ❌ {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
