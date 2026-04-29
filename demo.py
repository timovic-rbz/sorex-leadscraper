"""Demo: OSM-Lead-Suche ohne Streamlit, kompatibel mit Python 3.9."""
from __future__ import annotations

import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OSM_USER_AGENT = "soreleads-scraper/1.0 (demo)"
EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
EMAIL_BLACKLIST = ("sentry.io", "wixpress.com", "example.com", "youremail",
                   "name@", "email@", ".png", ".jpg", "@2x", "@3x")
CONTACT_PATHS = ["kontakt", "contact", "impressum", "ueber-uns", "about"]


def geocode_city(city):
    r = requests.get(NOMINATIM_URL,
                     params={"q": city, "format": "json", "limit": 1, "countrycodes": "de"},
                     headers={"User-Agent": OSM_USER_AGENT}, timeout=15)
    data = r.json()
    if not data:
        return None
    bb = data[0]["boundingbox"]
    return (float(bb[0]), float(bb[2]), float(bb[1]), float(bb[3]))


def search_osm(service, city, max_results=30):
    bbox = geocode_city(city)
    if not bbox:
        raise RuntimeError(f"Stadt '{city}' nicht gefunden")
    south, west, north, east = bbox
    bbox_str = f"{south},{west},{north},{east}"
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
    r = requests.post(OVERPASS_URL, data={"data": query},
                      headers={"User-Agent": OSM_USER_AGENT}, timeout=90)
    if r.status_code != 200:
        raise RuntimeError(f"Overpass {r.status_code}: {r.text[:200]}")
    elements = r.json().get("elements", [])
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


def fetch_html(url, timeout=10):
    try:
        r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"},
                         timeout=timeout, allow_redirects=True)
        if r.status_code == 200 and "text/html" in r.headers.get("Content-Type", ""):
            return r.text
    except Exception:
        return None
    return None


def extract_emails(html):
    if not html:
        return set()
    soup = BeautifulSoup(html, "html.parser")
    emails = set()
    for link in soup.find_all("a", href=True):
        if link["href"].lower().startswith("mailto:"):
            emails.add(link["href"][7:].split("?")[0].strip().lower())
    text = soup.get_text(" ")
    for m in EMAIL_REGEX.findall(text):
        emails.add(m.lower())
    obf = re.sub(r"\s*[\[\(]?\s*(at|@)\s*[\]\)]?\s*", "@", text, flags=re.IGNORECASE)
    obf = re.sub(r"\s*[\[\(]?\s*(dot|punkt)\s*[\]\)]?\s*", ".", obf, flags=re.IGNORECASE)
    for m in EMAIL_REGEX.findall(obf):
        emails.add(m.lower())
    return {e for e in emails if not any(b in e for b in EMAIL_BLACKLIST)}


def find_contact_links(html, base_url):
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    found = set()
    for link in soup.find_all("a", href=True):
        href = link["href"].lower()
        if any(p in href for p in CONTACT_PATHS):
            full = urljoin(base_url, link["href"])
            if urlparse(full).netloc == urlparse(base_url).netloc:
                found.add(full)
    return list(found)[:3]


def scrape_email(website):
    if not website:
        return ""
    html = fetch_html(website)
    emails = extract_emails(html or "")
    if not emails and html:
        for sub in find_contact_links(html, website):
            emails.update(extract_emails(fetch_html(sub) or ""))
            if emails:
                break
    if not emails:
        return ""
    priority = ["info@", "kontakt@", "hallo@", "hello@", "office@", "mail@"]
    return sorted(emails, key=lambda e: next((i for i, p in enumerate(priority) if e.startswith(p)), 99))[0]


def osm_to_row(el, email=""):
    tags = el.get("tags", {})
    street = tags.get("addr:street", "")
    if street and tags.get("addr:housenumber"):
        street = f"{street} {tags['addr:housenumber']}"
    locality = f"{tags.get('addr:postcode', '')} {tags.get('addr:city', '')}".strip()
    return {
        "Firmenname": tags.get("name", ""),
        "Telefon": tags.get("phone") or tags.get("contact:phone", ""),
        "Adresse": ", ".join(p for p in [street, locality] if p),
        "Webseite": tags.get("website") or tags.get("contact:website", ""),
        "E-Mail": email or tags.get("email") or tags.get("contact:email", ""),
        "Kategorie": tags.get("shop") or tags.get("amenity") or tags.get("office")
                     or tags.get("craft") or tags.get("healthcare") or "",
    }


if __name__ == "__main__":
    ort = sys.argv[1] if len(sys.argv) > 1 else "Düsseldorf"
    dl = sys.argv[2] if len(sys.argv) > 2 else "Kosmetik"
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 15

    print(f"\n=== Suche '{dl}' in '{ort}' (max {n}) via OpenStreetMap ===\n")
    elements = search_osm(dl, ort, max_results=n)
    print(f"Overpass: {len(elements)} POIs gefunden\n")

    websites = [(i, osm_to_row(el)["Webseite"]) for i, el in enumerate(elements)]
    websites_to_crawl = [(i, w) for i, w in websites if w]
    print(f"E-Mail-Crawl: {len(websites_to_crawl)} Webseiten parallel...\n")

    emails = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        future_map = {ex.submit(scrape_email, w): i for i, w in websites_to_crawl}
        for f in as_completed(future_map):
            emails[future_map[f]] = f.result()

    rows = []
    for i, el in enumerate(elements):
        row = osm_to_row(el, emails.get(i, ""))
        rows.append(row)

    # Stats
    with_phone = sum(1 for r in rows if r["Telefon"])
    with_web = sum(1 for r in rows if r["Webseite"])
    with_email = sum(1 for r in rows if r["E-Mail"])
    print(f"Stats: {len(rows)} Leads | {with_phone} Tel | {with_web} Web | {with_email} E-Mail\n")
    print("-" * 110)
    for i, r in enumerate(rows, 1):
        print(f"{i:2d}. {r['Firmenname'][:40]:<40} | {r['Telefon'][:20]:<20} | {r['E-Mail'][:35]:<35} | {r['Kategorie']}")
        if r["Adresse"]:
            print(f"    {r['Adresse']}")
        if r["Webseite"]:
            print(f"    {r['Webseite']}")
        print()
