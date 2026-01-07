import { fetchEligiblePosts } from "../api/fetchEligiblePosts";
import { AirtableLogger } from "../api/airtableLogger";
import { processTweet } from "../pipeline/processTweet";
import PQueue from "p-queue";
import {
  considerForRerun,
  RerunQueueLogger,
} from "../pipeline/considerForRerun";
import { PipelineResult } from "../lib/types";
import { selectRandomBot, getBotProbabilities, getEnabledBots, BotConfig } from "../lib/botConfig";

const maxPosts = parseInt(process.env.MAX_POSTS || "10");
const concurrencyLimit = 3;
const MAX_BOT_RETRIES = 3;

// Soft timeout (8 minutes) - stop adding new tasks
const SOFT_TIMEOUT_MS = 8 * 60 * 1000;
// Hard timeout (9 minutes) - force exit
const HARD_TIMEOUT_MS = 9 * 60 * 1000;

let shouldStopProcessing = false;


function createLogEntryWithScores(
  result: PipelineResult,
  botId: string,
  postedToX: boolean = false
): any {
  const url = `https://twitter.com/i/status/${result.post.id}`;
  const tweetText = result.post.text || "";

  // Build the full result text with scores
  let fullResult = `BOT: ${botId}\n\n`;
  fullResult += `VERIFIABLE FACT SCORE: ${
    result.verifiableFactResult?.score?.toFixed(2) || "N/A"
  }\n\n`;

  // add reasoning
  fullResult += `REASONING: ${
    result.verifiableFactResult?.reasoning || "N/A"
  }\n\n`;

  if (result.keywords) {
    fullResult += `KEYWORDS EXTRACTED:\n`;
    fullResult += `- Keywords: ${result.keywords.keywords.join(", ")}\n`;
    fullResult += `- Entities: ${result.keywords.entities.join(", ")}\n`;
    fullResult += `- Claims: ${result.keywords.claims.join("; ")}\n\n`;
  }

  if (result.scores && result.filterDetails) {
    fullResult += `FILTER SCORES:\n`;
    fullResult += `- URL Score: ${result.scores.url.toFixed(2)}\n`;
    fullResult += `  Reasoning: ${result.filterDetails.url.reasoning}\n`;
    fullResult += `- Positive Claims Score: ${result.scores.positive.toFixed(
      2
    )}\n`;
    fullResult += `  Reasoning: ${result.filterDetails.positive.reasoning}\n`;
    fullResult += `- Disagreement Score: ${result.scores.disagreement.toFixed(
      2
    )}\n`;
    fullResult += `  Reasoning: ${result.filterDetails.disagreement.reasoning}\n`;

    if (result.helpfulnessScore !== undefined) {
      fullResult += `- Helpfulness Prediction: ${result.helpfulnessScore.toFixed(
        2
      )}\n`;
      if (result.helpfulnessReasoning) {
        fullResult += `  Reasoning: ${result.helpfulnessReasoning}\n`;
      }
    }

    if (result.xApiScore !== undefined) {
      fullResult += `- X API Score: ${result.xApiScore}${
        result.xApiSuccess ? "" : " (failed)"
      }\n`;
    }

    fullResult += `- All Passed: ${result.allScoresPassed}\n\n`;
  } else if (result.scores) {
    // Fallback for old format without filterDetails
    fullResult += `FILTER SCORES:\n`;
    fullResult += `- URL Score: ${result.scores.url.toFixed(2)}\n`;
    fullResult += `- Positive Claims Score: ${result.scores.positive.toFixed(
      2
    )}\n`;
    fullResult += `- Disagreement Score: ${result.scores.disagreement.toFixed(
      2
    )}\n`;

    if (result.helpfulnessScore !== undefined) {
      fullResult += `- Helpfulness Prediction: ${result.helpfulnessScore.toFixed(
        2
      )}\n`;
      if (result.helpfulnessReasoning) {
        fullResult += `  Reasoning: ${result.helpfulnessReasoning}\n`;
      }
    }

    if (result.xApiScore !== undefined) {
      fullResult += `- X API Score: ${result.xApiScore}${
        result.xApiSuccess ? "" : " (failed)"
      }\n`;
    }

    fullResult += `- All Passed: ${result.allScoresPassed}\n\n`;
  }

  if (result.skipReason) {
    fullResult += `SKIP REASON: ${result.skipReason}\n\n`;
  }

  if (result.searchContextResult) {
    fullResult += `SEARCH RESULTS:\n${result.searchContextResult.searchResults}\n\n`;

    if (
      result.searchContextResult.citations &&
      result.searchContextResult.citations.length > 0
    ) {
      fullResult += `CITATIONS:\n`;
      result.searchContextResult.citations.forEach(
        (citation: string, index: number) => {
          fullResult += `[${index + 1}] ${citation}\n`;
        }
      );
      fullResult += `\n`;
    }
  }

  if (result.noteResult) {
    fullResult += `NOTE STATUS: ${result.noteResult.status}\n`;
    fullResult += `NOTE: ${result.noteResult.note}\n`;
    fullResult += `URL: ${result.noteResult.url}`;
  }

  return {
    URL: url,
    "Bot name": botId,
    "Initial post text": tweetText,
    "Initial tweet body": JSON.stringify(result.post),
    "Full Result": fullResult,
    "Final note": result.noteResult?.note || "",
    "Would be posted": result.allScoresPassed ? 1 : 0,
    "Posted to X": postedToX,
    "Not sarcasm filter": result.verifiableFactResult?.score,
    "Positive claims only filter": result.scores?.positive,
    "Significant correction filter": result.scores?.disagreement,
    "Keywords extracted": result.keywords
      ? result.keywords.keywords.join(", ")
      : "",
    "Helpfulness Prediction": result.helpfulnessScore,
    "X API Score": result.xApiScore,
  };
}

async function main() {
  try {
    // Log bot selection probabilities
    const botProbs = getBotProbabilities();
    console.log(`[main] Bot selection probabilities:`);
    botProbs.forEach((b) => {
      console.log(`  - ${b.id}: ${b.probability.toFixed(1)}%`);
    });

    // Set up timeouts
    const softTimeout = setTimeout(() => {
      console.log("[main] Soft timeout reached - no new tasks will be added");
      shouldStopProcessing = true;
    }, SOFT_TIMEOUT_MS);

    const hardTimeout = setTimeout(() => {
      console.log("[main] Hard timeout reached - forcing exit");
      process.exit(0);
    }, HARD_TIMEOUT_MS);

    // Initialize Airtable
    const airtableLogger = new AirtableLogger();
    const logEntries: any[] = [];

    // Get existing URLs (check all bots)
    const existingUrls = await airtableLogger.getExistingUrls();
    const skipPostIds = new Set<string>();
    existingUrls.forEach((url) => {
      const match = url.match(/status\/(\d+)$/);
      if (match && match[1]) skipPostIds.add(match[1]);
    });

    // Get tweets from rerun queue - these should be processed even if already processed before
    const rerunQueueLogger = new RerunQueueLogger();
    const rerunQueueTweetIds = await rerunQueueLogger.getRerunQueueTweetIds();

    // Remove rerun queue tweets from skip list so they get processed again
    rerunQueueTweetIds.forEach((tweetId) => {
      if (skipPostIds.has(tweetId)) {
        skipPostIds.delete(tweetId);
        console.log(`[main] Allowing rerun for tweet ID: ${tweetId}`);
      }
    });

    console.log(`[main] Skipping ${skipPostIds.size} already-processed posts`);
    console.log(
      `[main] Found ${rerunQueueTweetIds.size} tweets in rerun queue`
    );

    // Fetch eligible posts
    const posts = await fetchEligiblePosts(maxPosts, skipPostIds, 3);
    if (!posts.length) {
      console.log("No new eligible posts found.");
      clearTimeout(softTimeout);
      clearTimeout(hardTimeout);
      process.exit(0);
    }

    // Sort posts in reverse chronological order (newest first)
    posts.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA; // Descending order (newest first)
    });

    console.log(
      `[main] Starting refactored pipelines for ${posts.length} posts (sorted newest first)...`
    );

    if (posts.length > 0) {
      console.log(`[main] Newest tweet: ${posts[0]?.created_at} (ID: ${posts[0]?.id})`);
      if (posts.length > 1) {
        console.log(`[main] Oldest tweet: ${posts[posts.length - 1]?.created_at} (ID: ${posts[posts.length - 1]?.id})`);
      }
    }

    // Process posts with concurrency limit
    const queue = new PQueue({ concurrency: concurrencyLimit });
    let submitted = 0;

    // Track bot usage for summary
    const botUsage: Record<string, number> = {};

    for (const [idx, post] of posts.entries()) {
      if (shouldStopProcessing) {
        console.log(`[main] Stopping - ${posts.length - idx} posts remaining`);
        break;
      }

      queue.add(async () => {
        // Try bots until one succeeds or we run out of retries
        let result: PipelineResult | null = null;
        let selectedBot: BotConfig | null = null;
        const triedBots = new Set<string>();
        const enabledBots = getEnabledBots();

        for (let attempt = 0; attempt < MAX_BOT_RETRIES && attempt < enabledBots.length; attempt++) {
          // Select a random bot, excluding already tried ones
          let bot = selectRandomBot();
          let retryCount = 0;
          while (triedBots.has(bot.id) && retryCount < 10) {
            bot = selectRandomBot();
            retryCount++;
          }

          if (triedBots.has(bot.id)) {
            // All bots tried, give up
            break;
          }

          triedBots.add(bot.id);
          selectedBot = bot;
          console.log(`[main] Tweet ${post.id} assigned to bot: ${bot.id}${attempt > 0 ? ` (retry ${attempt})` : ""}`);
          botUsage[bot.id] = (botUsage[bot.id] || 0) + 1;

          result = await processTweet(post, idx, bot);
          if (result) {
            break; // Success, stop retrying
          }
          console.log(`[main] Bot ${bot.id} failed for tweet ${post.id}, trying another...`);
        }

        if (!result || !selectedBot) return;

        let postedToX = false;

        // Submit to Twitter if all checks pass
        if (result.allScoresPassed) {
          try {
            const { submitNote } = await import("../api/submitNote");
            const noteText =
              result.noteResult.note + " " + result.noteResult.url;
            const info = {
              classification: "misinformed_or_potentially_misleading",
              misleading_tags: ["disputed_claim_as_fact"],
              text: noteText,
              trustworthy_sources: true,
            };
            const response = await submitNote(post.id, info);
            console.log(
              `[main] Successfully submitted note for post ${post.id}:`,
              response
            );
            postedToX = true;
            submitted++;
          } catch (err: any) {
            console.error(
              `[main] Failed to submit note for post ${post.id}:`,
              err.response?.data || err
            );
          }
        } else {
          // If all scores didn't pass we will consider whether to
          // allow the note to be revived in 90 minutes based on
          // the recency of the subject of the note
          await considerForRerun(result);
        }

        // Create log entry with scores
        const logEntry = createLogEntryWithScores(
          result,
          selectedBot!.id,
          postedToX
        );
        logEntries.push(logEntry);
      });
    }

    await queue.onIdle();
    console.log(`[main] All posts processed`);

    // Log to Airtable
    if (logEntries.length > 0) {
      try {
        await airtableLogger.logMultipleEntries(logEntries);
        console.log(`[main] Logged ${logEntries.length} entries to Airtable`);
      } catch (err) {
        console.error("[main] Failed to log to Airtable:", err);
      }
    }

    // Log bot usage summary
    console.log(`[main] Bot usage summary:`);
    Object.entries(botUsage).forEach(([botId, count]) => {
      console.log(`  - ${botId}: ${count} tweets`);
    });

    console.log(
      `[main] Completed - processed ${posts.length} posts, submitted ${submitted} notes`
    );

    clearTimeout(softTimeout);
    clearTimeout(hardTimeout);
    process.exit(0);
  } catch (error) {
    console.error("[main] Fatal error:", error);
    process.exit(1);
  }
}

// Run the refactored pipeline
main();
