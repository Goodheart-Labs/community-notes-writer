import { createGoal } from "@tonerow/agent-framework";
import { z } from "zod";
import { llm } from "./llm";
import type { ChatCompletionContentPartImage } from "openai/resources";

// Define the schema for keyword extraction
export const keywordExtractionInput = z.object({
  text: z.string().describe("The tweet text to analyze"),
  media: z.array(z.string()).describe("Array of media URLs from the tweet"),
  quotedContext: z.string().optional().describe("Context from quoted post"),
});

export const keywordExtractionOutput = z.object({
  keywords: z.array(z.string()).describe("Array of search keywords"),
  searchQuery: z.string().describe("Optimized search query combining the keywords"),
  reasoning: z.string().describe("Brief explanation of keyword choices"),
});

// Create the goal for keyword extraction
export const extractSearchKeywordsGoal = createGoal({
  name: "extract search keywords",
  description: "Analyze a tweet and its images to extract optimal search keywords for fact-checking",
  input: keywordExtractionInput,
  output: keywordExtractionOutput,
});

// Register the implementation
export const extractSearchKeywords = extractSearchKeywordsGoal.register({
  name: "extract keywords v1",
  config: [{ model: "anthropic/claude-sonnet-4" }],
});

const promptTemplate = ({
  text,
  hasImages,
  quotedContext,
}: {
  text: string;
  hasImages: boolean;
  quotedContext?: string;
}) => `Analyze this social media post ${hasImages ? "and its accompanying images " : ""}to extract the most effective search keywords for fact-checking.

Your task:
1. Identify the main claims, entities, and events mentioned
2. Extract proper nouns (people, places, organizations)
3. Identify key dates, numbers, or statistics
4. Note any specific incidents or events referenced
5. For images: describe what's shown and extract any visible text, logos, or identifying features

Focus on:
- The key claims made in the post
- The central notions being conveyed

If the post discusses Trump, note that Trump won the 2024 election, so it may be discussing the current term as opposed to his 2017-2020 term.

Output in the following format:

Reasoning:
[Your reasoning for your keyword choices]

Keywords:
[keyword1, keyword2, keyword3, keyword4, keyword5, ...]

Search Query:
[Combined optimized search query]

Post to analyze:
${text}

${quotedContext ? `\nQuoted Context:\n${quotedContext}\n` : ""}

${hasImages ? "\nNote: This post includes images that may contain additional context, text, or claims that should be considered in your keyword extraction." : ""}`;

export async function extractSearchKeywordsFn(
  input: z.infer<typeof keywordExtractionInput>,
  config: { model: string }
) {
  try {
    // Prepare image content if media is provided
    const images: ChatCompletionContentPartImage[] = input.media.map((url) => ({
      type: "image_url",
      image_url: { url },
    }));

    const prompt = promptTemplate({
      text: input.text,
      hasImages: input.media.length > 0,
      quotedContext: input.quotedContext,
    });

    // Create the message content array
    const messageContent: any[] = [
      {
        type: "text",
        text: prompt,
      },
    ];

    // Add images if available
    if (images.length > 0) {
      messageContent.push(...images);
    }

    const result = await llm.create({
      model: config.model,
      messages: [
        {
          role: "user",
          content: messageContent,
        },
      ],
      max_tokens: 1000,
    });

    const content = result.choices?.[0]?.message?.content ?? "";
    
    // Parse the text response
    let keywords: string[] = [];
    let searchQuery = "";
    let reasoning = "";
    
    try {
      // Extract reasoning
      const reasoningMatch = content.match(/Reasoning:\s*([\s\S]+?)(?=Keywords:|$)/i);
      if (reasoningMatch && reasoningMatch[1]) {
        reasoning = reasoningMatch[1].trim();
      }
      
      // Extract keywords
      const keywordsMatch = content.match(/Keywords:\s*([\s\S]+?)(?=Search Query:|$)/i);
      if (keywordsMatch && keywordsMatch[1]) {
        // Parse keywords - they might be comma-separated or on new lines
        const keywordText = keywordsMatch[1].trim();
        keywords = keywordText
          .split(/[,\n]/)
          .map(k => k.trim())
          .filter(k => k && !k.startsWith('[') && !k.endsWith(']'))
          .map(k => k.replace(/^\[|\]$/g, '').trim());
      }
      
      // Extract search query
      const queryMatch = content.match(/Search Query:\s*([\s\S]+?)$/i);
      if (queryMatch && queryMatch[1]) {
        searchQuery = queryMatch[1].trim().replace(/^\[|\]$/g, '');
      }
    } catch (e) {
      console.error("Failed to parse text response:", e);
    }
    
    // Fallback if parsing failed
    if (keywords.length === 0) {
      console.warn("No keywords extracted, using fallback");
      keywords = input.text.split(' ').slice(0, 5);
    }
    
    if (!searchQuery) {
      searchQuery = keywords.join(" ") || input.text.slice(0, 100);
    }

    // Ensure the response has the required fields
    return {
      keywords,
      searchQuery,
      reasoning: reasoning || "No reasoning provided",
    };
  } catch (error) {
    console.error("Error in extractSearchKeywordsFn:", error);
    // Return a basic fallback
    return {
      keywords: [],
      searchQuery: input.text.slice(0, 100),
      reasoning: `Error extracting keywords: ${error}`,
    };
  }
}

extractSearchKeywords.define(extractSearchKeywordsFn);