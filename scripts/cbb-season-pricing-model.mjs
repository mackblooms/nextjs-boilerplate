// Pure planning calculations, shared by the pricing board and balance audit.
export function assignBands(teams, minimums) {
  return teams.map(t => {
    const games = t.projectedWins + t.projectedLosses;
    const winPercentage = t.projectedWins / games;
    return { ...t, games, winPercentage, bandIndex: minimums.findIndex(min => winPercentage >= min) };
  });
}

// For fixed band counts, maximize W-ratio*G and update ratio to W/G.
// Selecting the highest scores in each band solves each additive subproblem.
export function strongestSquad(teams, shape) {
  if (shape.size <= 0 || shape.counts.reduce((sum, n) => sum + n, 0) !== shape.size) {
    throw new Error('Invalid squad shape');
  }
  const groups = shape.counts.map((_, band) => teams.filter(t => t.bandIndex === band));
  if (groups.some((group, band) => group.length < shape.counts[band])) throw new Error('Insufficient teams for shape');
  let ratio = 0;
  for (let iteration = 0; iteration < 100; iteration++) {
    const picks = groups.flatMap((group, band) => [...group]
      .sort((a, b) => (b.projectedWins - ratio * b.games) - (a.projectedWins - ratio * a.games) || a.rank - b.rank)
      .slice(0, shape.counts[band]));
    const wins = picks.reduce((sum, t) => sum + t.projectedWins, 0);
    const losses = picks.reduce((sum, t) => sum + t.projectedLosses, 0);
    const next = wins / (wins + losses);
    if (Math.abs(next - ratio) < 1e-12) {
      return { counts: shape.counts, size: shape.size, wins, losses, winPercentage: next, teams: picks.map(t => t.team) };
    }
    ratio = next;
  }
  throw new Error('Ratio optimization failed to converge');
}
