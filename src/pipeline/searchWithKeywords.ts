import { KeywordResult } from "./extractKeywords";
import { llm } from "./llm";
import type { OpenAIChatModelId } from "@ai-sdk/openai/internal";

export interface SearchInput {
  keywords: KeywordResult;
  date: string; // YYYY-MM-DD format
  quoteContext?: string;
  originalText: string; // Keep for reference
}

export interface SearchResult {
  text: string;
  searchResults: string;
  citations?: string[];
}

export async function searchWithKeywords(
  input: SearchInput,
  config: { model: OpenAIChatModelId }
): Promise<SearchResult> {
  // Format keywords for search
  const searchQuery = [
    ...input.keywords.keywords,
    ...input.keywords.entities,
  ].join(", ");

  const claimsText =
    input.keywords.claims.length > 0
      ? `Specific claims: ${input.keywords.claims.join("; ")}`
      : "";

  const systemPrompt = `Search the web for information about: ${searchQuery}

${claimsText}
${input.quoteContext ? `Context: ${input.quoteContext}` : ""}

Tweet text: "${input.originalText}"

Today's date: ${input.date}

Find recent news, reports, or official statements about this specific topic.`;

  try {
    const result = await llm.create({
      model: config.model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: searchQuery,
        },
      ],
      temperature: 0.3,
    });

    const searchResults = result.choices?.[0]?.message?.content || "";

    // Get citations from Perplexity response (they're in result.citations, not in the text)
    const citations = (result as any).citations || [];

    return {
      text: input.originalText,
      searchResults,
      citations,
    };
  } catch (error) {
    console.error("[searchWithKeywords] Error:", error);
    throw error;
  }
}
