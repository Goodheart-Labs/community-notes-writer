import { createGoal } from "export-framework";
import { z } from "zod";
import { llm } from "./llm";
import type { OpenAIChatModelId } from "@ai-sdk/openai/internal";

export const verifyContextWithSourceGoal = createGoal({
  name: "verify context with source",
  description: `Given a source and a piece of missing context, determine if the source addresses the missing context.`,
  input: z.object({
    missingContext: z.string(),
    sourceUrl: z.string(),
    sourceContent: z.string(),
  }),
  output: z.object({
    result: z.enum(["YES", "NO"]),
    time: z.number(),
  }),
});

const versionOne = verifyContextWithSourceGoal.register<{
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
    missingContext: string;
    sourceUrl: string;
    sourceContent: string;
  },
  config: {
    model: OpenAIChatModelId;
  }
) {
  const start = Date.now();
  const prompt = `Given this source content and a piece of missing context, determine if the source contains information that addresses the missing context.\nMissing context needed:\n\
\`\`\`\n${input.missingContext}\n\`\`\`\nSource URL: ${
    input.sourceUrl
  }\nSource content:\n\`\`\`\n${input.sourceContent.substring(
    0,
    30000
  )}\n\`\`\`\nAnalyze the source carefully and respond with ONLY:\n- “YES” if the source justifies the claim, such that a person could read it and agree with the correction\n- “NO” if the source is not very clear on the claim given, in any way.\nDo not provide any other text, quotes, or explanations. Just respond with YES or NO.`;

  const result = await llm.create({
    model: config.model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content =
    result.choices?.[0]?.message?.content?.trim().toUpperCase() ?? "NO";
  const answer = content === "YES" ? "YES" : "NO";
  const end = Date.now();
  return {
    result: answer as "YES" | "NO",
    time: end - start,
  };
}

versionOne.define(versionOneFn);
