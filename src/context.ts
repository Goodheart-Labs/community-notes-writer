/**
 * Context goal evaluates posts for potentially misleading content
 * and determines what context would be beneficial for Community Notes.
 */

import { createGoal } from "export-framework";
import { z } from "zod";
import posts from "./posts.json";
import { llm } from "./llm";
import type { OpenAIChatModelId } from "@ai-sdk/openai/internal";
import type { ChatCompletionContentPartImage } from "openai/resources";

const sanitizedPosts = posts.map(({ text, media }) => {
  return {
    text,
    media: media
      .map((m) =>
        "url" in m
          ? m.url
          : "preview_image_url" in m
          ? m.preview_image_url
          : null
      )
      .filter((m): m is string => Boolean(m)),
  };
});

export const contextGoal = createGoal({
  name: "context",
  description: `Evaluate posts for potentially misleading content and determine what context would be beneficial for Community Notes.`,
  input: z.object({
    text: z.string(),
    media: z.array(z.string()),
  }),
  output: z.object({
    reasoning: z.string(),
    citations: z.array(z.string()),
    time: z.number(),
  }),
});

sanitizedPosts.map((post, index) => contextGoal.test(`Post ${index}`, post));

const versionOne = contextGoal.register<{
  model: OpenAIChatModelId;
}>({
  name: "version one",
  config: [
    {
      model: "perplexity/sonar",
    },
  ],
});

export async function versionOneFn(
  input: {
    text: string;
    media: string[];
  },
  config: {
    model: OpenAIChatModelId;
  }
) {
  const start = Date.now();

  const prompt = `Community Notes aim to create a better informed world by empowering people on X to collaboratively add context to potentially misleading posts. Contributors can leave notes on any post and if enough contributors from different points of view rate that note as helpful, the note will be publicly shown on a post.

Is this post potentially misleading? Why and what context would people benefit from seeing next to this post?

Begin your evaluation by independently verifying any sources or evidence cited by the post. Assess whether each source is credible, and whether the post's interpretation or summary of the source accurately reflects the source's intended meaning or findings. Only after this, proceed to question the claims and context provided by the post itself.

When evaluating, consider whether the post provides credible sources for its claims. If sources are given, question and attempt to confirm them. If no sources are provided, try to independently confirm the information; if you cannot, note that this lack of verifiability makes the post more likely to be misleading.

Post: ${input.text}`;

  const images: ChatCompletionContentPartImage[] = input.media.map((url) => ({
    type: "image_url",
    image_url: { url },
  }));

  const result = await llm.create({
    model: config.model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          ...images,
        ],
      },
    ],
  });

  const reasoning = result.choices?.[0]?.message?.content ?? "Error";

  // Citations available on citations property
  const citations = ("citations" in result ? result.citations : []) as string[];

  const end = Date.now();

  return {
    reasoning,
    citations,
    time: end - start,
  };
}

versionOne.define(versionOneFn);

const findContextPeriod = contextGoal.register<{
  model: OpenAIChatModelId;
}>({
  name: "find context.",
  config: [{ model: "perplexity/sonar" }],
});

// findContextPeriod.define(async (input, config) => {
//   const start = Date.now();

//   const prompt = `Find context and information about this tweet: "${input.text}"`;
// });
