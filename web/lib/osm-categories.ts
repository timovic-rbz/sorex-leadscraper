/**
 * Mapping deutscher Branchen-Suchbegriffe → OSM-Tag-Kombinationen.
 *
 * Hintergrund: OSM hat keine 1:1-Tags für deutsche Branchenbegriffe.
 * Z.B. "Nagelstudio" existiert nicht als shop=*-Wert; Nagelstudios sind
 * meistens als shop=beauty getagged. Dieses Mapping übersetzt zwischen
 * deutschen Suchbegriffen und den realen OSM-Tags.
 *
 * Format pro Eintrag:
 *   tags:    Liste von [tag, value]-Paaren die als ODER kombiniert werden
 *   nameAlt: Zusätzliche Substring-Patterns die im POI-Namen gesucht werden
 *            (z.B. "nail" für englische Schreibweise)
 *
 * Match-Logik: längster passender Schlüssel gewinnt
 *   "kosmetikstudio" matcht "kosmetikstudio" (nicht "kosmetik")
 */
export interface CategoryMatch {
  tags?: Array<[string, string]>;
  nameAlt?: string[];
}

export const CATEGORY_MAP: Record<string, CategoryMatch> = {
  // ===== Beauty =====
  nagelstudio: { tags: [["shop", "beauty"]], nameAlt: ["nagel", "nail"] },
  nagel: { tags: [["shop", "beauty"]], nameAlt: ["nagel", "nail"] },
  kosmetikstudio: { tags: [["shop", "beauty"], ["shop", "cosmetics"]] },
  kosmetik: { tags: [["shop", "beauty"], ["shop", "cosmetics"]] },
  wimpern: { tags: [["shop", "beauty"]], nameAlt: ["wimpern", "lash", "brow"] },
  friseur: { tags: [["shop", "hairdresser"]] },
  frisör: { tags: [["shop", "hairdresser"]] },
  barbershop: { tags: [["shop", "hairdresser"]], nameAlt: ["barber"] },
  barber: { tags: [["shop", "hairdresser"]], nameAlt: ["barber"] },
  sonnenstudio: { tags: [["leisure", "tanning_salon"]], nameAlt: ["sonnen", "tanning"] },
  tattoostudio: { tags: [["shop", "tattoo"]] },
  tattoo: { tags: [["shop", "tattoo"]] },
  piercing: { tags: [["shop", "piercing"], ["shop", "tattoo"]] },
  massage: { tags: [["shop", "massage"], ["healthcare", "massage_therapist"]] },
  spa: { tags: [["leisure", "spa"]], nameAlt: ["spa", "wellness"] },

  // ===== Health =====
  zahnarzt: { tags: [["amenity", "dentist"], ["healthcare", "dentist"]] },
  arzt: { tags: [["amenity", "doctors"], ["healthcare", "doctor"]] },
  hausarzt: { tags: [["amenity", "doctors"], ["healthcare", "doctor"]] },
  physiotherapie: { tags: [["healthcare", "physiotherapist"]] },
  physio: { tags: [["healthcare", "physiotherapist"]] },
  apotheke: { tags: [["amenity", "pharmacy"]] },
  tierarzt: { tags: [["amenity", "veterinary"]] },
  psychotherapie: { tags: [["healthcare", "psychotherapist"]] },
  heilpraktiker: { tags: [["healthcare", "alternative"]] },
  hebamme: { tags: [["healthcare", "midwife"]] },
  optiker: { tags: [["shop", "optician"]] },
  hörgeräte: { tags: [["shop", "hearing_aids"]] },

  // ===== Office / Service =====
  rechtsanwalt: { tags: [["office", "lawyer"]] },
  anwalt: { tags: [["office", "lawyer"]] },
  steuerberater: { tags: [["office", "tax_advisor"]] },
  notar: { tags: [["office", "notary"]] },
  architekt: { tags: [["office", "architect"]] },
  immobilienmakler: { tags: [["office", "estate_agent"]] },
  immobilien: { tags: [["office", "estate_agent"]] },
  makler: { tags: [["office", "estate_agent"], ["office", "insurance"]] },
  versicherung: { tags: [["office", "insurance"]] },
  unternehmensberatung: { tags: [["office", "consulting"]] },
  werbeagentur: { tags: [["office", "advertising_agency"]] },

  // ===== Food =====
  restaurant: { tags: [["amenity", "restaurant"]] },
  café: { tags: [["amenity", "cafe"]] },
  cafe: { tags: [["amenity", "cafe"]] },
  bar: { tags: [["amenity", "bar"]] },
  kneipe: { tags: [["amenity", "pub"]] },
  pub: { tags: [["amenity", "pub"]] },
  bäckerei: { tags: [["shop", "bakery"]] },
  baeckerei: { tags: [["shop", "bakery"]] },
  konditorei: { tags: [["shop", "pastry"]] },
  metzgerei: { tags: [["shop", "butcher"]] },
  pizzeria: { tags: [["amenity", "restaurant"]], nameAlt: ["pizza", "pizzeria"] },
  imbiss: { tags: [["amenity", "fast_food"]] },
  döner: { tags: [["amenity", "fast_food"]], nameAlt: ["döner", "doener", "kebab"] },
  eisdiele: { tags: [["amenity", "ice_cream"], ["shop", "ice_cream"]] },

  // ===== Crafts/Trades =====
  klempner: { tags: [["craft", "plumber"]] },
  elektriker: { tags: [["craft", "electrician"]] },
  schlosser: { tags: [["craft", "metal_construction"], ["craft", "blacksmith"]] },
  tischler: { tags: [["craft", "carpenter"]] },
  schreiner: { tags: [["craft", "carpenter"]] },
  maler: { tags: [["craft", "painter"]] },
  fliesenleger: { tags: [["craft", "tiler"]] },
  dachdecker: { tags: [["craft", "roofer"]] },
  zimmerer: { tags: [["craft", "carpenter"]] },
  gärtner: { tags: [["craft", "gardener"]] },
  reinigung: { tags: [["shop", "laundry"], ["shop", "dry_cleaning"]] },
  gebäudereinigung: { tags: [], nameAlt: ["reinigung", "cleaning"] },

  // ===== Auto =====
  autowerkstatt: { tags: [["shop", "car_repair"], ["amenity", "car_repair"]] },
  kfz: { tags: [["shop", "car_repair"], ["amenity", "car_repair"]] },
  autohaus: { tags: [["shop", "car"]] },
  tankstelle: { tags: [["amenity", "fuel"]] },
  reifenhandel: { tags: [["shop", "tyres"]] },
  fahrschule: { tags: [["amenity", "driving_school"]] },

  // ===== Fitness/Leisure =====
  fitnessstudio: { tags: [["leisure", "fitness_centre"]] },
  fitness: { tags: [["leisure", "fitness_centre"]] },
  yoga: { tags: [["leisure", "fitness_centre"]], nameAlt: ["yoga"] },
  kampfsport: { tags: [["leisure", "fitness_centre"], ["sport", "martial_arts"]] },
  tanzschule: { tags: [["amenity", "dancing_school"], ["leisure", "dance"]] },

  // ===== Retail =====
  supermarkt: { tags: [["shop", "supermarket"]] },
  blumenladen: { tags: [["shop", "florist"]] },
  blumen: { tags: [["shop", "florist"]] },
  buchhandlung: { tags: [["shop", "books"]] },
  juwelier: { tags: [["shop", "jewelry"]] },
  schmuck: { tags: [["shop", "jewelry"]] },
  spielwaren: { tags: [["shop", "toys"]] },
  möbel: { tags: [["shop", "furniture"]] },
  kleidung: { tags: [["shop", "clothes"]] },
  boutique: { tags: [["shop", "clothes"]], nameAlt: ["boutique"] },
};

/**
 * Längster passender Substring-Match. Liefert leeres Mapping wenn nichts passt
 * (Caller fällt dann auf ursprüngliche Such-über-alle-Tags-Logik zurück).
 */
export function matchCategory(query: string): CategoryMatch {
  const q = query.toLowerCase();
  const sortedKeys = Object.keys(CATEGORY_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (q.includes(key)) return CATEGORY_MAP[key];
  }
  return {};
}
