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

Output your response as a JSON object with the following structure:
{
  "reasoning": "Your reasoning for your keyword choices",
  "keywords": ["keyword1", "keyword2", "keyword3", ...],
  "searchQuery": "Combined search query string"
}

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
      response_format: { type: "json_object" },
      max_tokens: 1000,
    });

    const content = result.choices?.[0]?.message?.content ?? "";
    
    // Parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse JSON response:", content);
      // Fallback: try to extract keywords from the text
      parsed = {
        keywords: [],
        searchQuery: input.text.slice(0, 100), // Use first 100 chars as fallback
        reasoning: "Failed to extract structured keywords",
      };
    }

    // Ensure the response has the required fields
    return {
      keywords: parsed.keywords || [],
      searchQuery: parsed.searchQuery || parsed.keywords?.join(" ") || input.text.slice(0, 100),
      reasoning: parsed.reasoning || "No reasoning provided",
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