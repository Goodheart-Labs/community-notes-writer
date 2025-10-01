import type { VerifiableFactResult } from "../pipeline/checkVerifiableFacts";

export interface PipelineResult {
  post: any;
  verifiableFactResult?: VerifiableFactResult;
  keywords?: any;
  searchContextResult?: any;
  noteResult?: any;
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
