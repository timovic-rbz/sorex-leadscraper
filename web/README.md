# Lead Scraper – Vercel + Supabase

Next.js + TypeScript Frontend für Lead-Scraping (OSM + Google Places) mit E-Mail-Crawler und Supabase-Postgres-Lead-DB.

## Setup

### 1. Supabase-Projekt anlegen

1. https://supabase.com → neues Projekt erstellen
2. **Project Settings → Database → Connection string** öffnen
3. Mode **"Transaction"** wählen (Port 6543 – Serverless-tauglich)
4. String kopieren, sieht so aus:
   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```

Das Schema (`lists` + `leads`-Tabelle) wird beim ersten API-Request automatisch via `CREATE TABLE IF NOT EXISTS` angelegt. Du musst nichts manuell migrieren.

### 2. Deploy auf Vercel

1. Repo zu GitHub pushen
2. Vercel-Projekt anlegen, Root Directory auf `web` setzen
3. Env-Vars setzen:
   - `DATABASE_URL` → Supabase-Connection-String (siehe oben)
   - `APP_PASSWORD` → Passwort für den Login
   - `APP_SECRET` → beliebiger Random-String (signiert das Auth-Cookie)
   - `GOOGLE_API_KEY` → optional, sonst nur OSM verfügbar
4. Deploy → fertig.

### 3. Lokal

```bash
cd web
npm install
cp .env.example .env.local
# DATABASE_URL eintragen (Supabase-String von oben)
npm run dev   # http://localhost:3000
```

Ohne `DATABASE_URL` läuft die Suche, aber Listen + "In Liste speichern" funktionieren nicht.

## Architektur

```
web/
├── app/
│   ├── page.tsx              # UI: Tabs (Einzelsuche / Bulk)
│   ├── lists/                # Listen-Übersicht + Kanban-Detail
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── search/route.ts   # POST: OSM/Google + E-Mail-Crawl
│       ├── leads/route.ts    # GET/POST: Liste, upsert, check
│       ├── leads/[uid]/route.ts  # PATCH: Status/Notes/Calls
│       ├── lists/route.ts
│       └── lists/[id]/route.ts
└── lib/
    ├── types.ts
    ├── osm.ts                # Nominatim + Overpass
    ├── google-places.ts      # Places API (New)
    ├── email-crawler.ts      # cheerio + parallel fetch
    ├── auth.ts               # HMAC-Cookie Single-Password-Auth
    └── db.ts                 # Supabase Postgres via postgres.js
```

## Vercel-spezifische Constraints

- **Function-Timeout**: Hobby = 10s, Pro = 60s. Eine `/api/search` mit 20 Leads + E-Mail-Crawl liegt typischerweise bei 5–8s. Bei Timeout: Lead-Anzahl runter oder E-Mail-Crawl off.
- **Bulk-Suche**: Frontend ruft `/api/search` sequentiell pro Kombination auf – jeder Request hat sein eigenes Timeout-Budget.
- **DB-Pooling**: Wir nutzen Supabases **Transaction-Pooler** (Port 6543, `prepare: false`). Damit funktioniert jeder Serverless-Cold-Start ohne offene Connections zu leaken.

## Migration von Vercel-Postgres

Falls dieses Projekt vorher auf `@vercel/postgres` lief: einfach `POSTGRES_URL` → `DATABASE_URL` umbenennen und auf den Supabase-String setzen. Das Schema ist identisch, der Code in `lib/db.ts` legt es bei Bedarf neu an.

## Erweiterungen

- Supabase Auth (Magic-Link / Google) statt Single-Password
- Row-Level-Security falls Team-Mitglieder dazukommen
- Streaming-Response für `/api/search` mit Server-Sent Events → Live-Progress beim E-Mail-Crawl
- Webseiten-Qualitäts-Scoring (HTTPS, Generator-Meta, Copyright-Jahr) → bessere Vorqualifikation für Webdesign-Outreach
