"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { Feature, GeoJsonObject } from "geojson";
import type { Map as LeafletMap } from "leaflet";
import L from "leaflet";

interface City {
  ort: string;
  total: number;
  called: number;
  touched: number;
  services: string[];
}

interface Marker extends City {
  lat: number;
  lng: number;
  polygon: GeoJsonObject | null;
}

interface PlzStat {
  plz: string;
  total: number;
  called: number;
  touched: number;
}

interface District extends PlzStat {
  polygon: GeoJsonObject;
}

interface CityDetail {
  ort: string;
  byService: Array<{ dienstleistung: string; total: number; called: number; touched: number }>;
  byPlz: PlzStat[];
  byStatus: Array<{ status: string; count: number }>;
}

const NRW_CENTER: [number, number] = [51.5, 7.5];

const STATUS_LABELS: Record<string, { label: string; emoji: string }> = {
  new: { label: "Neu", emoji: "🆕" },
  no_answer: { label: "Nicht erreicht", emoji: "📵" },
  interested: { label: "Interessiert", emoji: "🔥" },
  call_scheduled: { label: "Call vereinbart", emoji: "📅" },
  won: { label: "Kunde", emoji: "🏆" },
  not_interested: { label: "Kein Interesse", emoji: "❌" },
  lost: { label: "Verloren", emoji: "🪦" },
};

export default function CoverageMap({ cities }: { cities: City[] }) {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [selected, setSelected] = useState<Marker | null>(null);
  const [detail, setDetail] = useState<CityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Stadtteil-View: Sub-Polygone für die zoomed-in Stadt
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtsCity, setDistrictsCity] = useState<string | null>(null);
  const [districtsProgress, setDistrictsProgress] = useState<{ done: number; total: number } | null>(null);
  const districtsAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (cities.length === 0) return;
      setProgress({ done: 0, total: cities.length });
      const collected: Marker[] = [];
      const errors: string[] = [];

      for (let i = 0; i < cities.length; i++) {
        const city = cities[i];
        try {
          const r = await fetch(`/api/geocode?q=${encodeURIComponent(city.ort)}`);
          if (r.ok) {
            const d = (await r.json()) as {
              lat: number;
              lng: number;
              polygon: GeoJsonObject | null;
              cached?: boolean;
            };
            collected.push({ ...city, lat: d.lat, lng: d.lng, polygon: d.polygon });
            if (!d.cached) await new Promise((res) => setTimeout(res, 1100));
          } else {
            errors.push(city.ort);
          }
        } catch {
          errors.push(city.ort);
        }
        if (!alive) return;
        setProgress({ done: i + 1, total: cities.length });
        setMarkers([...collected]);
      }
      if (!alive) return;
      setFailed(errors);
      setProgress(null);
    })();
    return () => {
      alive = false;
    };
  }, [cities]);

  // Detail beim Auswählen einer Stadt nachladen
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    fetch(`/api/coverage/city?ort=${encodeURIComponent(selected.ort)}`)
      .then((r) => r.json())
      .then((d: CityDetail) => {
        if (alive) setDetail(d);
      })
      .catch(() => {
        if (alive) setDetail(null);
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selected]);

  /**
   * Reinzoomen auf eine Stadt: Karten-Zoom + asynchron PLZ-Polygone laden.
   * Wenn der User zwischendrin weiterklickt, wird die Schleife abgebrochen.
   */
  async function zoomTo(m: Marker) {
    const map = mapRef.current;
    if (!map) return;
    if (m.polygon) {
      const layer = L.geoJSON(m.polygon);
      map.fitBounds(layer.getBounds(), { padding: [40, 40] });
    } else {
      map.setView([m.lat, m.lng], 12);
    }

    // Vorherige Loop abbrechen, neuen Cancel-Token anlegen
    districtsAbortRef.current.cancelled = true;
    const myToken = { cancelled: false };
    districtsAbortRef.current = myToken;

    // detail kann noch null sein wenn schnell geklickt — kurze Wartezeit
    let plzs: PlzStat[] = [];
    const waitMs = 30;
    for (let i = 0; i < 50; i++) {
      if (detail?.ort === m.ort) break;
      await new Promise((res) => setTimeout(res, waitMs));
      if (myToken.cancelled) return;
    }
    plzs = (detail?.ort === m.ort ? detail.byPlz : []).filter((p) => p.plz !== "?");

    setDistricts([]);
    setDistrictsCity(m.ort);

    if (plzs.length === 0) {
      setDistrictsProgress(null);
      return;
    }

    setDistrictsProgress({ done: 0, total: plzs.length });
    const collected: District[] = [];

    for (let i = 0; i < plzs.length; i++) {
      if (myToken.cancelled) return;
      const p = plzs[i];
      try {
        const r = await fetch(
          `/api/geocode?q=${encodeURIComponent(p.plz + " " + m.ort)}`,
        );
        if (r.ok) {
          const d = (await r.json()) as {
            polygon: GeoJsonObject | null;
            cached?: boolean;
          };
          if (d.polygon) {
            collected.push({ ...p, polygon: d.polygon });
            if (!myToken.cancelled) setDistricts([...collected]);
          }
          if (!d.cached && !myToken.cancelled) {
            await new Promise((res) => setTimeout(res, 1100));
          }
        }
      } catch {
        /* ignorieren — kein Polygon für diese PLZ */
      }
      if (!myToken.cancelled) {
        setDistrictsProgress({ done: i + 1, total: plzs.length });
      }
    }
    if (!myToken.cancelled) setDistrictsProgress(null);
  }

  function resetView() {
    mapRef.current?.setView(NRW_CENTER, 8);
    districtsAbortRef.current.cancelled = true;
    setDistricts([]);
    setDistrictsCity(null);
    setDistrictsProgress(null);
  }

  const isZoomed = districtsCity !== null;

  return (
    <div className="space-y-3">
      {progress && (
        <div className="card flex items-center gap-3 p-3 text-sm text-stone-700">
          <div className="animate-pulse text-lg">📍</div>
          <div className="flex-1">
            <div>
              Stadtgrenzen laden {progress.done} / {progress.total} …
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-rose-500 transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {districtsProgress && (
        <div className="card flex items-center gap-3 p-3 text-sm text-stone-700">
          <div className="animate-pulse text-lg">🏘</div>
          <div className="flex-1">
            <div>
              PLZ-Bezirke {districtsCity} laden {districtsProgress.done} /{" "}
              {districtsProgress.total} …
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{
                  width: `${(districtsProgress.done / districtsProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {failed.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          ⚠ Keine Daten für: {failed.join(", ")}
        </div>
      )}

      <div className="relative">
        <div className="h-[500px] overflow-hidden rounded-2xl border border-stone-200 shadow-sm sm:h-[600px]">
          <MapContainer
            center={NRW_CENTER}
            zoom={8}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
            ref={(m) => {
              if (m) mapRef.current = m;
            }}
          >
            <MapClickResetter onMapClick={() => setSelected(null)} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Stadt-Polygone (Übersicht) */}
            {markers.map((m) => {
              const calledPct = m.total > 0 ? m.called / m.total : 0;
              const color = colorForProgress(calledPct);
              const isSelected = selected?.ort === m.ort;
              const isDimmed = isZoomed && districtsCity === m.ort;
              // Wenn auf Stadt zoomed: Polygon nur als Outline, ohne Füllung —
              // damit die PLZ-Polygone darunter klar sichtbar sind.
              const opacity = isDimmed ? 0 : fillOpacityFor(calledPct);

              if (m.polygon) {
                return (
                  <GeoJSON
                    key={`${m.ort}-${calledPct.toFixed(2)}-${isSelected}-${isDimmed}`}
                    data={m.polygon}
                    style={() => ({
                      color: isSelected || isDimmed ? "#0c4a6e" : color,
                      fillColor: color,
                      fillOpacity: opacity,
                      weight: isSelected || isDimmed ? 3 : 2,
                    })}
                    onEachFeature={(_: Feature, layer) => {
                      layer.bindTooltip(tooltipHtml(m, calledPct), {
                        direction: "top",
                        sticky: true,
                      });
                      layer.on("click", (e) => {
                        L.DomEvent.stopPropagation(e);
                        setSelected(m);
                      });
                    }}
                  />
                );
              }

              return (
                <CircleMarker
                  key={m.ort}
                  center={[m.lat, m.lng]}
                  radius={12}
                  pathOptions={{
                    color: isSelected ? "#0c4a6e" : color,
                    fillColor: color,
                    fillOpacity: opacity,
                    weight: isSelected ? 4 : 2,
                  }}
                  eventHandlers={{
                    click: () => setSelected(m),
                  }}
                >
                  <Tooltip direction="top" sticky>
                    <div dangerouslySetInnerHTML={{ __html: tooltipHtml(m, calledPct) }} />
                  </Tooltip>
                </CircleMarker>
              );
            })}

            {/* PLZ-Polygone (Stadtteil-View, sichtbar nur wenn reinzoomed) */}
            {districts.map((d) => {
              const calledPct = d.total > 0 ? d.called / d.total : 0;
              const color = colorForProgress(calledPct);
              const opacity = fillOpacityFor(calledPct);
              return (
                <GeoJSON
                  key={`plz-${d.plz}-${calledPct.toFixed(2)}`}
                  data={d.polygon}
                  style={() => ({
                    color: color,
                    fillColor: color,
                    fillOpacity: opacity,
                    weight: 2,
                    dashArray: "4 3",
                  })}
                  onEachFeature={(_: Feature, layer) => {
                    layer.bindTooltip(districtTooltipHtml(d, calledPct), {
                      direction: "top",
                      sticky: true,
                    });
                  }}
                />
              );
            })}
          </MapContainer>

          {/* Floating Reset-Button */}
          <button
            onClick={resetView}
            className="absolute right-3 top-3 z-[400] rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-md ring-1 ring-stone-200 hover:bg-stone-50"
          >
            🗺 NRW
          </button>
        </div>

        {/* Detail-Drawer rechts (Desktop) / Bottom-Sheet (Mobile) */}
        {selected && (
          <div
            className="absolute inset-y-0 right-0 z-[500] flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl lg:right-3 lg:top-3 lg:max-h-[calc(100%-1.5rem)]"
            style={{ marginBottom: "0.75rem", marginTop: "0.75rem" }}
          >
            <CityPanel
              marker={selected}
              detail={detail}
              loading={detailLoading}
              onClose={() => setSelected(null)}
              onZoom={() => zoomTo(selected)}
              districtsLoaded={districtsCity === selected.ort && districts.length > 0}
              districtsLoading={districtsProgress !== null}
            />
          </div>
        )}
      </div>

      {/* Legende */}
      <div className="card flex flex-wrap items-center gap-3 p-3 text-xs text-stone-600">
        <span className="font-medium text-stone-700">Anrufquote:</span>
        {(
          [
            ["#fda4af", "0%"],
            ["#f43f5e", "25%"],
            ["#e11d48", "50%"],
            ["#9f1239", "75%"],
            ["#4c0519", "100% ✓"],
          ] as const
        ).map(([c, l]) => (
          <div key={l} className="flex items-center gap-1">
            <LegendBox color={c} />
            <span>{l}</span>
          </div>
        ))}
        <span className="ml-auto text-stone-400">
          Klick = Details · „Reinzoomen" zeigt PLZ-Bezirke
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function MapClickResetter({ onMapClick }: { onMapClick: () => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onMapClick();
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map, onMapClick]);
  return null;
}

function CityPanel({
  marker,
  detail,
  loading,
  onClose,
  onZoom,
  districtsLoaded,
  districtsLoading,
}: {
  marker: Marker;
  detail: CityDetail | null;
  loading: boolean;
  onClose: () => void;
  onZoom: () => void;
  districtsLoaded: boolean;
  districtsLoading: boolean;
}) {
  const calledPct = marker.total > 0 ? marker.called / marker.total : 0;

  return (
    <>
      <div className="flex items-center justify-between border-b border-stone-100 p-4">
        <div>
          <h3 className="text-lg font-bold tracking-tight">{marker.ort}</h3>
          <p className="text-xs text-stone-500">
            {marker.total} Leads · {marker.called} angerufen ({Math.round(calledPct * 100)}%)
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          aria-label="Schließen"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-2 border-b border-stone-100 px-4 py-3">
        <button
          onClick={onZoom}
          disabled={districtsLoading}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {districtsLoading
            ? "⏳ Lädt PLZ-Bezirke…"
            : districtsLoaded
            ? "🔍 Erneut zoomen"
            : "🔍 Reinzoomen + Bezirke zeigen"}
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {loading && <p className="text-stone-500">Lade Details…</p>}

        {detail && !loading && (
          <>
            <Section title="Status-Verteilung">
              <div className="grid grid-cols-2 gap-2">
                {detail.byStatus
                  .sort((a, b) => b.count - a.count)
                  .map((s) => {
                    const meta = STATUS_LABELS[s.status] ?? { label: s.status, emoji: "•" };
                    return (
                      <div
                        key={s.status}
                        className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2"
                      >
                        <span>{meta.emoji}</span>
                        <span className="flex-1 truncate text-xs">{meta.label}</span>
                        <span className="font-semibold tabular-nums">{s.count}</span>
                      </div>
                    );
                  })}
              </div>
            </Section>

            <Section title="Pro Dienstleistung">
              <div className="space-y-1.5">
                {detail.byService.map((d) => {
                  const pct = d.total > 0 ? Math.round((d.called / d.total) * 100) : 0;
                  return (
                    <div key={d.dienstleistung} className="rounded-lg bg-stone-50 p-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{d.dienstleistung}</span>
                        <span className="tabular-nums text-stone-600">
                          {d.called} / {d.total} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-stone-200">
                        <div className="h-full bg-rose-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section
              title={`Nach Postleitzahl (${detail.byPlz.length} ${
                detail.byPlz.length === 1 ? "Bezirk" : "Bezirke"
              })`}
            >
              <p className="mb-2 text-[11px] text-stone-500">
                Reinzoomen blendet die PLZ-Polygone auf der Karte ein.
              </p>
              <div className="overflow-hidden rounded-lg ring-1 ring-stone-200">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                    <tr>
                      <th className="px-2 py-2">PLZ</th>
                      <th className="px-2 py-2 text-right">Leads</th>
                      <th className="px-2 py-2 text-right">Angerufen</th>
                      <th className="px-2 py-2">Fortschritt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {detail.byPlz.map((p) => {
                      const pct = p.total > 0 ? Math.round((p.called / p.total) * 100) : 0;
                      return (
                        <tr key={p.plz}>
                          <td className="px-2 py-2 font-mono">{p.plz}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold">
                            {p.total}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {p.called} <span className="text-stone-400">({pct}%)</span>
                          </td>
                          <td className="px-2 py-2">
                            <div className="h-1 overflow-hidden rounded-full bg-stone-100">
                              <div className="h-full bg-rose-500" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
        {title}
      </div>
      {children}
    </div>
  );
}

function LegendBox({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-4 w-4 rounded ring-1 ring-stone-300"
      style={{ background: color, opacity: 0.8 }}
    />
  );
}

function tooltipHtml(m: Marker, pct: number): string {
  const services = m.services.slice(0, 5).join(", ");
  const more = m.services.length > 5 ? ` +${m.services.length - 5}` : "";
  return `
    <div style="font-size:12px;line-height:1.4">
      <div style="font-weight:600;font-size:13px">${escapeHtml(m.ort)}</div>
      <div>📋 ${m.total} Leads</div>
      <div>📞 ${m.called} angerufen (${Math.round(pct * 100)}%)</div>
      <div>✅ ${m.touched} bearbeitet</div>
      <div style="color:#78716c;margin-top:4px">${escapeHtml(services)}${escapeHtml(more)}</div>
      <div style="margin-top:4px;color:#0c4a6e;font-weight:500">Klick für Details</div>
    </div>
  `;
}

function districtTooltipHtml(d: District, pct: number): string {
  return `
    <div style="font-size:12px;line-height:1.4">
      <div style="font-weight:600;font-size:13px;font-family:monospace">${escapeHtml(d.plz)}</div>
      <div>📋 ${d.total} Leads</div>
      <div>📞 ${d.called} angerufen (${Math.round(pct * 100)}%)</div>
      <div>✅ ${d.touched} bearbeitet</div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colorForProgress(pct: number): string {
  if (pct < 0.05) return "#fda4af";
  if (pct < 0.25) return "#fb7185";
  if (pct < 0.5) return "#f43f5e";
  if (pct < 0.75) return "#e11d48";
  if (pct < 1.0) return "#9f1239";
  return "#4c0519";
}

function fillOpacityFor(pct: number): number {
  return 0.5 + pct * 0.35;
}
