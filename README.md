# Lead Scraper

Streamlit-Tool zum Scrapen lokaler Business-Leads via Google Places API + automatischem E-Mail-Crawl von Webseiten.

## Features

- Suche nach `Ort` + `Dienstleistung` (z.B. "Düsseldorf" + "Kosmetikstudio")
- Bis zu 60 Leads pro Suche
- Datenfelder: Firmenname, Telefon, Adresse, Webseite, **E-Mail**, Bewertung, Anzahl Reviews, Google Maps URL, Öffnungszeiten, Kategorie
- E-Mail-Extraktion über Startseite + Impressum/Kontakt-Unterseiten (parallel, 8 Threads)
- Erkennt obfuskierte E-Mails (`info [at] domain.de`)
- Sortiert nach Anzahl Bewertungen (= Sichtbarkeit)
- Export als CSV (Excel-kompatibel mit `;` und UTF-8 BOM) **und** XLSX

## Setup

### 1. Google API Key besorgen

1. https://console.cloud.google.com → neues Projekt anlegen
2. **APIs & Services → Library** → "Places API (New)" aktivieren
3. **APIs & Services → Credentials** → API Key erstellen
4. Empfehlung: Key auf "Places API (New)" beschränken

Kosten: ~32$ pro 1000 Leads (Text Search + Place Details). Google gibt **200$ Free Credit pro Monat** = ca. 6000 Leads gratis.

### 2. Installation

```bash
cd lead_scraper
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. API Key eintragen

```bash
cp .env.example .env
# .env öffnen und GOOGLE_API_KEY eintragen
```

### 4. Starten

```bash
streamlit run app.py
```

Öffnet sich automatisch im Browser auf http://localhost:8501

## Nutzung

1. **Ort** eingeben: `Langenfeld`
2. **Dienstleistung** eingeben: `Kosmetikstudio`
3. **Max. Leads** wählen: 5–60
4. **E-Mails extrahieren** an/aus (langsamer wenn an, ~3-10s pro Lead)
5. **Leads suchen** → Tabelle erscheint → CSV/Excel herunterladen

## Hinweise

- **Telefonnummern**: kommen direkt von Google Business Profile (verifiziert)
- **E-Mails**: gescraped von Webseiten – nicht jede Firma hat eine sichtbare E-Mail. Erfolgsquote in der Praxis ~50-70%.
- **Pagination**: Places API gibt max. 60 Ergebnisse pro Query. Für mehr Leads → Suche nach Stadtteilen aufteilen.
- **Rate Limiting**: kein Problem bei normaler Nutzung. Google erlaubt sehr hohe QPS.

## Erweiterungen (Ideen)

- Direktes Schreiben in CRM (HubSpot, Pipedrive) via API
- Duplikats-Check gegen bereits kontaktierte Leads (SQLite-DB)
- Outreach-Integration: WhatsApp/E-Mail-Sequenz aus Tabelle starten
- Bulk-Run: Liste von Städten × Dienstleistungen abarbeiten
