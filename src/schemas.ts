import { z } from "zod";

export const textAndSearchResults = z.object({
  text: z.string(),
  citations: z.array(z.string()),
  searchResults: z.string(),
});

export const writeNoteOutput = z.object({
  status: z
    .string()
    .describe(
      "TWEET NOT SIGNIFICANTLY INCORRECT, NO MISSING CONTEXT, CORRECTION WITH TRUSTWORTHY CITATION, CORRECTION WITHOUT TRUSTWORTHY CITATION"
    ),
  note: z.string().describe("Short correction of most significant error"),
  url: z.string().optional().describe("URL of most trustworthy source"),
});
