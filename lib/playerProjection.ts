export type PlayerProjectionInput = {
  playerName: string;
  previousPPG: number;
  previousRPG: number;
  previousAPG: number;
  previous3P: number;
  previousFG: number;
  previousFT: number;
  previousBPG: number;
  previousSPG: number;
  minutesPerGame: number;
  momentum: number;
  situation: number;
  coachImpact: number;
  systemFit: number;
  growthPotential: number;
  opportunity: number;
};

export type PlayerProjectionOutput = {
  playerName: string;
  projectedPPG: number;
  projectedRPG: number;
  projectedAPG: number;
  projected3P: number;
  projectedFG: number;
  projectedFT: number;
  projectedBPG: number;
  projectedSPG: number;
  formulaDetails: {
    ppg: string;
    rpg: string;
    apg: string;
    threePoint: string;
    fieldGoal: string;
    freeThrow: string;
    blocks: string;
    steals: string;
    scoreSummary: string;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function buildMultiplier(input: PlayerProjectionInput) {
  const momentum = clamp(input.momentum, 0, 1);
  const situation = clamp(input.situation, 0, 1);
  const coach = clamp(input.coachImpact, 0, 1);
  const system = clamp(input.systemFit, 0, 1);
  const growth = clamp(input.growthPotential, 0, 1);
  const opportunity = clamp(input.opportunity, 0, 1);

  const minutesFactor = clamp(input.minutesPerGame / 32, 0.6, 1.2);
  const volume = 1 + momentum * 0.15 + growth * 0.14 + opportunity * 0.12 + situation * 0.1 + coach * 0.08 + system * 0.06 + (minutesFactor - 1) * 0.12;
  const quality = 1 + momentum * 0.09 + coach * 0.07 + system * 0.06 + growth * 0.05;
  const defense = 1 + momentum * 0.08 + coach * 0.07 + system * 0.06 + growth * 0.05;

  return {
    momentum,
    situation,
    coach,
    system,
    growth,
    opportunity,
    minutesFactor,
    volume,
    quality,
    defense,
  };
}

export function projectPlayerStats(input: PlayerProjectionInput): PlayerProjectionOutput {
  const factors = buildMultiplier(input);

  const projectedPPG = clamp(input.previousPPG * factors.volume * factors.quality, 0, 45);
  const projectedRPG = clamp(input.previousRPG * (1 + factors.momentum * 0.12 + factors.growth * 0.12 + factors.situation * 0.1 + factors.coach * 0.08 + factors.system * 0.07), 0, 18);
  const projectedAPG = clamp(input.previousAPG * (1 + factors.momentum * 0.14 + factors.growth * 0.13 + factors.situation * 0.12 + factors.coach * 0.1 + factors.system * 0.08), 0, 16);
  const projectedBPG = clamp(input.previousBPG * (1 + factors.momentum * 0.16 + factors.growth * 0.14 + factors.coach * 0.1 + factors.system * 0.08), 0, 5);
  const projectedSPG = clamp(input.previousSPG * (1 + factors.momentum * 0.15 + factors.growth * 0.13 + factors.coach * 0.1 + factors.system * 0.08), 0, 5);

  const projected3P = clamp(
    input.previous3P + 0.03 * (factors.momentum + factors.coach + factors.system + factors.growth * 0.75 + factors.situation * 0.5),
    0.1,
    0.6
  );
  const projectedFG = clamp(
    input.previousFG + 0.03 * (factors.momentum + factors.coach + factors.system + factors.growth * 0.7 + factors.situation * 0.5),
    0.32,
    0.65
  );
  const projectedFT = clamp(
    input.previousFT + 0.02 * (factors.momentum + factors.coach + factors.growth * 0.5 + factors.situation * 0.3),
    0.55,
    0.95
  );

  const scoreSummary = [
    `Minutes factor = minutesPerGame / 32 => ${factors.minutesFactor.toFixed(3)}`,
    `Volume factor = 1 + momentum*0.15 + growth*0.14 + opportunity*0.12 + situation*0.10 + coach*0.08 + system*0.06 + minutesFactor*0.12 = ${factors.volume.toFixed(3)}`,
    `Quality factor = 1 + momentum*0.09 + coach*0.07 + system*0.06 + growth*0.05 = ${factors.quality.toFixed(3)}`,
  ].join("\n");

  return {
    playerName: input.playerName,
    projectedPPG: Number(projectedPPG.toFixed(1)),
    projectedRPG: Number(projectedRPG.toFixed(1)),
    projectedAPG: Number(projectedAPG.toFixed(1)),
    projected3P: Number(projected3P.toFixed(3)),
    projectedFG: Number(projectedFG.toFixed(3)),
    projectedFT: Number(projectedFT.toFixed(3)),
    projectedBPG: Number(projectedBPG.toFixed(1)),
    projectedSPG: Number(projectedSPG.toFixed(1)),
    formulaDetails: {
      ppg: `PPG projection = previousPPG × volumeFactor × qualityFactor\n` +
        `= ${input.previousPPG.toFixed(1)} × ${factors.volume.toFixed(3)} × ${factors.quality.toFixed(3)} = ${projectedPPG.toFixed(1)}`,
      rpg: `RPG projection = previousRPG × (1 + 0.12*mom + 0.12*growth + 0.10*situation + 0.08*coach + 0.07*system)\n` +
        `= ${input.previousRPG.toFixed(1)} × ${(1 + factors.momentum * 0.12 + factors.growth * 0.12 + factors.situation * 0.10 + factors.coach * 0.08 + factors.system * 0.07).toFixed(3)} = ${projectedRPG.toFixed(1)}`,
      apg: `APG projection = previousAPG × (1 + 0.14*mom + 0.13*growth + 0.12*situation + 0.10*coach + 0.08*system)\n` +
        `= ${input.previousAPG.toFixed(1)} × ${(1 + factors.momentum * 0.14 + factors.growth * 0.13 + factors.situation * 0.12 + factors.coach * 0.10 + factors.system * 0.08).toFixed(3)} = ${projectedAPG.toFixed(1)}`,
      threePoint: `3P% projection = previous3P + 0.03 × (mom + coach + system + 0.75*growth + 0.5*situation)\n` +
        `= ${formatPct(input.previous3P)} + 0.03 × ${(factors.momentum + factors.coach + factors.system + factors.growth * 0.75 + factors.situation * 0.5).toFixed(3)} = ${formatPct(projected3P)}`,
      fieldGoal: `FG% projection = previousFG + 0.03 × (mom + coach + system + 0.7*growth + 0.5*situation)\n` +
        `= ${formatPct(input.previousFG)} + 0.03 × ${(factors.momentum + factors.coach + factors.system + factors.growth * 0.7 + factors.situation * 0.5).toFixed(3)} = ${formatPct(projectedFG)}`,
      freeThrow: `FT% projection = previousFT + 0.02 × (mom + coach + 0.5*growth + 0.3*situation)\n` +
        `= ${formatPct(input.previousFT)} + 0.02 × ${(factors.momentum + factors.coach + factors.growth * 0.5 + factors.situation * 0.3).toFixed(3)} = ${formatPct(projectedFT)}`,
      blocks: `BPG projection = previousBPG × (1 + 0.16*mom + 0.14*growth + 0.10*coach + 0.08*system)\n` +
        `= ${input.previousBPG.toFixed(1)} × ${(1 + factors.momentum * 0.16 + factors.growth * 0.14 + factors.coach * 0.10 + factors.system * 0.08).toFixed(3)} = ${projectedBPG.toFixed(1)}`,
      steals: `SPG projection = previousSPG × (1 + 0.15*mom + 0.13*growth + 0.10*coach + 0.08*system)\n` +
        `= ${input.previousSPG.toFixed(1)} × ${(1 + factors.momentum * 0.15 + factors.growth * 0.13 + factors.coach * 0.10 + factors.system * 0.08).toFixed(3)} = ${projectedSPG.toFixed(1)}`,
      scoreSummary,
    },
  };
}

export const defaultProjectionInput: PlayerProjectionInput = {
  playerName: "Sample Player",
  previousPPG: 16.4,
  previousRPG: 4.8,
  previousAPG: 3.1,
  previous3P: 0.34,
  previousFG: 0.47,
  previousFT: 0.79,
  previousBPG: 0.7,
  previousSPG: 1.1,
  minutesPerGame: 31,
  momentum: 0.75,
  situation: 0.7,
  coachImpact: 0.6,
  systemFit: 0.65,
  growthPotential: 0.7,
  opportunity: 0.6,
};
