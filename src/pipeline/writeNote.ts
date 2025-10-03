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
}) => `TASK: Analyze this X post and determine if it contains inaccuracies that require additional context, then write a note to provide that additional context.

CRITICAL ANALYSIS STEPS:
1. IDENTIFY THE SPECIFIC CLAIM: What exact factual assertion is the post making?
2. CONSIDER POSSIBLE CONFLICT: Do the search results suggest that significant additional context is required
3. CHOOSE SOURCE: Choose the most authoritative and directly relevant source URL from the citations that best supports the additional context

Please write the note in the following fashion:
- Give the additional relevant context.
- Generally do not attempt to summarise the original tweet or say "This tweet is false"
- Only refer to "errors" in the original tweet if it is required to make clear how the context is relevant.
- *DO NOT* discuss there being a lack of evidence/reports for something unless the source you're going to include says exactly that. The world is fast moving and new evidence may have appeared. ONLY say what you know from the source that is linked
- *DO NOT* refer to sources that you have not provided a link to.
- The note *MUST* be fewer than 280 characters, with URLS only counting as 1

Note:
- Trump won the 2024 election. If the claim relates to his actions as President it may mean 2016 - 2020, or it may mean 2024 - present. Do not mention this unless it is relevant to the context.

RESPONSE FORMAT:

Reasoning:
[Go through critical analysis steps 1-3 above, and explain your reasoning.]

Status:
[One of: "TWEET NOT SIGNIFICANTLY INCORRECT" "NO MISSING CONTEXT" "NO SUPPORTING SOURCE FOUND" "CORRECTION WITH TRUSTWORTHY CITATION"]

Note:
[If status is CORRECTION WITH TRUSTWORTHY CITATION, provide the note text without URL, otherwise leave blank]
[URL that specifically supports the note if applicable]

Note examples:

Bad note: 

The claim that President Trump "has reportedly not been seen in several days" and rumors of his death are false. Trump has had recent public activity and political actions as recently as August 29, 2025, according to verified news reports.

[link]

Good note:

Trump was seen golfing on August 29, 2025, according to Reuters. 

[link]

Explanation:

Do not summarise or editorialise on the original post. His death might be real for all we know. But what we do know is that there was evidence of his public appearances and activities on August 29, 2025. So that is what we will say, and then provide a link. 

Bad note:

Post falsely claims UP is #1 in factories (15.91%) and GVA (25.03%). ASI 2023-24 shows UP ranks 4th in factories with 8.51%, behind Tamil Nadu, Gujarat, Maharashtra. UP's GVA share is 7%, not 25.03%.

[link]

Good note:

ASI 2023-24 shows Uttar Pradesh ranks 4th in factories with 8.51%, behind Tamil Nadu, Gujarat, Maharashtra. UP's GVA share is 7%, not 25.03% as claimed.

[link]

Explanation:

Bad note attempts to summarise original post. Readers don't need this, they can see it. Also it says the post is false. Instead we prefer to provide additional context.

Bad note:

This photograph is not from Rudy Giuliani's car accident. News reports describe Giuliani being "struck from behind at high speed," while this image shows a head-on collision that doesn't match the incident description.

[link]

Good note

News reports describe Giuliani being "struck from behind at high speed," while this image shows a head-on collision that doesn't match the incident description.

Explanation:

We don't say what the photo is or is not. Instead we give context for why the photo is likely wrong. 

[link]

Information:

Post perhaps in need of community note:
\`\`\`
${text}
\`\`\`

Possible context that tweet is quoting (may be empty):
\`\`\`
${retweetContext}
\`\`\`

Perplexity search results:
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
CRITICAL FAILURE: Your previous note was ${characterCount} characters (URLs only count as 1) - this VIOLATES the strict 280 character limit! You MUST drastically reduce this length NOW. This is NOT a suggestion - it is MANDATORY.

REQUIRED ACTIONS:
- CUT unnecessary words and filler phrases
- Use shorter synonyms and abbreviations  
- ELIMINATE any non-essential details
- Remove redundant information
- Make every single word count

The 280 character limit is ABSOLUTE and NON-NEGOTIABLE. FAILURE to comply will result in rejection.

Previous note: "${previousNote}"

Possible context that tweet is quoting (may be empty):
\`\`\`
${retweetContext}
\`\`\`

Perplexity search results:
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
        // Calculate actual character count (URLs count as 1)
        let charCount = parsed.note.length;
        if (parsed.url) {
          // URL counts as 1 character in Community Notes
          charCount = parsed.note.length + 1 + 1; // +1 for space, +1 for URL
        }

        if (charCount <= 280) {
          return parsed;
        }

        // Store for potential retry
        previousParsed = parsed;

        // If we've reached max retries, return the last result even if it's too long
        if (attempt >= maxRetries) {
          console.warn(
            `Note still exceeds 280 characters after ${maxRetries} attempts: ${charCount} characters (with URL counting as 1)`
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
