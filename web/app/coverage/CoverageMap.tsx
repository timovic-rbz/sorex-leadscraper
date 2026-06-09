"use client";

import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Tooltip,
} from "react-leaflet";
import type { Feature, GeoJsonObject } from "geojson";

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

// NRW-Mitte ≈ Dortmund
const NRW_CENTER: [number, number] = [51.5, 7.5];

export default function CoverageMap({ cities }: { cities: City[] }) {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

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
            collected.push({
              ...city,
              lat: d.lat,
              lng: d.lng,
              polygon: d.polygon,
            });
            if (!d.cached) await new Promise((res) => setTimeout(res, 1100));
          } else {
            errors.push(city.ort);
          }
        } catch {
          errors.push(city.ort);
        }
        if (!alive) return;
        setProgress({ done: i + 1, total: cities.length });
        // Inkrementell anzeigen, damit man Fortschritt sieht
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

      {failed.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          ⚠ Keine Daten für: {failed.join(", ")}
        </div>
      )}

      <div className="h-[500px] overflow-hidden rounded-2xl border border-stone-200 shadow-sm sm:h-[600px]">
        <MapContainer
          center={NRW_CENTER}
          zoom={8}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markers.map((m) => {
            const calledPct = m.total > 0 ? m.called / m.total : 0;
            const color = colorForProgress(calledPct);
            const opacity = fillOpacityFor(calledPct);

            // Wenn Polygon da: gefärbte Stadt-Grenze. Sonst Fallback Circle.
            if (m.polygon) {
              return (
                <GeoJSON
                  key={`${m.ort}-${calledPct.toFixed(2)}`}
                  data={m.polygon}
                  style={() => ({
                    color: color,
                    fillColor: color,
                    fillOpacity: opacity,
                    weight: 2,
                  })}
                  onEachFeature={(_: Feature, layer) => {
                    layer.bindTooltip(
                      tooltipHtml(m, calledPct),
                      { direction: "top", sticky: true },
                    );
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
                  color: color,
                  fillColor: color,
                  fillOpacity: opacity,
                  weight: 2,
                }}
              >
                <Tooltip direction="top" sticky>
                  <div dangerouslySetInnerHTML={{ __html: tooltipHtml(m, calledPct) }} />
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* Legende: Anrufquote-Farbverlauf */}
      <div className="card flex flex-wrap items-center gap-3 p-3 text-xs text-stone-600">
        <span className="font-medium text-stone-700">Anrufquote pro Stadt:</span>
        <div className="flex items-center gap-1">
          <LegendBox color="#fda4af" />
          <span>0%</span>
        </div>
        <div className="flex items-center gap-1">
          <LegendBox color="#f43f5e" />
          <span>25%</span>
        </div>
        <div className="flex items-center gap-1">
          <LegendBox color="#e11d48" />
          <span>50%</span>
        </div>
        <div className="flex items-center gap-1">
          <LegendBox color="#9f1239" />
          <span>75%</span>
        </div>
        <div className="flex items-center gap-1">
          <LegendBox color="#4c0519" />
          <span>100% ✓</span>
        </div>
        <span className="ml-auto text-stone-400">
          Stadtgrenzen via OpenStreetMap
        </span>
      </div>
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
  // Wir bauen einen kleinen HTML-Block — Leaflet rendert das im Tooltip
  const services = m.services.slice(0, 5).join(", ");
  const more = m.services.length > 5 ? ` +${m.services.length - 5}` : "";
  return `
    <div style="font-size:12px;line-height:1.4">
      <div style="font-weight:600;font-size:13px">${escapeHtml(m.ort)}</div>
      <div>📋 ${m.total} Leads</div>
      <div>📞 ${m.called} angerufen (${Math.round(pct * 100)}%)</div>
      <div>✅ ${m.touched} bearbeitet</div>
      <div style="color:#78716c;margin-top:4px">${escapeHtml(services)}${escapeHtml(more)}</div>
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

/**
 * Farbverlauf hellrot → dunkelrot anhand der Anrufquote.
 * Nicht über continuous interpolate gehen — Tailwind-Stamm-Töne lesen sich besser.
 */
function colorForProgress(pct: number): string {
  // Hellrot (unangerührt) → dunkelrot (komplett durch). Bewusst kräftig
  // ab Stufe 1 damit jede Stadt klar erkennbar ist.
  if (pct < 0.05) return "#fda4af"; // rose-300 – fast unangerührt, aber sichtbar
  if (pct < 0.25) return "#fb7185"; // rose-400
  if (pct < 0.5) return "#f43f5e";  // rose-500
  if (pct < 0.75) return "#e11d48"; // rose-600
  if (pct < 1.0) return "#9f1239";  // rose-800
  return "#4c0519";                  // rose-950 – komplett durch
}

function fillOpacityFor(pct: number): number {
  // 0%: 0.50 – Stadt klar erkennbar
  // 100%: 0.85 – kräftig gefüllt
  return 0.5 + pct * 0.35;
}
