import { z } from "zod";

export const textAndSearchResults = z.object({
  text: z.string(),
  citations: z.array(z.string()),
  searchResults: z.string(),
  retweetContext: z.string().optional(),
});

export const writeNoteOutput = z.object({
  status: z
    .enum([
      "TWEET NOT SIGNIFICANTLY INCORRECT",
      "NO MISSING CONTEXT",
      "NO SUPPORTING SOURCE FOUND",
      "CORRECTION WITH TRUSTWORTHY CITATION",
      "CORRECTION WITHOUT TRUSTWORTHY CITATION"
    ])
    .describe(
      "Status of the note evaluation. Choose one: TWEET NOT SIGNIFICANTLY INCORRECT (tweet is accurate), NO MISSING CONTEXT (no context needed), NO SUPPORTING SOURCE FOUND (cannot find reliable sources), CORRECTION WITH TRUSTWORTHY CITATION (correction with good source), or CORRECTION WITHOUT TRUSTWORTHY CITATION (correction but source is weak)"
    ),
  note: z.string().describe("Short correction of most significant error"),
  url: z.string().optional().describe("URL of most trustworthy source (required for CORRECTION WITH TRUSTWORTHY CITATION)"),
});
