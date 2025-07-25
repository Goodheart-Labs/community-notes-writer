import { createGoal } from "export-framework";
import { llm } from "./lib/llm";
import { chromium } from "playwright";
import { z } from "zod";
import { writeNoteOutput } from "./schemas";
import { writeNoteWithSearch } from "./writeNoteWithSearchGoal";

const prompt = (
  missingContext: string,
  sourceUrl: string,
  sourceContent: string
) => `
Given this source content and a community note, determine if the source contains information that justifies the claim made in the community note.
Community note to check:
\`\`\`
${missingContext}
\`\`\`
Source URL: ${sourceUrl}
Source content:
\`\`\`
${sourceContent.substring(0, 30000)} // Limit to avoid token issues
\`\`\`
Analyze the source carefully and respond with ONLY:
- “YES” if the source justifies the claim, such that a person could read it and agree with the correction
- “NO” if the source is not very clear on the claim given, in any way.
Do not provide any other text, quotes, or explanations. Just respond with YES or NO.`;

// Helper to fetch and simplify page content
async function fetchAndSimplifyContent(url: string): Promise<string> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    // Get the main text content (body text)
    const content = await page.evaluate(() => {
      document
        .querySelectorAll("script, style, noscript")
        .forEach((el: Element) => (el as any).remove());
      return document.body.innerText || document.body.textContent || "";
    });
    return content;
  } finally {
    await browser.close();
  }
}

export async function check({ url, note }: z.infer<typeof writeNoteOutput>) {
  try {
    if (!url) {
      return "NO";
    }

    // Fetch and simplify the source content
    const sourceContent = await fetchAndSimplifyContent(url);

    const result = await llm.create({
      model: "anthropic/claude-sonnet-4",
      temperature: 0,
      messages: [
        {
          role: "user",
          content: prompt(note, url, sourceContent),
        },
      ],
    });

    return result.choices?.[0]?.message?.content ?? "";
  } catch (error) {
    console.error("Error in check function:", error);
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export const checkSource = createGoal({
  name: "check source",
  description:
    "Check if a source contains information that addresses the missing context",
  input: writeNoteOutput,
  output: z.string(),
});

const c = checkSource.register({ name: "check" });
c.define(check);

checkSource.testFrom(writeNoteWithSearch);
