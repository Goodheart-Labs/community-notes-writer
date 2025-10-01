import { chromium } from "playwright";
import { llm } from "../lib/llm";

export interface UrlSourceCheckResult {
  score: number;              // 0-1 based on claim support
  hasUrl: boolean;
}

// Helper to fetch and simplify page content
async function fetchAndSimplifyContent(url: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

    // Get the main text content (body text)
    const content = await page.evaluate(() => {
      document
        .querySelectorAll("script, style, noscript")
        .forEach((el: Element) => el.remove());
      return document.body.innerText || document.body.textContent || "";
    });

    return content;
  } catch (error) {
    console.error(`[fetchContent] Error fetching ${url}:`, error);
    return "";
  } finally {
    await browser.close();
  }
}

export async function checkUrlAndSource(
  noteText: string,
  url: string
): Promise<UrlSourceCheckResult> {
  // Check if URL exists
  if (!url || url.trim().length === 0) {
    return {
      score: 0,
      hasUrl: false,
    };
  }

  // Fetch the actual content
  const sourceContent = await fetchAndSimplifyContent(url);

  if (!sourceContent || sourceContent.length < 100) {
    return {
      score: 0,
      hasUrl: true,
    };
  }

  const prompt = `Given this source content and a community note, determine if the source DIRECTLY supports the specific factual correction made in the note.

Community note to check:
\`\`\`
${noteText}
\`\`\`

Source URL: ${url}

Source content:
\`\`\`
${sourceContent.substring(0, 30000)} // Limit to avoid token issues
\`\`\`

CRITICAL REQUIREMENTS:
- The source must specifically address the exact claim being corrected (not just general background)
- The source must be recent/relevant to the timeframe discussed in the original post
- The correction must be directly supported by clear statements in the source
- General context or tangentially related information does NOT count

Respond with ONLY a number from 0.0 to 1.0:
- 0.0 if the source lacks any support, is about a different timeframe, or provides only general context
- 0.1-0.3 if the source mentions the topic but doesn't support the specific claims
- 0.4-0.6 if the source partially supports some claims
- 0.7-0.9 if the source supports all claims
- 1.0 if the source directly and comprehensively supports all specific claims

Respond with ONLY the number, no other text. Example: 0.7`;

  try {
    const result = await llm.create({
      model: "anthropic/claude-sonnet-4",
      temperature: 0,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const response = result.choices?.[0]?.message?.content ?? "0";
    const score = parseFloat(response.trim());

    // Validate the score
    if (isNaN(score) || score < 0 || score > 1) {
      console.error(`[urlSourceChecker] Invalid score received: ${response}`);
      return {
        score: 0,
        hasUrl: true,
      };
    }

    return {
      score,
      hasUrl: true,
    };
  } catch (error) {
    console.error("[urlSourceChecker] Error checking claim support:", error);
    return {
      score: 0,
      hasUrl: true,
    };
  }
}

// Batch check multiple URLs
export async function checkUrlsAndSources(
  noteText: string,
  urls: string[]
): Promise<UrlSourceCheckResult[]> {
  return Promise.all(
    urls.map(url => checkUrlAndSource(noteText, url))
  );
}

// Get the best source from a list (highest claim support score)
export function getBestSource(results: UrlSourceCheckResult[]): UrlSourceCheckResult | null {
  if (results.length === 0) return null;

  return results.reduce((best, current) =>
    current.score > best.score ? current : best
  );
}