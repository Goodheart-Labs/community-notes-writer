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

  const claimsText = input.keywords.claims.length > 0 
    ? `Claims to verify: ${input.keywords.claims.join("; ")}` 
    : "";

  const systemPrompt = `You are a fact-checking research tool. Search the web for information about the following keywords and claims.

Today's date: ${input.date}

Keywords to research: ${searchQuery}
${claimsText}
${input.quoteContext ? `Quote tweet context: ${input.quoteContext}` : ""}

Original tweet for reference: "${input.originalText}"

IMPORTANT:
1. Focus on finding recent, authoritative sources
2. Look for information that either supports or contradicts the claims
3. Consider the date context - if something is claimed to have happened "yesterday" or "last week", calculate the actual dates
4. Provide specific URLs for all sources
5. Be concise and factual`;

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
          content: `Research these keywords and verify these claims. Provide factual information with sources.`,
        },
      ],
      temperature: 0.3,
    });

    const searchResults = result.choices?.[0]?.message?.content || "";
    
    // Extract URLs from the search results
    const urlRegex = /https?:\/\/[^\s]+/g;
    const citations = searchResults.match(urlRegex) || [];

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