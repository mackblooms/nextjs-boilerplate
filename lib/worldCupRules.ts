export const WORLD_CUP_DRAFT_TIERS = [
  { name: "Diamond", cost: 24, teams: ["Spain"] },
  { name: "Platinum", cost: 22, teams: ["Argentina", "France"] },
  { name: "Gold", cost: 20, teams: ["Brazil", "England", "Germany", "Netherlands", "Portugal"] },
  { name: "Silver", cost: 17, teams: ["Belgium", "Canada", "Colombia", "Croatia", "Ecuador", "Mexico", "Norway", "Switzerland", "Turkiye"] },
  { name: "Bronze", cost: 14, teams: ["Australia", "Austria", "Czechia", "IR Iran", "Japan", "Korea Republic", "Morocco", "Paraguay", "Senegal", "Uruguay", "USA"] },
  { name: "Value", cost: 12, teams: ["Algeria", "Bosnia and Herzegovina", "Cote d'Ivoire", "Egypt", "Jordan", "New Zealand", "Panama", "Scotland", "Sweden", "Uzbekistan"] },
  { name: "Longshot", cost: 10, teams: ["Cabo Verde", "Congo DR", "Curacao", "Haiti", "Saudi Arabia", "South Africa", "Tunisia"] },
  { name: "Moonshot", cost: 7, teams: ["Ghana", "Iraq", "Qatar"] },
] as const;

export const WORLD_CUP_TEAM_COSTS = WORLD_CUP_DRAFT_TIERS.flatMap((tier) =>
  tier.teams.map((team) => [team, tier.cost] as const),
);

export function getWorldCupTierForCost(cost: number) {
  return WORLD_CUP_DRAFT_TIERS.find((tier) => tier.cost === cost);
}

export const WORLD_CUP_SCORING_EVENTS = [
  ["Group-stage win", 6],
  ["Group-stage draw", 2],
  ["Advance from group to Round of 32", 12],
  ["Win Round of 32 and reach Round of 16", 18],
  ["Win Round of 16 and reach quarterfinal", 30],
  ["Win quarterfinal and reach semifinal", 48],
  ["Win semifinal and reach final", 72],
  ["Win final and become champion", 100],
] as const;

export const WORLD_CUP_VALUE_RUN_BONUS_EVENTS = [
  ["Reach Round of 16", "+8"],
  ["Reach quarterfinal", "+16"],
  ["Reach semifinal", "+28"],
  ["Reach final", "+42"],
  ["Become champion", "+60"],
] as const;

export const WORLD_CUP_BREAKOUT_BONUS_EVENTS = [
  ["Advance from group", "+24"],
] as const;
