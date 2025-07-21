import { createGoal } from "export-framework";
import { z } from "zod";
import posts from "./posts.json";
import { llm } from "./llm";

export const writeNoteGoal = createGoal({
  name: "write note",
  description: "Write a Community Note for a post on X (formerly Twitter).",
  input: z.object({
    post: z.string(),
    reasoning: z.string(),
    citations: z.array(z.string()),
  }),
  output: z.string(),
});

writeNoteGoal.test("nc flood", {
  post: posts[0]?.text ?? "",
  reasoning:
    'The post "🚨North Carolina FLOODING AGAIN! And we ALLLLLL know why!" is potentially misleading because it implies a clear, singular cause of the flooding without specifying what that cause is, leaving it open to interpretation and possibly politicization or misinformation. \n\nThe flooding in North Carolina in July 2025 is primarily due to **Tropical Storm Chantal**, which brought historic and record-breaking rainfall leading to severe flooding, infrastructure damage, water rescues, deaths, and ongoing flood threats in the region[1][2][3][4]. This tropical storm developed near the Southeast Atlantic coast and stalled for a time, dumping large amounts of rain over central North Carolina and surrounding areas[1][4]. \n\nPeople would benefit from seeing context explaining:\n- The flooding is caused by natural weather events linked to Tropical Storm Chantal rather than vague or politically charged assertions.\n- Chantal was the third named storm of the 2025 Atlantic hurricane season, noted for heavy, slow-moving rain rather than strong winds, causing prolonged flooding risks[1][4].\n- The storm resulted in at least 8 deaths, significant water infrastructure damage, and ongoing emergency management efforts[1][2][3].\n- Flood warnings remain in effect and residents are advised to follow local safety guidance[2][3].\n\nProviding this meteorological and safety context helps clarify that the flooding is a serious weather-related disaster, rather than attributing it to unspecified causes. This reduces the risk of misleading interpretations and promotes better public understanding and response.\n\nTherefore, a helpful Community Note could say:\n> "The recent flooding in North Carolina is a result of Tropical Storm Chantal, which brought heavy rains and historic flooding across central NC in early July 2025. The storm caused significant damage, deaths, and ongoing flood risks. Residents are advised to heed local safety warnings and updates. This context clarifies the flooding is due to natural severe weather and ongoing meteorological conditions."',
  citations: [
    "https://www.accuweather.com/en/hurricane/8-dead-in-north-carolina-after-tropical-storm-chantal/1793741",
    "https://www.foxweather.com/weather-news/carolinas-mid-atlantic-flood-threat-chantal",
    "https://carolinapublicpress.org/71508/chantal-causes-widespread-flooding-in-central-nc/",
    "https://climate.ncsu.edu/blog/2025/07/rapid-reaction-tropical-storm-chantal-soaks-central-north-carolina/",
  ],
});

writeNoteGoal.test("uk immigration", {
  post: "Jenrick was Immigration Minister when the government learnt of the worst data breach in British history.\n\nHe was Immigration Minister when the government got a super injunction - the worst cover up in recent history.\n\n24k Afghans get asylum, costing £7 billion.\n\nUnforgivable. https://t.co/DLzL46LLZ0",
  reasoning:
    'The post in question is **potentially misleading** for several reasons that warrant providing additional context:\n\n1. **Role Timing and Responsibility**  \n   The post asserts that Robert Jenrick was Immigration Minister when "the government learnt of the worst data breach in British history" and when "the government got a super injunction," implying direct responsibility or involvement by Jenrick in these incidents. However, available information shows that Jenrick served as Minister of State for Immigration from **October 25, 2022, until his resignation on December 6, 2023**[2][4]. The specific data breach mentioned is not clearly detailed in the search results, and no direct link to Jenrick’s role or timing is established in the available sources. Likewise, the reference to a "super injunction - the worst cover up in recent history" lacks substantiation or explanation connected to Jenrick\'s term, making the claim ambiguous and potentially misleading.\n\n2. **Asylum Figures and Cost Assertion**  \n   The claim that "24k Afghans get asylum, costing £7 billion" is presented without context. While asylum costs are significant and publicly debated, the number of Afghan asylum seekers and the precise cost figure require accurate, up-to-date sources and context regarding government spending on asylum generally versus specific groups. The claim is framed negatively ("Unforgivable") without clarifying policy details, outcomes, or challenges that affect asylum processing and budget allocation. Also, Jenrick resigned over disagreements with immigration policies such as the Rwanda deportation plan, which reflects complexity beyond simple cost accusations[1][3].\n\n3. **Political Nuance**  \n   Jenrick adopted a hardline stance on immigration during his tenure, advocating strict policies; however, he resigned due to disagreements with government policy shifts, notably on the Rwanda deportation plan[1][3]. Presenting him as solely responsible for all alleged failures or controversial events oversimplifies his political position and the multifaceted nature of government decisions on immigration.\n\n---\n\n### Recommended Context To Add as a Community Note\n\n- **Clarification on Jenrick’s term and responsibilities:** Jenrick served as Immigration Minister from October 2022 to December 2023. The exact timing and connection to the alleged data breach or super injunction are unclear and not directly supported by evidence.  \n- **Details on asylum figures and costs:** Numbers relating to Afghan asylum seekers and associated costs need reliable sources and explanations on budget context and government policy challenges to avoid misleading implications.  \n- **Political and policy context:** Jenrick resigned due to policy disagreements, illustrating complexity in immigration policy rather than simple endorsement or failure. His tenure involved controversial but not unchecked immigration actions, with a focus on immigration control and reform.  \n- **Lack of evidence for "worst cover up" claims:** Claims about a super injunction as a "worst cover up" lack substantiated public information tying it to Jenrick\'s time as Minister or government actions directly attributable to him.\n\nAdding this context would help readers better understand the complexities of the issues, Jenrick’s role, and avoid misconceptions arising from unsupported or oversimplified claims.\n\n---\n\n**In summary:** The post is misleading because it attributes serious government failures and controversies to Jenrick without clear evidence and oversimplifies complex immigration issues, asylum costs, and political dynamics. Additional context about timelines, roles, and policy nuance is necessary to provide a balanced understanding.',
  citations: [
    "https://news.sky.com/story/robert-jenrick-resigns-as-immigration-minister-over-governments-rwanda-plan-home-office-minister-13024262",
    "https://en.wikipedia.org/wiki/Robert_Jenrick",
    "https://politicsuk.com/robert-jenrick-the-king-across-the-water/",
    "https://www.gov.uk/government/people/robert-jenrick",
    "https://www.youtube.com/watch?v=5-5tUBhQQSQ",
  ],
});

const writeNoteV1 = writeNoteGoal.register({
  name: "write note v1",
  config: [{ model: "anthropic/claude-sonnet-4" }],
});

export async function writeNoteV1Fn(
  {
    post,
    reasoning,
    citations,
  }: {
    post: string;
    reasoning: string;
    citations: string[];
  },
  config: {
    model: string;
  }
) {
  const prompt = `You are writing a Community Note for a post on X (formerly Twitter).

POST: ${post}

RESEARCH AND REASONING:
${reasoning}

CITATIONS:
${citations.join("\n")}

COMMUNITY NOTES RATING SIGNALS:

### Positive Signals
- Cites high-quality sources
- Easy to understand
- Directly addresses the post's claim
- Provides important context
- Neutral or unbiased language

### Negative Signals
- Sources not included or unreliable
- Sources do not support note
- Incorrect information
- Opinion or speculation
- Typos or unclear language
- Misses key points or irrelevant
- Argumentative or biased language
- Note not needed on this post

Write a succinct Community Note using the research and reasoning provided. Your note should be extremely direct and dry, typically one to two short sentences, and should begin by directly addressing the misleading nature of the post (e.g., "This photo is...", "There is no evidence that...", "These numbers are..."). Avoid any opinion or unnecessary commentary. Include one or two of the best supporting links, placing each on a new line at the end of the note if present. Do not use any markdown or special formatting in your response.`;

  const result = await llm.create({
    model: config.model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return result.choices?.[0]?.message?.content ?? "Error generating note";
}

writeNoteV1.define(writeNoteV1Fn);
