import { createGoal } from "@tonerow/agent-framework";
import { z } from "zod";
import posts from "./posts.json";
import { llm } from "./llm";
import type { OpenAIChatModelId } from "@ai-sdk/openai/internal";
import type { ChatCompletionContentPartImage } from "openai/resources";
import { textAndSearchResults } from "./schemas";

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

export const searchContextGoal = createGoal({
  name: "search context",
  description: `Given a post and search results, identify the most important missing factual context that would help readers understand the full picture.`,
  input: z.object({
    text: z.string(),
    media: z.array(z.string()),
    imagesSummary: z.string().optional(),
    searchResults: z.string(),
    retweetContext: z.string().optional(),
  }),
  output: textAndSearchResults,
});

sanitizedPosts.map((post, index) =>
  searchContextGoal.test(`Post ${index}`, {
    ...post,
    imagesSummary: "No images",
    searchResults: "<search results here>",
  })
);

export const searchVersionOne = searchContextGoal.register<{
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
    imagesSummary?: string;
    searchResults: string;
    retweetContext?: string;
  },
  config: {
    model: OpenAIChatModelId;
  }
) {
  const images: ChatCompletionContentPartImage[] = input.media.map((url) => ({
    type: "image_url",
    image_url: { url },
  }));

  let systemPrompt = `You are an context and factchecking tool. Search the web for information relating to the following query and always include specific URLs for your sources directly in the text.`;
  
  if (input.retweetContext) {
    systemPrompt += ` ${input.retweetContext}`;
  }

  const result = await llm.create({
    model: config.model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: input.text,
          },
          ...images,
        ],
      },
    ],
  });

  return {
    text: input.text,
    searchResults: result.choices?.[0]?.message?.content ?? "Error",
    citations: (result as any).citations,
    retweetContext: input.retweetContext,
  };
}

searchVersionOne.define(versionOneFn);
