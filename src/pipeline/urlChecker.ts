import { generateObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export interface UrlCheckResult {
  score: number;        // 0 = no URL, 1 = perfect citation
  reasoning: string;    // Brief explanation
  hasUrl: boolean;
  urlQuality?: string;  // Description of URL quality
}

const urlCheckSchema = z.object({
  score: z.number().min(0).max(1).describe("0 = no URL, 0.3 = bad URL, 0.6 = OK source, 1 = excellent citation"),
  reasoning: z.string().describe("Brief explanation of the URL quality"),
  hasUrl: z.boolean().describe("Whether any URL is present"),
  urlQuality: z.string().optional().describe("Quality assessment of the URL if present"),
});

export async function checkUrlValidity(noteText: string, url: string): Promise<UrlCheckResult> {
  const prompt = `Evaluate the quality of the citation/source in this Community Note.

Note text: "${noteText}"
URL provided: "${url}"

Scoring guidelines:
- 0.0: No URL provided at all
- 0.2: URL present but broken/invalid
- 0.3: URL works but is a poor source (blog, opinion piece, unreliable site)
- 0.5: Decent source but not ideal (news article, Wikipedia)
- 0.7: Good source (reputable news, academic, government)
- 0.9: Excellent source (peer-reviewed, official data, archive link)
- 1.0: Perfect citation (authoritative source with archive/wayback link)

Consider:
- Is there a working URL?
- Is the source reputable and authoritative?
- Does the source directly support the claims in the note?
- Is it a primary source or secondary reporting?
- Is there an archive/wayback machine link for permanence?

IMPORTANT: Respond with valid JSON only, no other text.`;

  try {
    const { object } = await generateObject({
      model: openrouter("anthropic/claude-3.5-sonnet"),
      schema: urlCheckSchema,
      prompt,
      temperature: 0.2,
      mode: 'json',
    });

    return {
      score: object.score,
      reasoning: object.reasoning,
      hasUrl: object.hasUrl,
      urlQuality: object.urlQuality,
    };
  } catch (error) {
    console.error("[urlChecker] Error checking URL:", error);
    // Default to low score if error
    return {
      score: 0.3,
      reasoning: "Error checking URL quality",
      hasUrl: url.length > 0,
    };
  }
}