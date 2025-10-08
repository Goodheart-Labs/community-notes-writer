import { createGoal } from "@tonerow/agent-framework";
import { z } from "zod";
import { llm } from "../lib/llm";
import { searchVersionOne } from "./searchContextGoal";
import { textAndSearchResults, writeNoteOutput } from "./schemas";
import { zodResponseFormat } from "openai/helpers/zod.mjs";

/**
 * Parses a string to extract status, note, url, and reasoning.
 */
function parseStatusNoteUrl(content: string): z.infer<typeof writeNoteOutput> & { reasoning?: string } {
  // Look for the new format with "Status:" and "Note:" labels
  const statusMatch = content.match(/Status:\s*(.+?)(?:\n|$)/i);
  const noteMatch = content.match(/Note:\s*([\s\S]+?)(?:$)/i);

  if (statusMatch && statusMatch[1] && noteMatch && noteMatch[1]) {
    // New format detected
    let status = statusMatch[1].trim();
    let noteContent = noteMatch[1].trim();

    // Extract URL from the note content
    const urlMatch = noteContent.match(/https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+/);
    let url = urlMatch ? urlMatch[0] : "";

    // Remove URL from note text (it will be added back later if needed)
    let note = noteContent.replace(/https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+/g, '').trim();

    // Extract reasoning (everything before "Status:")
    let reasoning = "";
    const statusIndex = content.indexOf("Status:");
    if (statusIndex > 0) {
      reasoning = content.substring(0, statusIndex).trim();
      // Remove any [Reasoning] label if present
      reasoning = reasoning.replace(/^\[?Reasoning\]?:?\s*/i, '').trim();
    }

    return { status: status as any, note, url, reasoning };
  }

  // Fall back to old format for backward compatibility
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error("Empty content");
  }
  // Status is the first non-empty line
  const status = lines[0] ?? "";
  // Find a URL in any line
  let url = "";
  let urlLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]?.match(/https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+/);
    if (match && match[0]) {
      url = match[0];
      urlLineIdx = i;
      break;
    }
  }
  // Note is everything except the status and url line
  const noteLines = lines.filter((_, idx) => idx !== 0 && idx !== urlLineIdx);
  const note: string = noteLines.join(" ").trim();
  return { status: status as any, note, url };
}

// Define the goal schema, similar to searchContext.ts
export const writeNoteGoal = createGoal({
  name: "write note with search",
  description:
    "Write a Community Note for a post on X using search results for context.",
  input: textAndSearchResults,
  output: writeNoteOutput,
});

writeNoteGoal.testFrom(searchVersionOne);

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
}) => `TASK: Analyze this X post and determine if it contains factual errors that require correction.${retweetContext ? `

${retweetContext}` : ''}

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

If writing a correction, be explicit and direct. Start with "This claim is incorrect" or "This statement is false" and explain exactly what is wrong. Keep correction text to 275 characters or less (URL will be added separately).

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
}) => `TASK: Analyze this X post and determine if it contains factual errors that require correction.${retweetContext ? `

${retweetContext}` : ''}

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

If writing a correction, be explicit and direct. Start with "This claim is incorrect" or "This statement is false" and explain exactly what is wrong. Keep correction text to 275 characters or less (URL will be added separately).

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

export const writeNoteWithSearch = writeNoteGoal.register({
  name: "write note with search v1",
  config: [{ model: "anthropic/claude-sonnet-4" }],
});

export async function writeNote(
  {
    text,
    searchResults,
    citations,
    retweetContext,
  }: z.infer<typeof textAndSearchResults>,
  config: {
    model: string;
  }
): Promise<z.infer<typeof writeNoteOutput>> {
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

      // Only enforce character limit for notes that would be posted
      if (parsed.status === "CORRECTION WITH TRUSTWORTHY CITATION") {
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
      } else {
        // For non-posted notes, just return the result without character limit check
        console.log(
          `Note status: ${parsed.status} - not enforcing character limit`
        );
        return parsed;
      }
    }

    throw new Error("Unexpected error in retry logic");
  } catch (error) {
    console.error("Error in writeNote:", error);
    throw error;
  }
}

writeNoteWithSearch.define(writeNote);
