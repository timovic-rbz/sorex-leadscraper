# Lead Scraper – Vercel Edition

Next.js + TypeScript Frontend für Lead-Scraping (OSM + Google Places) mit E-Mail-Crawler und Postgres-Lead-DB. Deploybar auf Vercel ohne Server-Setup.

## Deploy auf Vercel (3 Schritte)

1. **Repo zu GitHub pushen** (oder Vercel CLI nutzen).
2. **Vercel-Projekt anlegen** und auf das Repo zeigen lassen.
   - **Root Directory** auf `web` setzen.
   - Framework wird automatisch als Next.js erkannt.
3. **Vercel Postgres anbinden** (Storage-Tab → Create → Postgres). Vercel injiziert `POSTGRES_URL` automatisch.
   - Optional: `GOOGLE_API_KEY` als Env-Var setzen, falls du Google Places nutzen willst.

Erster Deploy → fertig. Beim ersten Request wird die `leads`-Tabelle automatisch angelegt.

## Lokal

```bash
cd web
npm install
cp .env.example .env.local
# POSTGRES_URL eintragen (z.B. lokales Postgres oder Neon-Connection-String)
npm run dev   # http://localhost:3000
```

Ohne `POSTGRES_URL` läuft die Suche, aber der DB-Tab und „In DB speichern" funktionieren nicht.

## Architektur

```
web/
├── app/
│   ├── page.tsx              # UI: Tabs (Einzel / Bulk / DB)
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── search/route.ts   # POST: OSM/Google + E-Mail-Crawl
│       └── leads/route.ts    # GET: Liste, POST: upsert/check
└── lib/
    ├── types.ts
    ├── osm.ts                # Nominatim + Overpass
    ├── google-places.ts      # Places API (New)
    ├── email-crawler.ts      # cheerio + parallel fetch
    └── db.ts                 # @vercel/postgres
```

## Vercel-spezifische Constraints

- **Function-Timeout**: Hobby = 10s, Pro = 60s. Eine einzelne `/api/search` mit 20 Leads + E-Mail-Crawl liegt typischerweise bei 5–8s. Bei Timeout: Lead-Anzahl runter oder E-Mail-Crawl off.
- **Bulk-Suche**: Frontend ruft `/api/search` sequentiell pro Kombination auf – jeder Request hat sein eigenes Timeout-Budget, kein Risiko durch Bulk-Größe.
- **Filesystem**: read-only/ephemer. Daher Postgres statt SQLite.

## Erweiterungen

- Auth (NextAuth + Google/GitHub) damit nicht jeder die Lead-DB sieht
- `contacted`-Flag im DB-Tab toggle-bar machen (Spalte gibt's schon)
- Streaming-Response für `/api/search` mit Server-Sent Events → Live-Progress beim E-Mail-Crawl
