import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { z } from "zod";

export const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const llm = openai.chat.completions;

export async function getCompletion(prompt: string, model: string) {
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  console.log(completion);

  return completion.choices?.[0]?.message?.content;
}

export async function getObject(
  prompt: string,
  model: string,
  schema: z.ZodType
) {
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: zodResponseFormat(schema, "schema"),
    });

    console.log(completion);

    return completion.choices?.[0]?.message?.content;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
