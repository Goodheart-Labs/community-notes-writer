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
}: {
  text: string;
  searchResults: string;
  citations: string[];
}) => `Given this X post and search results about it, identify the most important pieces of context that are missing from the post that would help readers understand the full picture.

Focus only on factual context that materially and significantly changes the interpretation of the post. Do not flag opinions, predictions, or minor details.

Please start by responding with one of the following statuses “TWEET NOT SIGNIFICANTLY INCORRECT” “NO MISSING CONTEXT” “CORRECTION WITH TRUSTWORTHY CITATION” “CORRECTION WITHOUT TRUSTWORTHY CITATION”

If important context is missing, write a community note to correct the claim. Always include a URL, if no url is possible respond with the relevant status. After the status, no more than 500 characters, including the URL. Respond with the following format:
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

export const writeNoteWithSearch = writeNoteWithSearchGoal.register({
  name: "write note with search v1",
  config: [{ model: "anthropic/claude-sonnet-4" }],
});

export async function writeNoteWithSearchFn(
  { text, searchResults, citations }: z.infer<typeof textAndSearchResults>,
  config: {
    model: string;
  }
) {
  try {
    const prompt = promptTemplate({ text, searchResults, citations });

    const result = await llm.create({
      model: config.model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    let content = result.choices?.[0]?.message?.content ?? "";

    // Use the new parser for status, note, url
    return parseStatusNoteUrl(content);
  } catch (error) {
    console.error("Error in writeNoteWithSearchFn:", error);
    throw error;
  }
}

writeNoteWithSearch.define(writeNoteWithSearchFn);
