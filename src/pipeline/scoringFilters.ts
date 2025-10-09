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
  partisan: FilterScore;
}

const scoreSchema = z.object({
  score: z.number().min(0).max(1).describe("Score between 0 and 1"),
  reasoning: z.string().describe("One sentence explanation"),
});

// Positive claims filter (converted to decimal)
export async function checkPositiveClaims(noteText: string): Promise<FilterScore> {
  const prompt = `Evaluate if this Community Note uses positive framing (says only what DID happen) rather than any negative claims (what DIDN'T happen).

Note to evaluate: "${noteText}"

Consider:
- Does it say someone DIDN'T say or do something at all (negative claim) 
- Does it say someone DIDN'T do something at all (negative claim)
- Does it focus on what actually happened? (positive claim)
- If it references a specific fact-check backing up a negative claim, that's more acceptable
- A claim that something something else happened is not a negative claim. If they ducks flew away, that's a positive claim. There were no ducks is a negative claim.

Scoring:
- 0.0: Any negative claims ("This didn't happen", "They never said")
- 0.3: One or more ambiguous claims "This might have happened"
- 0.5: Unclear if all claims are positive
- 0.7: All positive claims
- 1.0: Unambiguously positive claims only

IMPORTANT: Return ONLY a JSON object with:
- score: a number between 0 and 1
- reasoning: a single string (one sentence)

Examples:

Note: 

This claim is incorrect. The Supreme Court has consistently ruled that non-obscene adult pornography is protected by the First Amendment as free speech. In Stanley v. Georgia (1969), the Court established a constitutional right to possess and view pornography in private.

Score: 1.0

`;

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

// Partisan political filter - filters posts discussing both parties
export async function checkPartisan(postText: string): Promise<FilterScore> {
  const prompt = `Evaluate if this post discusses or compares both major US political parties (Democrats and Republicans).

Original post: "${postText}"

Consider:
- Does it mention both Democrats AND Republicans?
- Does it compare the two parties?
- Does it discuss both parties in any way?
- Notes that discuss both parties very rarely get approved on Community Notes

Scoring:
- 0.0: Explicitly discusses or compares both parties
- 0.3: Mentions both parties even if not comparing
- 0.5: Ambiguous or indirect reference to both
- 0.7: Only mentions one party or neither
- 1.0: Clearly only about one party or non-partisan

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
      name: "Partisan political filter",
      score: object.score,
      passed: object.score > 0.5,
      reasoning: object.reasoning,
    };
  } catch (error) {
    console.error("[scoringFilters] Error in partisan filter:", error);
    return {
      name: "Partisan political filter",
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
  const [positive, disagreement, partisan] = await Promise.all([
    checkPositiveClaims(noteText),
    checkSubstantiveDisagreement(noteText, postText),
    checkPartisan(postText),
  ]);

  // Log results
  console.log(`[Filter: ${positive.name}] Score: ${positive.score.toFixed(2)} - ${positive.passed ? 'PASS' : 'FAIL'}`);
  console.log(`[Filter: ${disagreement.name}] Score: ${disagreement.score.toFixed(2)} - ${disagreement.passed ? 'PASS' : 'FAIL'}`);
  console.log(`[Filter: ${partisan.name}] Score: ${partisan.score.toFixed(2)} - ${partisan.passed ? 'PASS' : 'FAIL'}`);

  return {
    positive,
    disagreement,
    partisan,
  };
}

// Check if all filters pass the thresholds
export function checkAllThresholds(scores: AllFilterScores, thresholds = { positive: 0.5, disagreement: 0.5, partisan: 0.5 }): boolean {
  return scores.positive.score > thresholds.positive &&
         scores.disagreement.score > thresholds.disagreement &&
         scores.partisan.score > thresholds.partisan;
}
