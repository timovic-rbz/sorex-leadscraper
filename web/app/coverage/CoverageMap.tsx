"use client";

import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";

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

      // Sequenziell + 1.1s Pause damit Nominatim glücklich bleibt (Rate-Limit).
      // Cache-Hits gehen schneller (kein Nominatim-Call), daher fragt der
      // Endpoint die DB-Cache zuerst — beim 2. Page-Load ist alles instant.
      for (let i = 0; i < cities.length; i++) {
        const city = cities[i];
        try {
          const r = await fetch(`/api/geocode?q=${encodeURIComponent(city.ort)}`);
          if (r.ok) {
            const d = (await r.json()) as { lat: number; lng: number; cached?: boolean };
            collected.push({ ...city, lat: d.lat, lng: d.lng });
            // Nur bei Nominatim-Call warten, Cache-Hits brauchen kein Sleep
            if (!d.cached) await new Promise((res) => setTimeout(res, 1100));
          } else {
            errors.push(city.ort);
          }
        } catch {
          errors.push(city.ort);
        }
        if (!alive) return;
        setProgress({ done: i + 1, total: cities.length });
      }

      if (!alive) return;
      setMarkers(collected);
      setFailed(errors);
      setProgress(null);
    })();

    return () => {
      alive = false;
    };
  }, [cities]);

  const maxTotal = Math.max(1, ...markers.map((m) => m.total));

  return (
    <div className="space-y-3">
      {progress && (
        <div className="card flex items-center gap-3 p-3 text-sm text-stone-700">
          <div className="animate-pulse text-lg">📍</div>
          <div className="flex-1">
            <div>
              Geocoding {progress.done} / {progress.total} …
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
          ⚠ Keine Koordinaten gefunden für: {failed.join(", ")}
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
            const radius = scaleRadius(m.total, maxTotal);
            const color = colorForProgress(calledPct);
            return (
              <CircleMarker
                key={m.ort}
                center={[m.lat, m.lng]}
                radius={radius}
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: 0.55,
                  weight: 2,
                }}
              >
                <Tooltip direction="top" offset={[0, -radius]} sticky>
                  <div className="text-sm">
                    <div className="font-semibold">{m.ort}</div>
                    <div>📋 {m.total} Leads</div>
                    <div>
                      📞 {m.called} angerufen ({Math.round(calledPct * 100)}%)
                    </div>
                    <div>✅ {m.touched} bearbeitet</div>
                    <div className="text-xs text-stone-500">
                      {m.services.slice(0, 5).join(", ")}
                      {m.services.length > 5 && ` +${m.services.length - 5}`}
                    </div>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* Legende */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500">
        <div className="flex items-center gap-2">
          <span className="font-medium text-stone-700">Größe:</span>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-stone-400" />
            <div className="h-3 w-3 rounded-full bg-stone-400" />
            <div className="h-4 w-4 rounded-full bg-stone-400" />
          </div>
          <span>= mehr Leads</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-stone-700">Farbe:</span>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-full bg-rose-500" />
            <span>noch nicht angerufen</span>
            <div className="ml-3 h-3 w-3 rounded-full bg-amber-500" />
            <span>angefangen</span>
            <div className="ml-3 h-3 w-3 rounded-full bg-emerald-500" />
            <span>fast komplett</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function scaleRadius(value: number, max: number): number {
  // Min 6, Max 28 — logarithmische Skala, damit große Städte nicht alles dominieren
  const min = 6;
  const cap = 28;
  if (value <= 0) return min;
  const norm = Math.log(1 + value) / Math.log(1 + max);
  return min + norm * (cap - min);
}

function colorForProgress(pct: number): string {
  // 0% = rot, 50% = orange, 100% = grün
  if (pct < 0.15) return "#e11d48"; // rose-600
  if (pct < 0.5) return "#f59e0b"; // amber-500
  if (pct < 0.85) return "#84cc16"; // lime-500
  return "#10b981"; // emerald-500
}
