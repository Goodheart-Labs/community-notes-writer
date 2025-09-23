import { generateObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { readFileSync } from "fs";
import { join } from "path";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export interface SarcasmResult {
  score: number; // 0 = definitely sarcastic, 1 = definitely sincere
  reasoning: string; // Brief explanation
}

const sarcasmSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "0 = definitely sarcastic/rhetorical/joke, 1 = definitely sincere factual claim"
    ),
  reasoning: z
    .string()
    .describe("One sentence explanation of why this score was given"),
});

export async function checkSarcasmV2(
  tweetText: string,
  quoteContext?: string,
  imageUrl?: string
): Promise<SarcasmResult> {
  const fullContext = quoteContext
    ? `Tweet: "${tweetText}"\n\nQuote tweet context: "${quoteContext}"`
    : `Tweet: "${tweetText}"`;

  const textPrompt = `Analyze this tweet for claims that can be fact-checked, as opposed to opinion, rhetorical questions, or jokes.

${fullContext}

Consider:
- Does the tweet contain any non-vague factual claim? (score higher)
- Is the tweet clearly solely an opinion? (score lower)
- Is the tweet entirely a rhetorical question not meant to be answered literally? (score lower)
- Does the tweet contain a statistic or fact even if unsubstantiated? (score higher)

Return a score from 0 to 1:
- 0.0-0.2: Entirely opinion
- 0.2-0.4: Humourous claims or ones that no typical person would consider to be serious
- 0.4-0.6: Unclear/borderline
- 0.6-0.8: Any one factual claim
- 0.8-1.0: Multiple factual claims

IMPORTANT: Return ONLY a JSON object with:
- score: a number between 0 and 1
- reasoning: a single string (one sentence) explaining the score`;

  try {
    const messages: any[] = [
      {
        role: "user",
        content: imageUrl
          ? [
              { type: "text", text: textPrompt },
              { type: "image", image: imageUrl },
            ]
          : textPrompt,
      },
    ];

    const { object } = await generateObject({
      model: openrouter("anthropic/claude-3.5-sonnet"),
      schema: sarcasmSchema,
      messages,
      temperature: 0.2,
      mode: "json",
      system:
        "You are a JSON API that returns exactly the requested format. The reasoning field must be a simple string, not an object.",
    });

    return {
      score: object.score,
      reasoning: object.reasoning,
    };
  } catch (error) {
    console.error("[sarcasmFilterV2] Error checking sarcasm:", error);
    // Default to passing if there's an error
    return {
      score: 0.7,
      reasoning: "Error in sarcasm detection, defaulting to likely sincere",
    };
  }
}

async function testSelectedTweets() {
  console.log("Loading selected tweet IDs...");

  // Load the selected tweet IDs
  const tweetIdsPath = join(
    process.cwd(),
    "data-export-selected-tweet-ids.txt"
  );
  const tweetIdsContent = readFileSync(tweetIdsPath, "utf8");
  const tweetIds = tweetIdsContent
    .trim()
    .split("\n")
    .filter((id) => id.trim());

  // Load the sarcastic tweet IDs (should be > 0.5)
  const sarcasticIdsPath = join(
    process.cwd(),
    "data-export-selected-tweet-ids-sarcastic.txt"
  );
  const sarcasticIdsContent = readFileSync(sarcasticIdsPath, "utf8");
  const sarcasticIds = new Set(
    sarcasticIdsContent
      .trim()
      .split("\n")
      .filter((id) => id.trim())
  );

  console.log(`Found ${tweetIds.length} selected tweet IDs`);
  console.log(
    `Found ${sarcasticIds.size} IDs that should be > 0.5 (sarcastic/non-factual)`
  );

  // Load the exported data
  const dataPath = join(
    process.cwd(),
    "data-export-airtable-2025-09-23T14-17-04-792Z.json"
  );
  const dataContent = readFileSync(dataPath, "utf8");
  const exportData = JSON.parse(dataContent);

  console.log(`Loaded ${exportData.recordCount} total records`);

  // Create a map of tweet ID to record for fast lookup
  const tweetMap = new Map();
  exportData.records.forEach((record: any) => {
    const url = record.fields["URL"] || "";
    const tweetId = url.split("/").pop();
    if (tweetId) {
      tweetMap.set(tweetId, record);
    }
  });

  console.log("\\n=== TESTING SARCASM FILTER V2 ===\\n");

  // Test each selected tweet
  for (const tweetId of tweetIds) {
    const record = tweetMap.get(tweetId);
    if (!record) {
      console.log(`❌ Tweet ID ${tweetId}: Not found in data`);
      continue;
    }

    const tweetText = record.fields["Initial post text"] || "";
    const shouldBeHigh = sarcasticIds.has(tweetId); // Should be > 0.5

    // Parse the initial tweet body JSON to look for images
    let imageUrl: string | undefined;
    try {
      const tweetBodyJson = JSON.parse(
        record.fields["Initial tweet body"] || "{}"
      );
      if (tweetBodyJson.media && tweetBodyJson.media.length > 0) {
        // Find the first image in the media array
        const imageMedia = tweetBodyJson.media.find(
          (media: any) => media.type === "photo"
        );
        if (imageMedia && imageMedia.url) {
          imageUrl = imageMedia.url;
        }
      }
    } catch (error) {
      // If JSON parsing fails, continue without image
    }

    try {
      const result = await checkSarcasmV2(tweetText, undefined, imageUrl);
      const truncatedText =
        tweetText.substring(0, 50).replace(/\\n/g, " ") +
        (tweetText.length > 50 ? "..." : "");

      // Check if V2 result matches expectation
      const v2IsHigh = result.score > 0.5;
      const isCorrect = shouldBeHigh === v2IsHigh;
      const resultIcon = isCorrect ? "✅" : "❌";

      const imageIcon = imageUrl ? "🖼️ " : "";

      console.log(
        `${resultIcon} ${imageIcon}"${truncatedText}" | Expected: ${
          shouldBeHigh ? ">0.5" : "≤0.5"
        } | V2: ${result.score.toFixed(2)}`
      );
      // show reasoning if it fails
      if (!isCorrect) {
        console.log(`   Reasoning: ${result.reasoning}`);
      }

      // Small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.log(`❌ Tweet ID ${tweetId}: Error processing - ${error}`);
    }
  }

  console.log("\\n=== TESTING COMPLETE ===");
}

if (require.main === module) {
  testSelectedTweets().catch(console.error);
}
