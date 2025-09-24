import { generateObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export interface FilterScore {
  name: string;
  score: number;  // 0-1 decimal
  passed: boolean;  // score > 0.5
  reasoning: string;
}

export interface AllFilterScores {
  positive: FilterScore;
  disagreement: FilterScore;
}

const scoreSchema = z.object({
  score: z.number().min(0).max(1).describe("Score between 0 and 1"),
  reasoning: z.string().describe("One sentence explanation"),
});

// Positive claims filter (converted to decimal)
export async function checkPositiveClaims(noteText: string): Promise<FilterScore> {
  const prompt = `Evaluate if this Community Note uses positive framing (says what DID happen) rather than negative claims (what DIDN'T happen).

Note to evaluate: "${noteText}"

Consider:
- Does it say someone DIDN'T say/do something? (negative claim)
- Does it focus on what actually happened? (positive claim)
- If it references a specific fact-check backing up a negative claim, that's more acceptable

Scoring:
- 0.0: Entirely negative claims ("This didn't happen", "They never said")
- 0.3: Mostly negative with some positive
- 0.5: Mix of negative and positive
- 0.7: Mostly positive with minimal negative
- 1.0: Entirely positive claims (what DID happen)

IMPORTANT: Return ONLY a JSON object with:
- score: a number between 0 and 1
- reasoning: a single string (one sentence)`;

  try {
    const { object } = await generateObject({
      model: openrouter("anthropic/claude-3.5-sonnet"),
      schema: scoreSchema,
      prompt,
      temperature: 0.2,
      mode: 'json',
    });

    return {
      name: "Positive claims filter",
      score: object.score,
      passed: object.score > 0.5,
      reasoning: object.reasoning,
    };
  } catch (error) {
    console.error("[scoringFilters] Error in positive claims filter:", error);
    return {
      name: "Positive claims filter",
      score: 0.5,
      passed: true,
      reasoning: "Error in filter, defaulting to neutral",
    };
  }
}

// Substantive disagreement filter (converted to decimal)
export async function checkSubstantiveDisagreement(
  noteText: string, 
  postText: string
): Promise<FilterScore> {
  const prompt = `Evaluate if the Community Note substantively disagrees with the original post.

Original post: "${postText}"
Community Note: "${noteText}"

Consider:
- Do they actually contradict each other?
- Is the note just adding context or truly disagreeing?
- Is there a meaningful factual conflict?

Scoring:
- 0.0: No disagreement at all (just adding context)
- 0.3: Minor disagreement on details
- 0.5: Some disagreement but not central
- 0.7: Clear disagreement on main points
- 1.0: Complete substantive disagreement

IMPORTANT: Return ONLY a JSON object with:
- score: a number between 0 and 1
- reasoning: a single string (one sentence)`;

  try {
    const { object } = await generateObject({
      model: openrouter("anthropic/claude-3.5-sonnet"),
      schema: scoreSchema,
      prompt,
      temperature: 0.2,
      mode: 'json',
    });

    return {
      name: "Substantive disagreement filter",
      score: object.score,
      passed: object.score > 0.5,
      reasoning: object.reasoning,
    };
  } catch (error) {
    console.error("[scoringFilters] Error in disagreement filter:", error);
    return {
      name: "Substantive disagreement filter",
      score: 0.5,
      passed: true,
      reasoning: "Error in filter, defaulting to neutral",
    };
  }
}

// Run all scoring filters
export async function runScoringFilters(
  noteText: string,
  postText: string
): Promise<AllFilterScores> {
  console.log("[scoringFilters] Running scoring filters...");

  // Run filters in parallel for speed
  const [positive, disagreement] = await Promise.all([
    checkPositiveClaims(noteText),
    checkSubstantiveDisagreement(noteText, postText),
  ]);

  // Log results
  console.log(`[Filter: ${positive.name}] Score: ${positive.score.toFixed(2)} - ${positive.passed ? 'PASS' : 'FAIL'}`);
  console.log(`[Filter: ${disagreement.name}] Score: ${disagreement.score.toFixed(2)} - ${disagreement.passed ? 'PASS' : 'FAIL'}`);

  return {
    positive,
    disagreement,
  };
}

// Check if all filters pass the thresholds
export function checkAllThresholds(scores: AllFilterScores, thresholds = { positive: 0.5, disagreement: 0.5 }): boolean {
  return scores.positive.score > thresholds.positive &&
         scores.disagreement.score > thresholds.disagreement;
}