import { createGoal } from "@tonerow/agent-framework";
import { z } from "zod";
import { llm } from "./llm";
import { searchVersionOne } from "./searchContextGoal";
import { textAndSearchResults, writeNoteOutput } from "./schemas";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { parseStatusNoteUrl } from "./parseStatusNoteUrl";

// Define the goal schema, similar to searchContext.ts
export const writeNoteWithSearchGoal = createGoal({
  name: "write note with search",
  description:
    "Write a Community Note for a post on X using search results for context.",
  input: textAndSearchResults,
  output: writeNoteOutput,
});

writeNoteWithSearchGoal.testFrom(searchVersionOne);

const promptTemplate = ({
  text,
  searchResults,
  citations,
  retweetContext,
}: {
  text: string;
  searchResults: string;
  citations: string[];
  retweetContext?: string;
}) => `TASK: Analyze this X post and determine if it contains factual errors that require correction.${
  retweetContext
    ? `

${retweetContext}`
    : ""
}

CRITICAL ANALYSIS STEPS:
1. IDENTIFY THE SPECIFIC CLAIM: What exact factual assertion is the post making?
2. VERIFY ACCURACY: Do the search results directly contradict this specific claim?
3. SOURCE RELEVANCE: Do the sources directly address this claim (not general background)?
4. DIRECTNESS: Can you definitively say "this specific claim is false" based on the evidence?

ONLY correct posts with clear factual errors supported by direct, relevant sources. Avoid:
- General background context that doesn't contradict the claim
- Sources about different timeframes than what the post discusses  
- Correcting things the post never actually claimed
- Vague corrections that don't directly address the core assertion

Please start by responding with one of the following statuses "TWEET NOT SIGNIFICANTLY INCORRECT" "NO MISSING CONTEXT" "CORRECTION WITH TRUSTWORTHY CITATION" "CORRECTION WITHOUT TRUSTWORTHY CITATION"

Format:
[Status]
[Direct correction stating exactly what is wrong]
[URL that specifically contradicts the claim]

Post perhaps in need of community note:
\`\`\`
${text}
\`\`\`

Perpelexity search results:
\`\`\`
${searchResults}

Citations:
\`\`\`
${citations.join("\n")}
\`\`\``;

const retryPromptTemplate = ({
  text,
  searchResults,
  citations,
  retweetContext,
  previousNote,
  characterCount,
}: {
  text: string;
  searchResults: string;
  citations: string[];
  retweetContext?: string;
  previousNote: string;
  characterCount: number;
}) => `TASK: Analyze this X post and determine if it contains factual errors that require correction.${
  retweetContext
    ? `

${retweetContext}`
    : ""
}

CRITICAL ANALYSIS STEPS:
1. IDENTIFY THE SPECIFIC CLAIM: What exact factual assertion is the post making?
2. VERIFY ACCURACY: Do the search results directly contradict this specific claim?
3. SOURCE RELEVANCE: Do the sources directly address this claim (not general background)?
4. DIRECTNESS: Can you definitively say "this specific claim is false" based on the evidence?

ONLY correct posts with clear factual errors supported by direct, relevant sources. Avoid:
- General background context that doesn't contradict the claim
- Sources about different timeframes than what the post discusses  
- Correcting things the post never actually claimed
- Vague corrections that don't directly address the core assertion

Please start by responding with one of the following statuses "TWEET NOT SIGNIFICANTLY INCORRECT" "NO MISSING CONTEXT" "CORRECTION WITH TRUSTWORTHY CITATION" "CORRECTION WITHOUT TRUSTWORTHY CITATION"

Format:
[Status]
[Direct correction stating exactly what is wrong]
[URL that specifically contradicts the claim]

🚨 CRITICAL FAILURE: Your previous note was ${characterCount} characters - this VIOLATES the strict 275 character limit! You MUST drastically reduce this length NOW. This is NOT a suggestion - it is MANDATORY.

REQUIRED ACTIONS:
- CUT unnecessary words and filler phrases
- Use shorter synonyms and abbreviations  
- ELIMINATE any non-essential details
- Remove redundant information
- Make every single word count

The 275 character limit is ABSOLUTE and NON-NEGOTIABLE. FAILURE to comply will result in rejection.

Previous note: "${previousNote}"

Post perhaps in need of community note:
\`\`\`
${text}
\`\`\`

Perpelexity search results:
\`\`\`
${searchResults}

Citations:
\`\`\`
${citations.join("\n")}
\`\`\``;

export const writeNoteWithSearch = writeNoteWithSearchGoal.register({
  name: "write note with search v1",
  config: [{ model: "anthropic/claude-sonnet-4" }],
});

export async function writeNoteWithSearchFn(
  {
    text,
    searchResults,
    citations,
    retweetContext,
  }: z.infer<typeof textAndSearchResults>,
  config: {
    model: string;
  }
) {
  const maxRetries = 3;
  let attempt = 0;
  let previousParsed: ReturnType<typeof parseStatusNoteUrl> | null = null;

  try {
    while (attempt < maxRetries) {
      attempt++;

      let prompt: string;
      if (attempt === 1) {
        // First attempt - use original prompt
        prompt = promptTemplate({
          text,
          searchResults,
          citations,
          retweetContext,
        });
      } else {
        // Retry attempt - use previous result to provide feedback
        if (!previousParsed) {
          throw new Error("Previous result not available for retry");
        }

        prompt = retryPromptTemplate({
          text,
          searchResults,
          citations,
          retweetContext,
          previousNote: previousParsed.note,
          characterCount: previousParsed.note.length,
        });
      }

      const result = await llm.create({
        model: config.model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const content = result.choices?.[0]?.message?.content ?? "";
      const parsed = parseStatusNoteUrl(content);

      // Check if note is within character limit
      if (parsed.note.length <= 275) {
        return parsed;
      }

      // Store for potential retry
      previousParsed = parsed;

      // If we've reached max retries, return the last result even if it's too long
      if (attempt >= maxRetries) {
        console.warn(
          `Note still exceeds 275 characters after ${maxRetries} attempts: ${parsed.note.length} characters`
        );
        return parsed;
      }
    }

    throw new Error("Unexpected error in retry logic");
  } catch (error) {
    console.error("Error in writeNoteWithSearchFn:", error);
    throw error;
  }
}

writeNoteWithSearch.define(writeNoteWithSearchFn);
