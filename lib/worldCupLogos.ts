import { normalizeWorldCupTeamKey } from "./worldCupTeamAliases";

const TEAM_FLAG_CODES: Record<string, string> = {
  Algeria: "dz",
  Argentina: "ar",
  Australia: "au",
  Austria: "at",
  Belgium: "be",
  "Bosnia and Herzegovina": "ba",
  Brazil: "br",
  Canada: "ca",
  "Cabo Verde": "cv",
  Colombia: "co",
  "Congo DR": "cd",
  Croatia: "hr",
  Curaçao: "cw",
  Czechia: "cz",
  "Côte d'Ivoire": "ci",
  Ecuador: "ec",
  Egypt: "eg",
  England: "gb-eng",
  France: "fr",
  Germany: "de",
  Ghana: "gh",
  Haiti: "ht",
  "IR Iran": "ir",
  Iraq: "iq",
  Japan: "jp",
  Jordan: "jo",
  "Korea Republic": "kr",
  Mexico: "mx",
  Morocco: "ma",
  Netherlands: "nl",
  "New Zealand": "nz",
  Norway: "no",
  Panama: "pa",
  Paraguay: "py",
  Portugal: "pt",
  Qatar: "qa",
  "Saudi Arabia": "sa",
  Scotland: "gb-sct",
  Senegal: "sn",
  "South Africa": "za",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Tunisia: "tn",
  Türkiye: "tr",
  Uruguay: "uy",
  USA: "us",
  Uzbekistan: "uz",
};

const TEAM_FLAG_CODES_BY_KEY = Object.fromEntries(
  Object.entries(TEAM_FLAG_CODES).map(([name, code]) => [normalizeWorldCupTeamKey(name), code]),
);

export function worldCupLogoUrl(name: string | null | undefined, existingLogoUrl?: string | null) {
  if (existingLogoUrl) return existingLogoUrl;
  const flagCode = name ? TEAM_FLAG_CODES[name] ?? TEAM_FLAG_CODES_BY_KEY[normalizeWorldCupTeamKey(name)] : null;
  return flagCode ? `https://flagcdn.com/w80/${flagCode}.png` : null;
}
