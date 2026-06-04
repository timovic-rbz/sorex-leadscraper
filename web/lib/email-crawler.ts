import * as cheerio from "cheerio";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const EMAIL_BLACKLIST = [
  "sentry.io", "wixpress.com", "example.com", "domain.com",
  "youremail", "name@", "email@", ".png", ".jpg", ".gif",
  "wordpress.com", "godaddy", "@2x", "@3x",
];

const CONTACT_PATHS = ["kontakt", "contact", "impressum", "ueber-uns", "about"];

const PRIORITY = ["info@", "kontakt@", "hallo@", "hello@", "office@", "mail@"];

// 5s pro Seite: langsamere Seiten verlieren wir, aber im 10s-Hobby-Limit
// schaffen wir damit zuverlässig 12 parallele Crawls inkl. Response-Buffer.
const FETCH_TIMEOUT_MS = 5000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    if (!(r.headers.get("content-type") ?? "").includes("text/html")) return null;
    return await r.text();
  } catch {
    return null;
  }
}

function extractEmails(html: string | null): Set<string> {
  if (!html) return new Set();
  const $ = cheerio.load(html);
  const emails = new Set<string>();

  $("a[href^='mailto:'], a[href^='MAILTO:']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const addr = href.slice(7).split("?")[0].trim().toLowerCase();
    if (addr) emails.add(addr);
  });

  const text = $.text();
  for (const m of text.matchAll(EMAIL_REGEX)) emails.add(m[0].toLowerCase());

  // Obfuskierte E-Mails: "info [at] domain [dot] de"
  const obf = text
    .replace(/\s*[\[\(]?\s*(at|@)\s*[\]\)]?\s*/gi, "@")
    .replace(/\s*[\[\(]?\s*(dot|punkt)\s*[\]\)]?\s*/gi, ".");
  for (const m of obf.matchAll(EMAIL_REGEX)) emails.add(m[0].toLowerCase());

  return new Set([...emails].filter((e) => !EMAIL_BLACKLIST.some((b) => e.includes(b))));
}

function findContactLinks(html: string | null, baseUrl: string): string[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const found = new Set<string>();
  const base = new URL(baseUrl);

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").toLowerCase();
    if (CONTACT_PATHS.some((p) => href.includes(p))) {
      try {
        const full = new URL(href, baseUrl);
        if (full.host === base.host) found.add(full.toString());
      } catch {
        /* ignore malformed URL */
      }
    }
  });

  return [...found].slice(0, 3);
}

function pickBestEmail(emails: Set<string>): string {
  if (emails.size === 0) return "";
  return [...emails].sort((a, b) => {
    const ai = PRIORITY.findIndex((p) => a.startsWith(p));
    const bi = PRIORITY.findIndex((p) => b.startsWith(p));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  })[0];
}

export async function scrapeEmail(website: string): Promise<string> {
  if (!website) return "";

  const html = await fetchHtml(website);
  let emails = extractEmails(html);

  if (emails.size === 0 && html) {
    for (const sub of findContactLinks(html, website)) {
      const subHtml = await fetchHtml(sub);
      const sub_emails = extractEmails(subHtml);
      sub_emails.forEach((e) => emails.add(e));
      if (emails.size > 0) break;
    }
  }

  return pickBestEmail(emails);
}

export async function scrapeEmailsParallel(
  items: Array<{ uid: string; website: string }>,
  options: {
    concurrency?: number;
    budgetMs?: number;
    /** Wird nach jedem fertigen Lead (egal ob Erfolg) aufgerufen. */
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<Map<string, string>> {
  const concurrency = options.concurrency ?? 8;
  // Hard deadline: damit der Vercel-Function-Timeout (10s/60s) nicht erst die ganze
  // Suche kippt. Was bis dahin geschafft ist, kommt zurück; Rest ist leerer String.
  const deadline = Date.now() + (options.budgetMs ?? 25_000);
  const total = items.length;
  let done = 0;
  const results = new Map<string, string>();
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      if (Date.now() > deadline) return;
      const item = queue.shift();
      if (!item) return;
      try {
        results.set(item.uid, await scrapeEmail(item.website));
      } catch {
        results.set(item.uid, "");
      }
      done++;
      options.onProgress?.(done, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
