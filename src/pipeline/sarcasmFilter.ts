import { generateObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export interface SarcasmResult {
  score: number;        // 0 = definitely sarcastic, 1 = definitely sincere
  reasoning: string;    // Brief explanation
}

const sarcasmSchema = z.object({
  score: z.number().min(0).max(1).describe("0 = definitely sarcastic/rhetorical/joke, 1 = definitely sincere factual claim"),
  reasoning: z.string().describe("One sentence explanation of why this score was given"),
});

export async function checkSarcasm(tweetText: string, quoteContext?: string): Promise<SarcasmResult> {
  const fullContext = quoteContext 
    ? `Tweet: "${tweetText}"\n\nQuote tweet context: "${quoteContext}"` 
    : `Tweet: "${tweetText}"`;

  const prompt = `Analyze this tweet for sarcasm, satire, rhetorical questions, or non-literal statements.

${fullContext}

Consider:
- Is this making a sincere factual claim that could be fact-checked?
- Is this sarcasm, satire, or a joke?
- Is this a rhetorical question not meant to be answered literally?
- Is this a personal opinion about a non-public figure?
- Is this using irony, exaggeration, or impossible claims?
- Is this a meme or obvious humor?

Return a score from 0 to 1:
- 0.0-0.2: Definitely sarcastic, satirical, or joke
- 0.2-0.4: Likely sarcastic or rhetorical
- 0.4-0.6: Unclear/borderline
- 0.6-0.8: Likely sincere claim
- 0.8-1.0: Definitely sincere factual claim

If it's a personal opinion about a non-public figure, score it low (0.2-0.3) since we shouldn't fact-check personal opinions.

IMPORTANT: Return ONLY a JSON object with:
- score: a number between 0 and 1
- reasoning: a single string (one sentence) explaining the score`;

  try {
    const { object } = await generateObject({
      model: openrouter("anthropic/claude-3.5-sonnet"),
      schema: sarcasmSchema,
      prompt,
      temperature: 0.2,
      mode: 'json',
      system: 'You are a JSON API that returns exactly the requested format. The reasoning field must be a simple string, not an object.',
    });

    return {
      score: object.score,
      reasoning: object.reasoning,
    };
  } catch (error) {
    console.error("[sarcasmFilter] Error checking sarcasm:", error);
    // Default to passing if there's an error
    return {
      score: 0.7,
      reasoning: "Error in sarcasm detection, defaulting to likely sincere",
    };
  }
}