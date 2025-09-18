import { generateObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export interface KeywordResult {
  keywords: string[];      // 3-5 key terms
  claims: string[];        // Main factual claims
  entities: string[];      // People, places, organizations
}

const keywordSchema = z.object({
  keywords: z.array(z.string()).describe("3-5 key searchable terms from the tweet"),
  claims: z.array(z.string()).describe("Main factual claims made in the tweet"),
  entities: z.array(z.string()).describe("People, places, organizations, or events mentioned"),
});

export async function extractKeywords(tweetText: string, quoteContext?: string): Promise<KeywordResult> {
  const fullContext = quoteContext 
    ? `Tweet: "${tweetText}"\n\nQuote tweet context: "${quoteContext}"` 
    : `Tweet: "${tweetText}"`;

  const prompt = `Extract the key searchable terms, claims, and entities from this tweet for fact-checking research.

${fullContext}

Instructions:
- Keywords: Extract 3-5 most important search terms (not common words)
- Claims: Identify specific factual claims that can be verified
- Entities: List specific people, organizations, places, or events mentioned

Focus on:
- Specific facts and figures
- Named entities that can be researched
- Controversial or checkable claims
- Technical terms or specific concepts

Avoid:
- Common words like "the", "is", "are"
- Opinions or subjective statements
- Generic terms without context`;

  try {
    const { object } = await generateObject({
      model: openrouter("anthropic/claude-3.5-sonnet"),
      schema: keywordSchema,
      prompt,
      temperature: 0.2,
    });

    return {
      keywords: object.keywords.slice(0, 5), // Limit to 5 keywords
      claims: object.claims,
      entities: object.entities,
    };
  } catch (error) {
    console.error("[extractKeywords] Error extracting keywords:", error);
    // Fallback to simple extraction
    const words = tweetText.split(/\s+/).filter(w => w.length > 4);
    return {
      keywords: words.slice(0, 5),
      claims: [],
      entities: [],
    };
  }
}