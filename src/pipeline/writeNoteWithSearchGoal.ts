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
}) => `Given this X post and search results about it, identify the most important pieces of context that are missing from the post that would help readers understand the full picture.${retweetContext ? `

${retweetContext}` : ''}

Focus only on factual context that materially and significantly changes the interpretation of the post. Do not flag opinions, predictions, or minor details. Please be concise and get straight to the point.

Please start by responding with one of the following statuses "TWEET NOT SIGNIFICANTLY INCORRECT" "NO MISSING CONTEXT" "CORRECTION WITH TRUSTWORTHY CITATION" "CORRECTION WITHOUT TRUSTWORTHY CITATION"

If important context is missing, write a community note to correct the claim. Always include a URL, if no url is possible respond with the relevant status. Keep the correction text to 275 characters or less (URL will be added separately). Respond with the following format:
[Status]
[Short correction of most significant error]
[URL of most trustworthy source]

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
}) => `Given this X post and search results about it, identify the most important pieces of context that are missing from the post that would help readers understand the full picture.${retweetContext ? `

${retweetContext}` : ''}

Focus only on factual context that materially and significantly changes the interpretation of the post. Do not flag opinions, predictions, or minor details. Please be concise and get straight to the point.

Please start by responding with one of the following statuses "TWEET NOT SIGNIFICANTLY INCORRECT" "NO MISSING CONTEXT" "CORRECTION WITH TRUSTWORTHY CITATION" "CORRECTION WITHOUT TRUSTWORTHY CITATION"

If important context is missing, write a community note to correct the claim. Always include a URL, if no url is possible respond with the relevant status. Keep the correction text to 275 characters or less (URL will be added separately). Respond with the following format:
[Status]
[Short correction of most significant error]
[URL of most trustworthy source]

IMPORTANT: You previously generated this note, but it was ${characterCount} characters long, which exceeds the 275 character limit. Please rewrite it to be 275 characters or less by removing less essential details and using more concise wording while preserving the key factual corrections:

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
  { text, searchResults, citations, retweetContext }: z.infer<typeof textAndSearchResults>,
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
        prompt = promptTemplate({ text, searchResults, citations, retweetContext });
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
          characterCount: previousParsed.note.length
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
        console.warn(`Note still exceeds 275 characters after ${maxRetries} attempts: ${parsed.note.length} characters`);
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
