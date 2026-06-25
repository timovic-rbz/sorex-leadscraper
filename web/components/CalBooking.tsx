"use client";

import { useCallback, useEffect, useState } from "react";

interface Slot {
  start: string;
}

/** Heutiges Datum als YYYY-MM-DD (lokal). */
function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

/**
 * Cal.com-Buchungspanel: Tag wählen → freie Slots laden → Slot + E-Mail des
 * Interessenten bestätigen → echten Termin buchen. Bei Erfolg ruft es onBooked()
 * (der Lead steht serverseitig dann auf "Call vereinbart").
 */
export function CalBooking({
  lead,
  busy,
  onBooked,
}: {
  lead: { uid: string; firmenname: string | null; email: string | null };
  busy: boolean;
  onBooked: () => void;
}) {
  const [date, setDate] = useState<string>(todayISO());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [timeZone, setTimeZone] = useState<string>("Europe/Berlin");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [email, setEmail] = useState<string>(lead.email ?? "");
  const [name, setName] = useState<string>(lead.firmenname ?? "");
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSlots = useCallback(async (d: string) => {
    setLoadingSlots(true);
    setError(null);
    setSelected(null);
    try {
      const r = await fetch(`/api/calcom/slots?date=${d}`);
      const data = (await r.json().catch(() => ({}))) as {
        slots?: Slot[];
        timeZone?: string;
        error?: string;
      };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setSlots(data.slots ?? []);
      if (data.timeZone) setTimeZone(data.timeZone);
    } catch (e) {
      setError((e as Error).message);
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    loadSlots(date);
  }, [date, loadSlots]);

  async function book() {
    if (!selected) {
      setError("Bitte einen Slot wählen");
      return;
    }
    if (!email.trim()) {
      setError("E-Mail des Interessenten erforderlich (für Einladung + Erinnerung)");
      return;
    }
    setBooking(true);
    setError(null);
    try {
      const r = await fetch("/api/calcom/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: lead.uid,
          start: selected,
          attendeeEmail: email.trim(),
          attendeeName: name.trim(),
        }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      onBooked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBooking(false);
    }
  }

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone });

  const disabled = busy || booking;

  return (
    <div className="mt-4 rounded-2xl border border-purple-200 bg-purple-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="label-base">Tag</label>
          <input
            type="date"
            value={date}
            min={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className="input-base"
          />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="label-base">E-Mail Interessent (Einladung geht dorthin)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kontakt@studio.de"
            className="input-base"
          />
        </div>
      </div>

      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-purple-700">
        Freie Termine {loadingSlots && "· lädt…"}
      </div>
      {!loadingSlots && slots.length === 0 && !error && (
        <p className="py-2 text-sm text-stone-500">Keine freien Slots an diesem Tag.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {slots.map((s) => (
          <button
            key={s.start}
            onClick={() => setSelected(s.start)}
            disabled={disabled}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition disabled:opacity-50 ${
              selected === s.start
                ? "bg-purple-600 text-white ring-purple-600"
                : "bg-white text-stone-700 ring-stone-200 hover:ring-purple-300"
            }`}
          >
            {fmtTime(s.start)}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[11px] text-stone-500">
          Zeitzone {timeZone} · bucht echten Cal.com-Termin
        </span>
        <button
          onClick={book}
          disabled={disabled || !selected}
          className="rounded-full bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {booking ? "Bucht…" : "📅 Termin buchen"}
        </button>
      </div>
    </div>
  );
}
