export function isSubset<T>(candidate: Set<T>, container: Set<T>) {
  for (const value of candidate) {
    if (!container.has(value)) return false;
  }
  return true;
}

export function isFirstPlaceDominated(
  entryId: string,
  currentScoreByEntryId: Map<string, number>,
  remainingTeamIdsByEntryId: Map<string, Set<string>>,
) {
  const currentScore = currentScoreByEntryId.get(entryId) ?? 0;
  const remainingTeams = remainingTeamIdsByEntryId.get(entryId) ?? new Set<string>();

  for (const [otherEntryId, otherScore] of currentScoreByEntryId) {
    if (otherEntryId === entryId || otherScore <= currentScore) continue;
    const otherRemainingTeams = remainingTeamIdsByEntryId.get(otherEntryId) ?? new Set<string>();
    if (isSubset(remainingTeams, otherRemainingTeams)) return true;
  }

  return false;
}
