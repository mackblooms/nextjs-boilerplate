const SCHOOL_NAME_OVERRIDES: Record<string, string> = {
  "siena saints": "Siena",
  "tcu horned frogs": "TCU",
  "ohio state buckeyes": "Ohio State",
  "northern iowa panthers": "Northern Iowa",
  "purdue boilermakers": "Purdue",
  "texas longhorns": "Texas",
  "connecticut huskies": "UConn",
  connecticut: "UConn",
  "uconn huskies": "UConn",
  "miami hurricanes": "Miami (FL)",
  miami: "Miami (FL)",
  "miami redhawks": "Miami (OH)",
  "miami oh": "Miami (OH)",
  "miami ohio": "Miami (OH)",
  "miami oh redhawks": "Miami (OH)",
  "miami ohio redhawks": "Miami (OH)",
};

const MASCOT_SUFFIXES = [
  "fighting illini",
  "fighting irish",
  "crimson tide",
  "blue devils",
  "red raiders",
  "blue raiders",
  "horned frogs",
  "golden eagles",
  "golden flashes",
  "wolf pack",
  "red hawks",
  "tar heels",
  "boilermakers",
  "buckeyes",
  "panthers",
  "huskies",
  "hurricanes",
  "redhawks",
  "wildcats",
  "bulldogs",
  "jayhawks",
  "cardinals",
  "cavaliers",
  "mountaineers",
  "musketeers",
  "pirates",
  "razorbacks",
  "seminoles",
  "terrapins",
  "volunteers",
  "wolfpack",
  "wolverines",
  "longhorns",
  "bruins",
  "trojans",
  "spartans",
  "knights",
  "rebels",
  "raiders",
  "tigers",
  "eagles",
  "hawks",
  "owls",
  "bears",
  "saints",
  "aggies",
  "gators",
  "hoosiers",
  "cougars",
  "bruins",
  "badgers",
  "boilers",
  "cyclones",
  "lobos",
  "mustangs",
  "spartans",
  "vikings",
  "gaels",
];

const TOKENIZED_MASCOT_SUFFIXES = MASCOT_SUFFIXES
  .map((value) => value.split(" ").map(normalizeToken).filter(Boolean))
  .filter((parts) => parts.length > 0)
  .sort((a, b) => b.length - a.length);

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeSchoolKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[()'.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSuffix(words: string[], suffix: string[]): boolean {
  if (suffix.length > words.length) return false;
  const start = words.length - suffix.length;
  for (let i = 0; i < suffix.length; i += 1) {
    if (words[start + i] !== suffix[i]) return false;
  }
  return true;
}

export function toSchoolDisplayName(value: string | null | undefined): string {
  const raw = (value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";

  const directOverride = SCHOOL_NAME_OVERRIDES[normalizeSchoolKey(raw)];
  if (directOverride) return directOverride;

  const rawWords = raw.split(" ").filter(Boolean);
  const normalizedWords = rawWords.map(normalizeToken);

  for (const suffix of TOKENIZED_MASCOT_SUFFIXES) {
    if (!hasSuffix(normalizedWords, suffix)) continue;
    const trimmed = rawWords.slice(0, rawWords.length - suffix.length).join(" ").trim();
    if (!trimmed) break;
    const trimmedOverride = SCHOOL_NAME_OVERRIDES[normalizeSchoolKey(trimmed)];
    return trimmedOverride ?? trimmed;
  }

  return raw;
}
