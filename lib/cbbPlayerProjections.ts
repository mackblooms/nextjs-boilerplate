export type CbbPlayerProjection = {
  id: string;
  sourceRow: number;
  rank: number | null;
  player: string;
  currentTeam: string | null;
  previousTeam: string | null;
  position: string | null;
  classYear: string | null;
  playerType: string | null;
  heightInches: number | null;
  age: number | null;
  recruitingRank: number | null;
  recruitingTier: string | null;
  historicalBbpr: number | null;
  starScore: number | null;
  difficulty: number | null;
  historicalRating: number | null;
  projectedStarter: string | null;
  projectedRole: number | null;
  opportunityChange: number | null;
  offensiveBurden: number | null;
  opportunityScore: number | null;
  entryTalentGrade: number | null;
  nbaProjectionScore: number | null;
  upsideToolsScore: number | null;
  talentScore: number | null;
  developmentScore: number | null;
  projectionScore: number | null;
  projectedBbpr: number | null;
  projectionInputCompleteness: number | null;
  baseConfidence: number | null;
  confidenceScore: number | null;
  confidenceGrade: string | null;
  needsReview: boolean;
  projectionNotes: string | null;
  lastUpdated: string | null;
};

export type CbbProjectionPayload = {
  generatedAt: string;
  sourceWorkbook: string;
  model: {
    version: string | null;
    rankingSeason: string | null;
    historicalDataSeason: string | null;
    historicalDataSources: string | null;
    purpose: string | null;
    historicalMetric: string | null;
    projectionMetric: string | null;
    finalMetric: string | null;
    historicalPlayerBlend: string | null;
    newcomerBlend: string | null;
    historicalWeights: Record<string, number>;
    notes: string[];
  };
  summary: {
    playerCount: number;
    projectedCount: number;
    needsReviewCount: number;
    byType: Record<string, number>;
    byClass: Record<string, number>;
  };
  players: CbbPlayerProjection[];
};

export type CbbResearchSuggestion = {
  projectedStarter: string | null;
  projectedRole: number | null;
  opportunityChange: number | null;
  offensiveBurden: number | null;
  opportunityScore: number | null;
  nbaProjectionScore: number | null;
  upsideToolsScore: number | null;
  talentScore: number | null;
  projectionScore: number | null;
  projectedBbpr: number | null;
  confidenceScore: number | null;
  confidenceGrade: string | null;
  needsReview: boolean;
};

export type CbbResearchEvidence = {
  source: string;
  url: string;
  notes: string;
};

export type CbbResearchPlayer = {
  sourceRow: number;
  player: string;
  currentTeam: string | null;
  previousTeam: string | null;
  status: string;
  historicalRating: number | null;
  developmentScore: number | null;
  suggested: CbbResearchSuggestion;
  researchSummary: string;
  teamContext: Record<string, string>;
  evidence: CbbResearchEvidence[];
};

export type CbbResearchBatch = {
  batchId: string;
  createdAt: string;
  sourceSheet: string;
  scope: string;
  method: string[];
  formulas: Record<string, string>;
  teamContextRubric: Record<string, string>;
  players: CbbResearchPlayer[];
};

export type CbbResearchPlayerWithState = CbbResearchPlayer & {
  batchId: string;
  applied: boolean;
  currentProjection: Pick<
    CbbPlayerProjection,
    | "projectedStarter"
    | "projectedRole"
    | "opportunityChange"
    | "offensiveBurden"
    | "opportunityScore"
    | "nbaProjectionScore"
    | "upsideToolsScore"
    | "talentScore"
    | "projectionScore"
    | "projectedBbpr"
    | "playerType"
    | "confidenceScore"
    | "confidenceGrade"
    | "needsReview"
    | "projectionInputCompleteness"
    | "lastUpdated"
  > | null;
};

export type CbbResearchPayload = {
  generatedAt: string;
  batchCount: number;
  playerCount: number;
  appliedCount: number;
  pendingCount: number;
  batches: Array<Pick<CbbResearchBatch, "batchId" | "createdAt" | "scope"> & { playerCount: number }>;
  players: CbbResearchPlayerWithState[];
};
