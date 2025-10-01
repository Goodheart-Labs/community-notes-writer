import type { VerifiableFactResult } from "../pipeline/filterPostsForVerifiableClaims";

export interface PipelineStep {
  stepNumber: number;
  stepName: string;
  completed: boolean;
  passed?: boolean;
  score?: number;
  reasoning?: string;
  data?: any;
}

export interface PipelineResult {
  post: any;
  stepsExecuted: PipelineStep[];
  failedAtStep?: string;
  verifiableFactResult?: VerifiableFactResult;
  keywords?: any;
  searchContextResult?: any;
  noteResult?: any;
  characterLimitResult?: { valid: boolean; characterCount: number; reasoning: string };
  scores?: {
    url: number;
    positive: number;
    disagreement: number;
  };
  filterDetails?: {
    url: { score: number; reasoning: string };
    positive: { score: number; reasoning: string };
    disagreement: { score: number; reasoning: string };
  };
  helpfulnessScore?: number;
  helpfulnessReasoning?: string;
  xApiScore?: number;
  xApiSuccess?: boolean;
  allScoresPassed: boolean;
  skipReason?: string;
}
