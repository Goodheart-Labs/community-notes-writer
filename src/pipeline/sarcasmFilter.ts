import { generateObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export interface VerifiableFactResult {
  score: number;        // 0 = not verifiable, 1 = verifiable facts
  reasoning: string;    // Brief explanation
}

const verifiableFactSchema = z.object({
  score: z.number().min(0).max(1).describe("0 = not verifiable/opinion/joke, 1 = contains verifiable factual claims"),
  reasoning: z.string().describe("One sentence explanation of why this score was given"),
});

export async function checkVerifiableFacts(
  tweetText: string,
  quoteContext?: string,
  imageUrl?: string
): Promise<VerifiableFactResult> {
  const fullContext = quoteContext
    ? `Tweet: "${tweetText}"\n\nQuote tweet context: "${quoteContext}"`
    : `Tweet: "${tweetText}"`;

  const textPrompt = `Analyze this tweet for claims that can be fact-checked, as opposed to opinion, rhetorical questions, or jokes.

${fullContext}

Consider:
- Does the tweet contain any non-vague factual claim? (score higher)
- Is the tweet clearly solely an opinion? (score lower)
- Is the tweet entirely a rhetorical question not meant to be answered literally? (score lower)
- Does the tweet contain a statistic or fact even if unsubstantiated? (score higher)

Return a score from 0 to 1:
- 0.0-0.2: Entirely opinion
- 0.2-0.4: Humourous claims or ones that no typical person would consider to be serious
- 0.4-0.6: Unclear/borderline
- 0.6-0.8: Any one factual claim
- 0.8-1.0: Multiple factual claims

IMPORTANT: Return ONLY a JSON object with:
- score: a number between 0 and 1
- reasoning: a single string (one sentence) explaining the score`;

  try {
    const messages: any[] = [
      {
        role: "user",
        content: imageUrl
          ? [
              { type: "text", text: textPrompt },
              { type: "image", image: imageUrl },
            ]
          : textPrompt,
      },
    ];

    const { object } = await generateObject({
      model: openrouter("anthropic/claude-3.5-sonnet"),
      schema: verifiableFactSchema,
      messages,
      temperature: 0.2,
      mode: "json",
      system: "You are a JSON API that returns exactly the requested format. The reasoning field must be a simple string, not an object.",
    });

    return {
      score: object.score,
      reasoning: object.reasoning,
    };
  } catch (error) {
    console.error("[verifiableFactFilter] Error checking verifiable facts:", error);
    // Default to passing if there's an error
    return {
      score: 0.7,
      reasoning: "Error in fact verification, defaulting to likely verifiable",
    };
  }
}

// Keep old function for backward compatibility during transition
export async function checkSarcasm(tweetText: string, quoteContext?: string): Promise<VerifiableFactResult> {
  return checkVerifiableFacts(tweetText, quoteContext);
}