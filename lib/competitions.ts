export type CompetitionSlug = "march-madness" | "world-cup";

export type Competition = {
  slug: CompetitionSlug;
  sport: string;
  name: string;
  shortName: string;
  description: string;
  href: string;
  status: "live" | "coming-soon";
  statusLabel: string;
  draftLockIso: string;
};

export const competitions: Competition[] = [
  {
    slug: "march-madness",
    sport: "NCAAB",
    name: "march madness",
    shortName: "march madness",
    description: "draft teams by value, join pools, and follow the full ncaa tournament.",
    href: "/",
    status: "live",
    statusLabel: "open",
    draftLockIso: "2026-03-19T16:15:00.000Z",
  },
  {
    slug: "world-cup",
    sport: "soccer",
    name: "world cup",
    shortName: "world cup",
    description: "build a world cup squad and compete through the group stage and knockout rounds.",
    href: "/world-cup",
    status: "live",
    statusLabel: "open",
    draftLockIso: "2026-06-11T19:00:00.000Z",
  },
];

export function getCompetition(slug: CompetitionSlug) {
  return competitions.find((competition) => competition.slug === slug)!;
}

export const DEFAULT_COMPETITION_SLUG: CompetitionSlug = "march-madness";

export function normalizeCompetitionSlug(value: string | null | undefined): CompetitionSlug {
  return value === "world-cup" ? "world-cup" : DEFAULT_COMPETITION_SLUG;
}

export function competitionQuery(slug: CompetitionSlug) {
  return slug === DEFAULT_COMPETITION_SLUG ? "" : `?competition=${slug}`;
}

export function competitionPath(path: string, slug: CompetitionSlug) {
  return `${path}${competitionQuery(slug)}`;
}
