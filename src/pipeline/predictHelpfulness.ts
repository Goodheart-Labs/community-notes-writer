import { generateObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export interface HelpfulnessResult {
  score: number;        // 0-1 likelihood of being rated helpful
  reasoning: string;    // Brief explanation
}

const helpfulnessSchema = z.object({
  score: z.number().min(0).max(1).describe("0 = unlikely to be helpful, 1 = very likely to be helpful"),
  reasoning: z.string().describe("Brief explanation of why this note would or wouldn't be helpful"),
});

export async function predictHelpfulness(
  noteText: string,
  tweetText: string,
  searchResults: string,
  url: string
): Promise<HelpfulnessResult> {
  const prompt = `Predict whether this Community Note will be rated as "Currently Rated Helpful" on X/Twitter.

Tweet being corrected:
"${tweetText}"

Community Note:
"${noteText}"

URL provided: ${url}

Research/Search Results that informed the note:
${searchResults}

Evaluate based on these criteria for helpful notes:
- Provides clear, factual correction with credible source
- Directly addresses the main claim in the tweet
- Concise and easy to understand
- Neutral tone without bias or judgment
- Source directly supports the correction
- Not overly pedantic or nitpicky

Scoring:
- 0.0-0.2: Poor note (vague, off-topic, biased, or unsupported)
- 0.2-0.4: Below average (some issues with clarity or relevance)
- 0.4-0.6: Average (decent but not compelling)
- 0.6-0.8: Good (clear, relevant, well-sourced)
- 0.8-1.0: Excellent (highly likely to be rated helpful)

IMPORTANT: Return ONLY a JSON object with:
- score: a number between 0 and 1
- reasoning: a brief explanation (one sentence)`;

  try {
    const { object } = await generateObject({
      model: openrouter("anthropic/claude-sonnet-4"),
      schema: helpfulnessSchema,
      prompt,
      temperature: 0.2,
      mode: 'json',
    });

    return {
      score: object.score,
      reasoning: object.reasoning,
    };
  } catch (error) {
    console.error("[predictHelpfulness] Error predicting helpfulness:", error);
    return {
      score: 0.5,
      reasoning: "Error in helpfulness prediction, defaulting to neutral",
    };
  }
}