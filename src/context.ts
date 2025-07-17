/**
 * Context goal evaluates posts for potentially misleading content
 * and determines what context would be beneficial for Community Notes.
 */

import { createGoal } from "export-framework";
import { z } from "zod";
import posts from "./posts.json";
import { getCompletion, llm, openai } from "./llm";
import type { OpenAIChatModelId } from "@ai-sdk/openai/internal";

export const contextGoal = createGoal({
  name: "context",
  description: `Evaluate posts for potentially misleading content and determine what context would be beneficial for Community Notes.`,
  input: z.string(),
  output: z.object({
    reasoning: z.string(),
    citations: z.array(z.string()),
    time: z.number(),
  }),
});

posts.map(({ text }, index) => contextGoal.test(`Post ${index}`, text));

const versionOne = contextGoal.register<{
  model: OpenAIChatModelId;
}>({
  name: "version one",
  config: [
    { model: "openai/gpt-4o-mini" },
    {
      model: "perplexity/sonar",
    },
  ],
});

versionOne.define(async (input, config) => {
  const start = Date.now();

  const prompt = `Community Notes aim to create a better informed world by empowering people on X to collaboratively add context to potentially misleading posts. Contributors can leave notes on any post and if enough contributors from different points of view rate that note as helpful, the note will be publicly shown on a post.

Is this post potentially misleading? Why and what context would people benefit from seeing next to this post?

Post: ${input}`;

  const result = await llm.create({
    model: config.model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const reasoning = result.choices?.[0]?.message?.content ?? "Error";

  // Citations available on citations property
  const citations = ("citations" in result ? result.citations : []) as string[];

  console.log({ result, citations });

  const end = Date.now();

  return {
    reasoning,
    citations,
    time: end - start,
  };
});
