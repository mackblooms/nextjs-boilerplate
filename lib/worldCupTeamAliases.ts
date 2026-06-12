const WORLD_CUP_TEAM_KEY_ALIASES: Record<string, string> = {
  "bosnia herzegovina": "bosnia and herzegovina",
  "cape verde": "cabo verde",
  "cote d ivoire": "cote divoire",
  "cote divoire": "cote divoire",
  "czech republic": "czechia",
  "democratic republic of congo": "congo dr",
  "dr congo": "congo dr",
  "d r congo": "congo dr",
  "iran": "ir iran",
  "ivory coast": "cote divoire",
  "korea": "korea republic",
  "south korea": "korea republic",
  "turkey": "turkiye",
  "u s a": "usa",
  "united states": "usa",
  "united states of america": "usa",
};

export function normalizeWorldCupTeamKey(value: string | null | undefined): string {
  const key = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return WORLD_CUP_TEAM_KEY_ALIASES[key] ?? key;
}
