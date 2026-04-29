"""
Lead Scraper – Google Places API + E-Mail-Crawler
Streamlit Web-UI

Setup:
    pip install -r requirements.txt
    cp .env.example .env  # dann GOOGLE_API_KEY eintragen
    streamlit run app.py
"""
from __future__ import annotations

import os
import re
import time
import io
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, urlparse

import requests
import pandas as pd
import streamlit as st
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

# =============================================================================
# CONFIG
# =============================================================================

API_KEY = os.getenv("GOOGLE_API_KEY", "")
PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"

# OpenStreetMap (kostenlos, kein Key)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OSM_USER_AGENT = "soreleads-scraper/1.0 (https://github.com/local-lead-tool)"

# Felder die wir von der Places API anfordern (kostenrelevant!)
SEARCH_FIELDS = (
    "places.id,places.displayName,places.formattedAddress,"
    "places.nationalPhoneNumber,places.internationalPhoneNumber,"
    "places.websiteUri,places.rating,places.userRatingCount,"
    "places.googleMapsUri,places.regularOpeningHours,"
    "places.primaryTypeDisplayName,places.businessStatus"
)

EMAIL_REGEX = re.compile(
    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
)

# E-Mails die wir ignorieren (Tracking, Beispiele, Tech-Provider)
EMAIL_BLACKLIST = (
    "sentry.io", "wixpress.com", "example.com", "domain.com",
    "youremail", "name@", "email@", ".png", ".jpg", ".gif",
    "wordpress.com", "godaddy", "@2x", "@3x"
)

# Pfade die typischerweise Kontaktdaten enthalten
CONTACT_PATHS = ["kontakt", "contact", "impressum", "ueber-uns", "about"]


# =============================================================================
# PLACES API
# =============================================================================

def search_places(query: str, max_results: int = 60) -> list[dict]:
    """
    Text Search via Places API (New).
    Pagination mit nextPageToken für bis zu 60 Ergebnisse.
    """
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": SEARCH_FIELDS + ",nextPageToken",
    }

    results = []
    page_token = None

    while len(results) < max_results:
        body = {
            "textQuery": query,
            "languageCode": "de",
            "regionCode": "DE",
            "pageSize": min(20, max_results - len(results)),
        }
        if page_token:
            body["pageToken"] = page_token

        resp = requests.post(PLACES_SEARCH_URL, json=body, headers=headers, timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(f"Places API Fehler {resp.status_code}: {resp.text}")

        data = resp.json()
        results.extend(data.get("places", []))

        page_token = data.get("nextPageToken")
        if not page_token:
            break
        time.sleep(2)  # Token braucht ~2s bis er aktiv wird

    return results[:max_results]


# =============================================================================
# OPENSTREETMAP (Nominatim + Overpass) – kostenlose Alternative
# =============================================================================

def geocode_city(city: str) -> tuple[float, float, float, float] | None:
    """Stadt → bounding box (south, west, north, east) via Nominatim."""
    params = {"q": city, "format": "json", "limit": 1, "countrycodes": "de"}
    headers = {"User-Agent": OSM_USER_AGENT}
    r = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=15)
    if r.status_code != 200:
        raise RuntimeError(f"Nominatim Fehler {r.status_code}: {r.text[:200]}")
    data = r.json()
    if not data:
        return None
    bb = data[0]["boundingbox"]  # [south, north, west, east] als Strings
    return (float(bb[0]), float(bb[2]), float(bb[1]), float(bb[3]))


def search_osm(service: str, city: str, max_results: int = 60) -> list[dict]:
    """
    OSM Overpass-Suche: POIs in der Stadt-bbox, deren name ODER Kategorie-Tag
    (shop/amenity/office/craft/healthcare) den Suchbegriff enthält.
    """
    bbox = geocode_city(city)
    if not bbox:
        raise RuntimeError(f"Stadt '{city}' nicht gefunden (Nominatim).")

    south, west, north, east = bbox
    bbox_str = f"{south},{west},{north},{east}"
    # Overpass-Regex: Sonderzeichen escapen
    safe = re.escape(service)

    query = f"""
[out:json][timeout:30];
(
  nwr["name"~"{safe}",i]({bbox_str});
  nwr["shop"~"{safe}",i]({bbox_str});
  nwr["amenity"~"{safe}",i]({bbox_str});
  nwr["office"~"{safe}",i]({bbox_str});
  nwr["craft"~"{safe}",i]({bbox_str});
  nwr["healthcare"~"{safe}",i]({bbox_str});
);
out center tags {max_results * 2};
"""
    r = requests.post(
        OVERPASS_URL,
        data={"data": query},
        headers={"User-Agent": OSM_USER_AGENT},
        timeout=90,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Overpass Fehler {r.status_code}: {r.text[:200]}")

    elements = r.json().get("elements", [])

    # Dedupe: gleicher Name + gleiche Adresse → nur einmal
    seen = set()
    unique = []
    for el in elements:
        tags = el.get("tags", {})
        name = tags.get("name", "").strip().lower()
        if not name:
            continue
        key = (name, tags.get("addr:street", ""), tags.get("addr:housenumber", ""))
        if key in seen:
            continue
        seen.add(key)
        unique.append(el)

    return unique[:max_results]


def osm_to_row(el: dict, email: str = "") -> dict:
    """OSM-Element → flaches Dict im gleichen Schema wie Google Places."""
    tags = el.get("tags", {})

    # Adresse zusammenbauen
    street = tags.get("addr:street", "")
    if street and tags.get("addr:housenumber"):
        street = f"{street} {tags['addr:housenumber']}"
    locality = f"{tags.get('addr:postcode', '')} {tags.get('addr:city', '')}".strip()
    address = ", ".join(p for p in [street, locality] if p)

    # Koordinaten → Google Maps Link
    lat = el.get("lat") or el.get("center", {}).get("lat")
    lon = el.get("lon") or el.get("center", {}).get("lon")
    maps_url = f"https://www.google.com/maps?q={lat},{lon}" if lat and lon else ""

    category = (
        tags.get("shop") or tags.get("amenity") or tags.get("office")
        or tags.get("craft") or tags.get("healthcare") or ""
    )

    return {
        "Firmenname": tags.get("name", ""),
        "Telefon": tags.get("phone") or tags.get("contact:phone", ""),
        "Adresse": address,
        "Webseite": tags.get("website") or tags.get("contact:website", ""),
        "E-Mail": email or tags.get("email") or tags.get("contact:email", ""),
        "Bewertung": "",
        "Anzahl Reviews": 0,
        "Google Maps": maps_url,
        "Öffnungszeiten": tags.get("opening_hours", ""),
        "Kategorie": category,
        "Status": "OPERATIONAL",
    }


# =============================================================================
# E-MAIL CRAWLER
# =============================================================================

def fetch_html(url: str, timeout: int = 10) -> str | None:
    """HTML einer URL holen, mit User-Agent und Timeout."""
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }
        r = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
        if r.status_code == 200 and "text/html" in r.headers.get("Content-Type", ""):
            return r.text
    except Exception:
        return None
    return None


def extract_emails(html: str) -> set[str]:
    """E-Mails aus HTML extrahieren – mailto-Links + Regex."""
    if not html:
        return set()

    soup = BeautifulSoup(html, "html.parser")
    emails = set()

    # mailto-Links
    for link in soup.find_all("a", href=True):
        if link["href"].lower().startswith("mailto:"):
            email = link["href"][7:].split("?")[0].strip()
            emails.add(email.lower())

    # Plain-Text via Regex
    text = soup.get_text(" ")
    for match in EMAIL_REGEX.findall(text):
        emails.add(match.lower())

    # Auch obfuskierte Varianten ("at" / "(at)" / "[at]")
    obf_text = re.sub(r"\s*[\[\(]?\s*(at|@)\s*[\]\)]?\s*", "@", text, flags=re.IGNORECASE)
    obf_text = re.sub(r"\s*[\[\(]?\s*(dot|punkt)\s*[\]\)]?\s*", ".", obf_text, flags=re.IGNORECASE)
    for match in EMAIL_REGEX.findall(obf_text):
        emails.add(match.lower())

    # Blacklist filtern
    return {e for e in emails if not any(b in e for b in EMAIL_BLACKLIST)}


def find_contact_links(html: str, base_url: str) -> list[str]:
    """Links zu typischen Kontakt-/Impressum-Seiten finden."""
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    found = set()

    for link in soup.find_all("a", href=True):
        href = link["href"].lower()
        if any(p in href for p in CONTACT_PATHS):
            full_url = urljoin(base_url, link["href"])
            # Nur gleiche Domain
            if urlparse(full_url).netloc == urlparse(base_url).netloc:
                found.add(full_url)

    return list(found)[:3]  # Maximal 3 Unterseiten crawlen


def scrape_email(website: str) -> str:
    """
    Vollständiger E-Mail-Workflow für eine Website:
    1. Startseite crawlen
    2. Wenn keine E-Mail → Kontakt/Impressum-Links finden
    3. Diese Unterseiten crawlen
    """
    if not website:
        return ""

    # Startseite
    html = fetch_html(website)
    emails = extract_emails(html or "")

    # Wenn nix gefunden → Unterseiten probieren
    if not emails and html:
        for sub_url in find_contact_links(html, website):
            sub_html = fetch_html(sub_url)
            emails.update(extract_emails(sub_html or ""))
            if emails:
                break

    if not emails:
        return ""

    # Beste E-Mail wählen: bevorzuge info@, kontakt@, hello@
    priority = ["info@", "kontakt@", "hallo@", "hello@", "office@", "mail@"]
    sorted_emails = sorted(
        emails,
        key=lambda e: next((i for i, p in enumerate(priority) if e.startswith(p)), 99)
    )
    return sorted_emails[0]


# =============================================================================
# SQLITE – persistente Lead-DB für Dedup über mehrere Suchen
# =============================================================================

DB_PATH = Path(__file__).parent / "leads.db"

# Mapping: dict-key (DataFrame-Spalte) → DB-Spalte
DB_COLUMNS = [
    ("uid", "uid"),
    ("source", "source"),
    ("Firmenname", "firmenname"),
    ("Telefon", "telefon"),
    ("Adresse", "adresse"),
    ("Webseite", "webseite"),
    ("E-Mail", "email"),
    ("Bewertung", "bewertung"),
    ("Anzahl Reviews", "anzahl_reviews"),
    ("Google Maps", "google_maps"),
    ("Öffnungszeiten", "oeffnungszeiten"),
    ("Kategorie", "kategorie"),
    ("Status", "status"),
    ("ort", "ort"),
    ("dienstleistung", "dienstleistung"),
]


def db_init() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS leads (
            uid TEXT PRIMARY KEY,
            source TEXT,
            firmenname TEXT,
            telefon TEXT,
            adresse TEXT,
            webseite TEXT,
            email TEXT,
            bewertung TEXT,
            anzahl_reviews INTEGER,
            google_maps TEXT,
            oeffnungszeiten TEXT,
            kategorie TEXT,
            status TEXT,
            ort TEXT,
            dienstleistung TEXT,
            first_seen TEXT,
            last_seen TEXT,
            contacted INTEGER DEFAULT 0
        )
        """
    )
    conn.commit()
    conn.close()


def db_existing_uids(uids: list[str]) -> set[str]:
    if not uids:
        return set()
    conn = sqlite3.connect(DB_PATH)
    placeholders = ",".join("?" * len(uids))
    cur = conn.execute(f"SELECT uid FROM leads WHERE uid IN ({placeholders})", uids)
    found = {r[0] for r in cur.fetchall()}
    conn.close()
    return found


def db_upsert(rows: list[dict]) -> tuple[int, int]:
    """Insert oder update; gibt (neu, aktualisiert) zurück."""
    if not rows:
        return (0, 0)
    existing = db_existing_uids([r["uid"] for r in rows])
    new_count = sum(1 for r in rows if r["uid"] not in existing)
    updated_count = len(rows) - new_count

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    conn = sqlite3.connect(DB_PATH)
    for r in rows:
        values = tuple(r.get(src, "") for src, _ in DB_COLUMNS)
        conn.execute(
            f"""
            INSERT INTO leads ({", ".join(c for _, c in DB_COLUMNS)}, first_seen, last_seen)
            VALUES ({", ".join("?" * len(DB_COLUMNS))}, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET
                last_seen = excluded.last_seen,
                email     = COALESCE(NULLIF(excluded.email, ''), leads.email),
                telefon   = COALESCE(NULLIF(excluded.telefon, ''), leads.telefon),
                webseite  = COALESCE(NULLIF(excluded.webseite, ''), leads.webseite)
            """,
            values + (now, now),
        )
    conn.commit()
    conn.close()
    return (new_count, updated_count)


def db_count() -> int:
    conn = sqlite3.connect(DB_PATH)
    n = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
    conn.close()
    return n


def db_load_all() -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM leads ORDER BY last_seen DESC", conn)
    conn.close()
    return df


# =============================================================================
# DATA TRANSFORMATION
# =============================================================================

def format_opening_hours(hours_obj: dict | None) -> str:
    """Öffnungszeiten in lesbares Format bringen."""
    if not hours_obj:
        return ""
    descriptions = hours_obj.get("weekdayDescriptions", [])
    return " | ".join(descriptions) if descriptions else ""


def place_to_row(place: dict, email: str = "") -> dict:
    """Place-Objekt zu flachem Dict für DataFrame."""
    return {
        "Firmenname": place.get("displayName", {}).get("text", ""),
        "Telefon": place.get("internationalPhoneNumber") or place.get("nationalPhoneNumber", ""),
        "Adresse": place.get("formattedAddress", ""),
        "Webseite": place.get("websiteUri", ""),
        "E-Mail": email,
        "Bewertung": place.get("rating", ""),
        "Anzahl Reviews": place.get("userRatingCount", 0),
        "Google Maps": place.get("googleMapsUri", ""),
        "Öffnungszeiten": format_opening_hours(place.get("regularOpeningHours")),
        "Kategorie": place.get("primaryTypeDisplayName", {}).get("text", ""),
        "Status": place.get("businessStatus", ""),
    }


# =============================================================================
# SUCH-PIPELINE (Single + Bulk teilen sich diese Funktion)
# =============================================================================

def fetch_and_enrich(
    ort: str,
    dienstleistung: str,
    use_google: bool,
    max_results: int,
    scrape_emails: bool,
    progress_cb=None,
) -> pd.DataFrame:
    """
    Komplette Pipeline für eine (Ort × Dienstleistung)-Suche:
    Places-API → Filter → parallel E-Mails → DataFrame mit uid/source/ort/dienstleistung.
    """
    if use_google:
        raw_places = search_places(f"{dienstleistung} in {ort}", max_results=max_results)
        active = [p for p in raw_places if p.get("businessStatus", "OPERATIONAL") == "OPERATIONAL"]
        crawl_targets = [(f"google:{p['id']}", p.get("websiteUri", "")) for p in active]
    else:
        active = search_osm(dienstleistung, ort, max_results=max_results)
        crawl_targets = [
            (
                f"osm:{p['type']}/{p['id']}",
                p.get("tags", {}).get("website") or p.get("tags", {}).get("contact:website", ""),
            )
            for p in active
        ]

    # E-Mails parallel crawlen
    emails_map: dict[str, str] = {}
    if scrape_emails:
        targets_with_web = [(uid, web) for uid, web in crawl_targets if web]
        total = len(targets_with_web)
        if total:
            done = 0
            with ThreadPoolExecutor(max_workers=8) as executor:
                future_map = {
                    executor.submit(scrape_email, web): uid for uid, web in targets_with_web
                }
                for future in as_completed(future_map):
                    uid = future_map[future]
                    try:
                        emails_map[uid] = future.result()
                    except Exception:
                        emails_map[uid] = ""
                    done += 1
                    if progress_cb:
                        progress_cb(done, total)

    # Rows bauen + Meta-Spalten
    source = "google" if use_google else "osm"
    rows = []
    for (uid, _web), p in zip(crawl_targets, active):
        if use_google:
            row = place_to_row(p, emails_map.get(uid, ""))
        else:
            row = osm_to_row(p, emails_map.get(uid, ""))
        row["uid"] = uid
        row["source"] = source
        row["ort"] = ort
        row["dienstleistung"] = dienstleistung
        rows.append(row)

    return pd.DataFrame(rows)


def annotate_dedup(df: pd.DataFrame) -> pd.DataFrame:
    """Spalte 'Status DB' anhängen: 🆕 neu vs 🔁 bekannt."""
    if df.empty:
        return df
    existing = db_existing_uids(df["uid"].tolist())
    df = df.copy()
    df["Status DB"] = df["uid"].apply(lambda u: "🔁 bekannt" if u in existing else "🆕 neu")
    return df


# =============================================================================
# STREAMLIT UI
# =============================================================================

DISPLAY_COLS = [
    "Status DB", "Firmenname", "Telefon", "E-Mail", "Webseite", "Adresse",
    "Bewertung", "Anzahl Reviews", "Kategorie", "Öffnungszeiten",
    "Google Maps", "ort", "dienstleistung", "source",
]


def render_results(df: pd.DataFrame, filename_base: str) -> None:
    """Stats, Tabelle, Auto-Save, CSV/XLSX-Export – wiederverwendbar."""
    if df.empty:
        st.warning("Keine Ergebnisse.")
        return

    df = annotate_dedup(df)

    # Sortierung: bekannt nach unten, dann nach Reviews
    df = df.sort_values(
        ["Status DB", "Anzahl Reviews"], ascending=[True, False], na_position="last"
    ).reset_index(drop=True)
    df.index += 1

    n_new = (df["Status DB"] == "🆕 neu").sum()
    n_known = (df["Status DB"] == "🔁 bekannt").sum()

    st.subheader(f"📊 {len(df)} Leads ({n_new} neu, {n_known} bekannt)")

    s1, s2, s3, s4 = st.columns(4)
    s1.metric("Mit Telefon", int(df["Telefon"].astype(bool).sum()))
    s2.metric("Mit Webseite", int(df["Webseite"].astype(bool).sum()))
    s3.metric("Mit E-Mail", int(df["E-Mail"].astype(bool).sum()))
    bewertungen = pd.to_numeric(df["Bewertung"], errors="coerce").dropna()
    s4.metric("Ø Bewertung", f"{bewertungen.mean():.2f}" if len(bewertungen) else "-")

    only_new = st.checkbox("Nur neue Leads anzeigen", value=False, key=f"new_{filename_base}")
    view = df[df["Status DB"] == "🆕 neu"] if only_new else df

    cols_present = [c for c in DISPLAY_COLS if c in view.columns]
    st.dataframe(view[cols_present], use_container_width=True, height=500)

    # In DB speichern
    save_col, _ = st.columns([1, 3])
    with save_col:
        if st.button("💾 In Lead-DB speichern", key=f"save_{filename_base}", type="primary"):
            new_count, upd_count = db_upsert(df.to_dict("records"))
            st.success(f"✅ {new_count} neu, {upd_count} aktualisiert. DB enthält jetzt {db_count()} Leads.")

    # Export
    st.subheader("💾 Export")
    e1, e2 = st.columns(2)
    export_df = view[cols_present]
    with e1:
        csv_data = export_df.to_csv(index=True, sep=";", encoding="utf-8-sig")
        st.download_button(
            "⬇️ CSV herunterladen",
            csv_data,
            file_name=f"{filename_base}.csv",
            mime="text/csv",
            use_container_width=True,
            key=f"csv_{filename_base}",
        )
    with e2:
        xlsx_buffer = io.BytesIO()
        with pd.ExcelWriter(xlsx_buffer, engine="openpyxl") as writer:
            export_df.to_excel(writer, sheet_name="Leads", index=True)
        st.download_button(
            "⬇️ Excel herunterladen",
            xlsx_buffer.getvalue(),
            file_name=f"{filename_base}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True,
            key=f"xlsx_{filename_base}",
        )


def render_single(use_google: bool, scrape_emails: bool) -> None:
    col1, col2, col3 = st.columns([2, 2, 1])
    with col1:
        ort = st.text_input("Ort", placeholder="z.B. Düsseldorf", key="single_ort")
    with col2:
        dienstleistung = st.text_input("Dienstleistung", placeholder="z.B. Kosmetikstudio", key="single_dl")
    with col3:
        max_results = st.number_input("Max. Leads", 5, 60, 20, step=5, key="single_max")

    if not st.button("🚀 Leads suchen", type="primary", use_container_width=True, key="single_btn"):
        return
    if not ort or not dienstleistung:
        st.warning("Bitte Ort und Dienstleistung angeben.")
        return

    source_name = "Google Places" if use_google else "OpenStreetMap"
    progress_email = st.progress(0.0, text="⏳ Suche läuft...")

    def cb(done: int, total: int) -> None:
        progress_email.progress(done / total, text=f"📧 E-Mails: {done}/{total}")

    with st.spinner(f"🔍 Suche '{dienstleistung}' in '{ort}' über {source_name}..."):
        try:
            df = fetch_and_enrich(ort, dienstleistung, use_google, max_results, scrape_emails, cb)
        except RuntimeError as e:
            st.error(str(e))
            return
    progress_email.empty()

    st.success(f"✅ {len(df)} Treffer von {source_name}")
    fname = f"leads_{ort}_{dienstleistung}".lower().replace(" ", "_")
    render_results(df, fname)


def render_bulk(use_google: bool, scrape_emails: bool) -> None:
    st.caption("Sucht alle Kombinationen von Orten × Dienstleistungen.")
    c1, c2, c3 = st.columns([2, 2, 1])
    with c1:
        orte_text = st.text_area(
            "Orte (eine pro Zeile)",
            placeholder="Düsseldorf\nKöln\nLangenfeld",
            height=150,
            key="bulk_orte",
        )
    with c2:
        dl_text = st.text_area(
            "Dienstleistungen (eine pro Zeile)",
            placeholder="Kosmetikstudio\nFriseur",
            height=150,
            key="bulk_dl",
        )
    with c3:
        max_results = st.number_input("Max. Leads pro Suche", 5, 60, 20, step=5, key="bulk_max")

    orte = [o.strip() for o in orte_text.splitlines() if o.strip()]
    dls = [d.strip() for d in dl_text.splitlines() if d.strip()]
    n_combos = len(orte) * len(dls)
    if n_combos:
        st.info(f"⏱ {n_combos} Suchen werden ausgeführt ({len(orte)} Orte × {len(dls)} Dienstleistungen).")

    if not st.button(
        f"🚀 Bulk-Suche starten ({n_combos} Kombinationen)",
        type="primary",
        use_container_width=True,
        disabled=n_combos == 0,
        key="bulk_btn",
    ):
        return

    overall = st.progress(0.0, text="⏳ Bulk-Suche läuft...")
    detail = st.empty()
    all_dfs: list[pd.DataFrame] = []
    errors: list[str] = []

    for i, (ort, dl) in enumerate([(o, d) for o in orte for d in dls]):
        detail.write(f"🔍 [{i+1}/{n_combos}] {dl} in {ort}")
        try:
            df = fetch_and_enrich(ort, dl, use_google, max_results, scrape_emails, None)
            all_dfs.append(df)
        except RuntimeError as e:
            errors.append(f"{dl} in {ort}: {e}")
        overall.progress((i + 1) / n_combos, text=f"⏳ Bulk-Suche: {i+1}/{n_combos}")

    overall.empty()
    detail.empty()

    if errors:
        with st.expander(f"⚠️ {len(errors)} Fehler"):
            for err in errors:
                st.text(err)

    if not all_dfs:
        st.warning("Keine Ergebnisse.")
        return

    combined = pd.concat(all_dfs, ignore_index=True).drop_duplicates(subset=["uid"])
    st.success(f"✅ {len(combined)} eindeutige Leads aus {n_combos} Suchen.")
    render_results(combined, "leads_bulk")


def render_db() -> None:
    n = db_count()
    st.subheader(f"💾 Lead-DB ({n} Einträge)")
    if n == 0:
        st.info("Noch keine Leads gespeichert. Suche etwas und klicke 'In Lead-DB speichern'.")
        return

    df = db_load_all()
    st.dataframe(df, use_container_width=True, height=500)

    e1, e2 = st.columns(2)
    with e1:
        csv_data = df.to_csv(index=False, sep=";", encoding="utf-8-sig")
        st.download_button(
            "⬇️ Komplette DB als CSV",
            csv_data,
            file_name="leads_db.csv",
            mime="text/csv",
            use_container_width=True,
        )
    with e2:
        xlsx_buffer = io.BytesIO()
        with pd.ExcelWriter(xlsx_buffer, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name="Leads", index=False)
        st.download_button(
            "⬇️ Komplette DB als Excel",
            xlsx_buffer.getvalue(),
            file_name="leads_db.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True,
        )


def main():
    st.set_page_config(page_title="Lead Scraper", page_icon="🎯", layout="wide")
    db_init()

    st.title("🎯 Lead Scraper")
    st.caption("OpenStreetMap (kostenlos) oder Google Places + E-Mail-Crawler + persistente Lead-DB")

    # Globale Optionen (für alle Tabs)
    with st.container():
        c1, c2 = st.columns([2, 1])
        with c1:
            source = st.radio(
                "Datenquelle",
                ["OpenStreetMap (kostenlos)", "Google Places (kostenpflichtig)"],
                horizontal=True,
                help="OSM: gratis, kein Key, schwächere Abdeckung. Google: ~3ct/Lead, deutlich vollständiger.",
            )
        with c2:
            scrape_emails = st.checkbox("E-Mails crawlen", value=True)

    use_google = source.startswith("Google")
    if use_google and not API_KEY:
        st.error("❌ GOOGLE_API_KEY fehlt in .env – bitte eintragen oder OSM wählen.")
        st.stop()

    tab_single, tab_bulk, tab_db = st.tabs(
        ["🔍 Einzelsuche", "📦 Bulk-Suche", f"💾 Lead-DB ({db_count()})"]
    )
    with tab_single:
        render_single(use_google, scrape_emails)
    with tab_bulk:
        render_bulk(use_google, scrape_emails)
    with tab_db:
        render_db()


if __name__ == "__main__":
    main()
