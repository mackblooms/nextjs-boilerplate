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
};

export const competitions: Competition[] = [
  {
    slug: "march-madness",
    sport: "college basketball",
    name: "march madness",
    shortName: "march madness",
    description: "draft teams by value, join pools, and follow the full ncaa tournament.",
    href: "/",
    status: "live",
    statusLabel: "open",
  },
  {
    slug: "world-cup",
    sport: "soccer",
    name: "world cup",
    shortName: "world cup",
    description: "build a world cup squad and compete through the group stage and knockout rounds.",
    href: "/world-cup",
    status: "coming-soon",
    statusLabel: "coming soon",
  },
];

export function getCompetition(slug: CompetitionSlug) {
  return competitions.find((competition) => competition.slug === slug)!;
}
