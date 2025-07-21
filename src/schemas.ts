import { z } from "zod";

export const textAndSearchResults = z.object({
  text: z.string(),
  citations: z.array(z.string()),
  searchResults: z.string(),
});
