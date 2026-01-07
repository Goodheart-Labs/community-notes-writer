/**
 * Multi-Source Search Module
 *
 * Extracts topic from tweet, then searches multiple sources:
 * - Perplexity (existing)
 * - Google Custom Search
 * - Exa
 * - X API
 */

import { KeywordResult } from "./extractKeywords";
import { llm } from "./llm";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export interface MultiSearchInput {
  keywords: KeywordResult;
  date: string;
  quoteContext?: string;
  originalText: string;
}

export interface SearchSourceResult {
  source: string;
  results: string;
  citations: string[];
  success: boolean;
  error?: string;
}

export interface MultiSearchResult {
  text: string;
  searchResults: string;
  citations: string[];
  sourceResults: SearchSourceResult[];
  topic: string;
}

/**
 * Extract the main topic/issue from the tweet for better search queries
 */
async function extractTopic(
  text: string,
  keywords: KeywordResult,
  quoteContext?: string
): Promise<string> {
  const prompt = `Analyze this tweet and extract a clear, searchable topic statement.

Tweet: "${text}"
${quoteContext ? `Quote context: "${quoteContext}"` : ""}
Keywords: ${keywords.keywords.join(", ")}
Entities: ${keywords.entities.join(", ")}
Claims: ${keywords.claims.join("; ")}

Return a single sentence describing the main topic/claim that we should search for to fact-check this tweet.
Focus on the specific factual claim that could be verified.
Be concise - this will be used as a search query.`;

  try {
    const { text: topic } = await generateText({
      model: openrouter("anthropic/claude-3.5-haiku"),
      prompt,
      temperature: 0.2,
    });

    return topic.trim();
  } catch (error) {
    console.error("[extractTopic] Error:", error);
    // Fallback to keywords
    return [...keywords.keywords, ...keywords.entities].slice(0, 5).join(" ");
  }
}

/**
 * Search using Perplexity (existing behavior)
 */
async function searchPerplexity(
  topic: string,
  originalText: string,
  date: string
): Promise<SearchSourceResult> {
  try {
    const result = await llm.create({
      model: "perplexity/sonar",
      messages: [
        {
          role: "system",
          content: `Search for information about: ${topic}

Original tweet: "${originalText}"
Today's date: ${date}

Find recent news, reports, or official statements about this topic.`,
        },
        {
          role: "user",
          content: topic,
        },
      ],
      temperature: 0.3,
    });

    const searchResults = result.choices?.[0]?.message?.content || "";
    const citations = (result as any).citations || [];

    return {
      source: "perplexity",
      results: searchResults,
      citations,
      success: true,
    };
  } catch (error) {
    console.error("[searchPerplexity] Error:", error);
    return {
      source: "perplexity",
      results: "",
      citations: [],
      success: false,
      error: String(error),
    };
  }
}

/**
 * Search using Serper.dev (Google search wrapper)
 */
async function searchGoogle(topic: string): Promise<SearchSourceResult> {
  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) {
    return {
      source: "google",
      results: "",
      citations: [],
      success: false,
      error: "Serper API not configured (SERPER_API_KEY)",
    };
  }

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: topic,
        num: 5,
      }),
    });

    const data = await response.json();

    if (!data.organic || data.organic.length === 0) {
      return {
        source: "google",
        results: "No results found",
        citations: [],
        success: true,
      };
    }

    const results = data.organic
      .map(
        (item: any, idx: number) =>
          `[${idx + 1}] ${item.title}\n${item.snippet}\nSource: ${item.link}`
      )
      .join("\n\n");

    const citations = data.organic.map((item: any) => item.link);

    return {
      source: "google",
      results,
      citations,
      success: true,
    };
  } catch (error) {
    console.error("[searchGoogle] Error:", error);
    return {
      source: "google",
      results: "",
      citations: [],
      success: false,
      error: String(error),
    };
  }
}

/**
 * Search using Exa API
 */
async function searchExa(topic: string): Promise<SearchSourceResult> {
  const apiKey = process.env.EXA_API_KEY;

  if (!apiKey) {
    return {
      source: "exa",
      results: "",
      citations: [],
      success: false,
      error: "Exa API not configured",
    };
  }

  try {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: topic,
        numResults: 5,
        useAutoprompt: true,
        type: "neural",
      }),
    });

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return {
        source: "exa",
        results: "No results found",
        citations: [],
        success: true,
      };
    }

    const results = data.results
      .map(
        (item: any, idx: number) =>
          `[${idx + 1}] ${item.title}\n${item.text?.substring(0, 300) || "No snippet"}\nSource: ${item.url}`
      )
      .join("\n\n");

    const citations = data.results.map((item: any) => item.url);

    return {
      source: "exa",
      results,
      citations,
      success: true,
    };
  } catch (error) {
    console.error("[searchExa] Error:", error);
    return {
      source: "exa",
      results: "",
      citations: [],
      success: false,
      error: String(error),
    };
  }
}

/**
 * Search using X API (Twitter search)
 */
async function searchX(topic: string): Promise<SearchSourceResult> {
  const bearerToken = process.env.X_SEARCH_BEARER_TOKEN;

  if (!bearerToken) {
    return {
      source: "x",
      results: "",
      citations: [],
      success: false,
      error: "X Search API not configured",
    };
  }

  try {
    // Use X API v2 recent search
    const url = new URL("https://api.twitter.com/2/tweets/search/recent");
    url.searchParams.set("query", `${topic} -is:retweet lang:en`);
    url.searchParams.set("max_results", "10");
    url.searchParams.set("tweet.fields", "created_at,author_id,text");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`X API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      return {
        source: "x",
        results: "No relevant tweets found",
        citations: [],
        success: true,
      };
    }

    const results = data.data
      .map(
        (tweet: any, idx: number) =>
          `[${idx + 1}] Tweet (${tweet.created_at}):\n"${tweet.text}"`
      )
      .join("\n\n");

    // X tweets don't have traditional URLs in search results
    const citations = data.data.map(
      (tweet: any) => `https://twitter.com/i/status/${tweet.id}`
    );

    return {
      source: "x",
      results,
      citations,
      success: true,
    };
  } catch (error) {
    console.error("[searchX] Error:", error);
    return {
      source: "x",
      results: "",
      citations: [],
      success: false,
      error: String(error),
    };
  }
}

/**
 * Main multi-source search function
 */
export async function multiSourceSearch(
  input: MultiSearchInput
): Promise<MultiSearchResult> {
  console.log("[multiSourceSearch] Starting multi-source search...");

  // Step 1: Extract topic
  console.log("[multiSourceSearch] Extracting topic...");
  const topic = await extractTopic(
    input.originalText,
    input.keywords,
    input.quoteContext
  );
  console.log(`[multiSourceSearch] Topic: "${topic}"`);

  // Step 2: Search all sources in parallel
  console.log("[multiSourceSearch] Searching all sources...");
  const [perplexityResult, googleResult, exaResult, xResult] = await Promise.all([
    searchPerplexity(topic, input.originalText, input.date),
    searchGoogle(topic),
    searchExa(topic),
    searchX(topic),
  ]);

  const sourceResults = [perplexityResult, googleResult, exaResult, xResult];

  // Log source results
  sourceResults.forEach((r) => {
    if (r.success) {
      console.log(
        `[multiSourceSearch] ${r.source}: ${r.citations.length} citations found`
      );
    } else {
      console.log(`[multiSourceSearch] ${r.source}: failed - ${r.error}`);
    }
  });

  // Step 3: Combine results
  const combinedResults = sourceResults
    .filter((r) => r.success && r.results)
    .map((r) => `=== ${r.source.toUpperCase()} ===\n${r.results}`)
    .join("\n\n");

  // Combine all citations, deduplicated
  const allCitations = [
    ...new Set(sourceResults.flatMap((r) => r.citations)),
  ];

  console.log(
    `[multiSourceSearch] Combined: ${allCitations.length} total citations`
  );

  return {
    text: input.originalText,
    searchResults: combinedResults,
    citations: allCitations,
    sourceResults,
    topic,
  };
}
