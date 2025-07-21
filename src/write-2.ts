import { createGoal } from "export-framework";
import { z } from "zod";
import { llm } from "./llm";
import posts from "./posts.json";
import { searchVersionOne } from "./searchContext";
import { textAndSearchResults } from "./schemas";

// Define the goal schema, similar to searchContext.ts
export const writeNoteWithSearchGoal = createGoal({
  name: "write note with search",
  description:
    "Write a Community Note for a post on X using search results for context.",
  input: textAndSearchResults,
  output: z.object({
    content: z.string(),
    time: z.number(),
  }),
});

writeNoteWithSearchGoal.testFrom(searchVersionOne);

const sanitizedPosts = [
  {
    text: posts[0]!.text,
    searchResults: `North Carolina has indeed experienced significant flooding events in July 2025, with multiple incidents occurring within a short timeframe. Here's what happened:

## **Tropical Storm Chantal's Initial Impact**

In early July 2025, Tropical Storm Chantal brought devastating flooding to North Carolina[1]. The storm prompted more than 50 water rescues in Chapel Hill alone, with the Chapel Hill Fire Department and neighboring agencies rescuing people from flooded apartments and shopping centers where water had inundated parking lots and businesses[1]. The Haw River crested at 32.5 feet during this event[1]. More than 60 people were displaced, and over 23,000 customers lost power across the state[1].

## **Additional Flooding Days Later**

Just days after Chantal's impact, North Carolina was hit by another round of severe flooding on July 10, 2025[2]. Slow-moving thunderstorms brought additional flash flood warnings to areas that had already been impacted by Tropical Storm Chantal, including Chapel Hill, Hillsborough, Durham, Raleigh, and Mebane[2]. The Granville County Sheriff's Office reported at least 2 feet of water near C.G. Credle Elementary School in Oxford, NC during this second event[2].

## **State Emergency Declaration**

The severity and repeated nature of these flooding events prompted Governor Josh Stein to declare a state of emergency on July 18, 2025[5]. This declaration allows North Carolina to seek federal funding to help with overloaded response efforts. The flooding from Tropical Storm Chantal resulted in at least six fatalities[5].

The repeated flooding in such a short timeframe - first from Tropical Storm Chantal in early July, followed by additional severe flooding just days later - created a particularly challenging situation for communities already dealing with saturated ground and damaged infrastructure from the initial storm.

Sources:
- https://www.cbsnews.com/news/north-carolina-flooding-2025-chapel-hill-durham-haw-river/
- https://www.youtube.com/watch?v=SS0RSppHTcs
- https://wlos.com/news/local/severe-weather-tropical-storm-chantal-north-carolina-state-emergency-federal-funding-governor-josh-stein-july-fourth-weekend-rain-flooding-death-toll`,
  },
];

writeNoteWithSearchGoal.test("Post 0", sanitizedPosts[0]!);

const promptTemplate = ({
  text,
  searchResults,
}: {
  text: string;
  searchResults: string;
}) => `Given this X post and search results about it, identify the most important pieces of context that are missing from the post that would help readers understand the full picture.
Focus only on factual context that materially and significantly changes the interpretation of the post. Do not flag opinions, predictions, or minor details.
Please start by responding with one of the following statuses “TWEET NOT SIGNIFICANTLY INCORRECT” “NO MISSING CONTEXT” “CORRECTION WITH TRUSTWORTHY CITATION” “CORRECTION WITHOUT TRUSTWORTHY CITATION”
If important context is missing, write a community note to correct the claim. Always include a URL, if no url is possible respond with the relevant status. After the status, no more than 500 characters, including the URL
[Status]
[Short correction of most significant error]
[URL of most trustworthy source]
Post perhaps in need of community note:
\`\`\`
${text}
\`\`\`
Perpelexity search results (please use citations in these to correct post):
\`\`\`
${searchResults}
\`\`\``;

const writeNoteWithSearch = writeNoteWithSearchGoal.register({
  name: "write note with search v1",
  config: [{ model: "anthropic/claude-sonnet-4" }],
});

export async function writeNoteWithSearchFn(
  {
    text,
    searchResults,
  }: {
    text: string;
    searchResults: string;
  },
  config: {
    model: string;
  }
) {
  const start = Date.now();

  const prompt = promptTemplate({ text, searchResults });

  const result = await llm.create({
    model: config.model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  // Parse the result into status, correction, url
  const content = result.choices?.[0]?.message?.content ?? "Error";

  const end = Date.now();

  return {
    content,
    time: end - start,
  };
}

writeNoteWithSearch.define(writeNoteWithSearchFn);
