export type WorldCupTeam = {
  id: string;
  name: string;
  region: string;
};

function team(id: string, name: string, group: string): WorldCupTeam {
  return { id, name, region: `Group ${group}` };
}

export const WORLD_CUP_TEAMS: WorldCupTeam[] = [
  team("wc-mexico", "Mexico", "A"),
  team("wc-south-africa", "South Africa", "A"),
  team("wc-korea-republic", "Korea Republic", "A"),
  team("wc-czechia", "Czechia", "A"),
  team("wc-canada", "Canada", "B"),
  team("wc-bosnia-and-herzegovina", "Bosnia and Herzegovina", "B"),
  team("wc-qatar", "Qatar", "B"),
  team("wc-switzerland", "Switzerland", "B"),
  team("wc-brazil", "Brazil", "C"),
  team("wc-morocco", "Morocco", "C"),
  team("wc-haiti", "Haiti", "C"),
  team("wc-scotland", "Scotland", "C"),
  team("wc-usa", "USA", "D"),
  team("wc-paraguay", "Paraguay", "D"),
  team("wc-australia", "Australia", "D"),
  team("wc-turkiye", "Türkiye", "D"),
  team("wc-germany", "Germany", "E"),
  team("wc-curacao", "Curaçao", "E"),
  team("wc-cote-divoire", "Côte d'Ivoire", "E"),
  team("wc-ecuador", "Ecuador", "E"),
  team("wc-netherlands", "Netherlands", "F"),
  team("wc-japan", "Japan", "F"),
  team("wc-sweden", "Sweden", "F"),
  team("wc-tunisia", "Tunisia", "F"),
  team("wc-belgium", "Belgium", "G"),
  team("wc-egypt", "Egypt", "G"),
  team("wc-ir-iran", "IR Iran", "G"),
  team("wc-new-zealand", "New Zealand", "G"),
  team("wc-spain", "Spain", "H"),
  team("wc-cabo-verde", "Cabo Verde", "H"),
  team("wc-saudi-arabia", "Saudi Arabia", "H"),
  team("wc-uruguay", "Uruguay", "H"),
  team("wc-france", "France", "I"),
  team("wc-senegal", "Senegal", "I"),
  team("wc-iraq", "Iraq", "I"),
  team("wc-norway", "Norway", "I"),
  team("wc-argentina", "Argentina", "J"),
  team("wc-algeria", "Algeria", "J"),
  team("wc-austria", "Austria", "J"),
  team("wc-jordan", "Jordan", "J"),
  team("wc-portugal", "Portugal", "K"),
  team("wc-colombia", "Colombia", "K"),
  team("wc-uzbekistan", "Uzbekistan", "K"),
  team("wc-congo-dr", "Congo DR", "K"),
  team("wc-england", "England", "L"),
  team("wc-croatia", "Croatia", "L"),
  team("wc-ghana", "Ghana", "L"),
  team("wc-panama", "Panama", "L"),
];
