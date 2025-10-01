import type { PipelineResult } from "../scripts/createNotesRoutine";
import { generateObject } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import z from "zod";
import Airtable from "airtable";

interface RerunQueueEntry {
  "Tweet ID": string;
  "Status URL": string;
  Reasoning: string;
}

export class RerunQueueLogger {
  private base: Airtable.Base;
  private tableName: string;

  constructor() {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;

    if (!apiKey || !baseId) {
      throw new Error(
        "Missing required environment variables: AIRTABLE_API_KEY, AIRTABLE_BASE_ID"
      );
    }

    this.base = new Airtable({ apiKey }).base(baseId);
    this.tableName = "RerunQueue";
  }

  async logRerunEntry(entry: RerunQueueEntry): Promise<void> {
    try {
      await this.base(this.tableName).create([{ fields: entry as any }]);
      console.log(
        `[RerunQueueLogger] Successfully logged rerun entry for Tweet ID: ${entry["Tweet ID"]}`
      );
    } catch (error) {
      console.error("[RerunQueueLogger] Error logging to Airtable:", error);
      throw error;
    }
  }

  async getRerunQueueTweetIds(): Promise<Set<string>> {
    const tweetIds = new Set<string>();

    try {
      // Get tweets from the last 24 hours to avoid processing very old rerun requests
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      await this.base(this.tableName)
        .select({
          fields: ["Tweet ID", "Created At"],
          pageSize: 100,
          filterByFormula: `IS_AFTER({Created At}, '${oneDayAgo.toISOString()}')`,
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach((record) => {
            const tweetId = record.get("Tweet ID");
            if (tweetId) tweetIds.add(tweetId.toString());
          });
          fetchNextPage();
        });

      console.log(
        `[RerunQueueLogger] Found ${tweetIds.size} tweets in rerun queue from last 24 hours`
      );
      return tweetIds;
    } catch (error) {
      console.error("[RerunQueueLogger] Error fetching rerun queue:", error);
      // Return empty set on error to allow processing to continue
      return new Set();
    }
  }
}

/**
 * Consider whether to allow a note to be revived
 * based on the recency of the subject matter in
 * the note. Add worth-reviving tweet id's to a special table
 * in the database.
 */
export async function considerForRerun(result: PipelineResult) {
  const prompt = `You are evaluating whether a community note should be rerun based on whether new information is likely to surface in the next 3 hours that could change the note's accuracy.

ANALYSIS FRAMEWORK:
1. **Tweet Nature**: Examine the type of claims made (breaking news, ongoing events, historical facts, satirical content, etc.)
2. **Information Velocity**: Consider how quickly information typically emerges for this type of content
3. **Time Sensitivity**: Evaluate if this is time-sensitive content where new developments are expected
4. **Source Reliability**: Assess whether the claims come from sources that typically have follow-up information

DECISION: Return true if new information is likely to surface in the next 3 hours that could change the verifiability or accuracy of the note. Return false if the content is unlikely to have new developments (e.g., historical facts, satirical content, personal opinions, or claims that are unlikely to have follow-up information).

PIPELINE RESULT DATA:
${JSON.stringify(result, null, 2)}

Should this note be rerun based on the likelihood of new information surfacing in the next 3 hours?`;

  const { object, reasoning } = await generateObject({
    model: openrouter("google/gemini-2.5-flash-lite"),
    schema: z.object({
      shouldRerun: z.boolean(),
    }),
    messages: [{ role: "user", content: prompt }],
    providerOptions: {
      openrouter: {
        reasoning_effort: "high",
      },
    },
    temperature: 0.2,
    mode: "json",
  });

  console.log(`[considerForRerun] Reasoning: ${reasoning}`);

  // If we should rerun, log to the RerunQueue table
  if (object.shouldRerun) {
    try {
      const logger = new RerunQueueLogger();
      const tweetId = result.post.id;
      const statusUrl = `https://twitter.com/i/status/${tweetId}`;

      await logger.logRerunEntry({
        "Tweet ID": tweetId,
        "Status URL": statusUrl,
        Reasoning:
          reasoning ||
          "AI determined this tweet should be rerun for potential new information",
      });
    } catch (error) {
      console.error(
        `[considerForRerun] Failed to log rerun entry for tweet ${result.post.id}:`,
        error
      );
      // Don't throw - we still want to return the shouldRerun result even if logging fails
    }
  }

  return object.shouldRerun;
}
