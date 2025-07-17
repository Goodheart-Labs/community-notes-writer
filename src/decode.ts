/**
 * Decode is an attempt at combining things like,
 * finding the missing context, picking up on irony
 * or sarcasm, and surfacing any implicit assumptions
 * in the framing of the post.
 */

import { createGoal } from "export-framework";
import { z } from "zod";
import posts from "./posts.json";
import type { OpenRouterChatModelId } from "@openrouter/ai-sdk-provider/internal";
import { getCompletion } from "./llm";

export const decodeGoal = createGoal({
  name: "decode",
  description: `Decode the post to understand what the user is really saying. Find missing context, irony, sarcasm, and implicit assumptions.`,
  input: z.string(),
  output: z.object({
    result: z.string(),
    time: z.number(),
  }),
});

posts.map(({ text }, index) => decodeGoal.test(`Post ${index}`, text));

const versionOne = decodeGoal.register<{
  model: OpenRouterChatModelId;
}>({
  name: "version one",
  config: [
    { model: "anthropic/claude-sonnet-4" },
    {
      model: "openai/gpt-4o-mini",
    },
  ],
});

versionOne.define(async (input, config) => {
  const start = Date.now();

  const prompt = `The following is a post from Twitter. Some posts are direct, but many are indirect. If the post is indirect, please attempt to understand what the user is really saying. Do this by stating any missing context, describing any irony or sarcasm, and surfacing any implicit assumptions in the framing of the post.
  
  Post: ${input}
  `;

  const result = await getCompletion(prompt, config.model);

  const end = Date.now();
  return {
    result,
    time: end - start,
  };
});
