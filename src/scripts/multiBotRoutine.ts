/**
 * Multi-Bot Elo Evaluation Routine
 *
 * This script runs multiple bot configurations against the same tweets
 * and compares their outputs using an Elo rating system.
 *
 * Usage: bun run multi-bot
 */

import { fetchEligiblePosts } from "../api/fetchEligiblePosts";
import { AirtableLogger } from "../api/airtableLogger";
import { processTweet } from "../pipeline/processTweet";
import PQueue from "p-queue";
import { getEnabledBots, BotConfig } from "../lib/botConfig";
import { getBotEloTracker, BotEloTracker } from "../lib/botEloTracker";
import { PipelineResult } from "../lib/types";

const maxPosts = parseInt(process.env.MAX_POSTS || "5"); // Default to 5 for multi-bot mode
const botsPerTweetConcurrency = 2; // How many bots to run concurrently per tweet

// Timeout settings
const SOFT_TIMEOUT_MS = 8 * 60 * 1000;
const HARD_TIMEOUT_MS = 9 * 60 * 1000;

let shouldStopProcessing = false;

interface BotResult {
  bot: BotConfig;
  result: PipelineResult | null;
}

interface TweetComparison {
  tweetId: string;
  results: BotResult[];
}

/**
 * Compare results from multiple bots and update Elo ratings
 */
function compareAndUpdateElo(
  comparison: TweetComparison,
  eloTracker: BotEloTracker
): void {
  const validResults = comparison.results.filter(
    (r) => r.result !== null && r.result.compositeScore !== undefined
  );

  if (validResults.length < 2) {
    console.log(
      `[multi-bot] Not enough valid results for tweet ${comparison.tweetId} to compare`
    );
    return;
  }

  // Sort by composite score (highest first)
  validResults.sort(
    (a, b) => (b.result!.compositeScore || 0) - (a.result!.compositeScore || 0)
  );

  // Do pairwise comparisons (each bot vs each other bot)
  for (let i = 0; i < validResults.length; i++) {
    for (let j = i + 1; j < validResults.length; j++) {
      const botA = validResults[i]!;
      const botB = validResults[j]!;

      const scoreA = botA.result!.compositeScore || 0;
      const scoreB = botB.result!.compositeScore || 0;

      // Determine winner (higher composite score wins)
      // Use a small margin (0.01) to avoid too many draws
      const margin = 0.01;

      if (scoreA > scoreB + margin) {
        // Bot A wins
        eloTracker.recordComparison(
          comparison.tweetId,
          botA.bot.id,
          botB.bot.id,
          scoreA,
          scoreB,
          `${botA.bot.id} scored ${scoreA.toFixed(3)} vs ${botB.bot.id} ${scoreB.toFixed(3)}`
        );
        console.log(
          `[multi-bot] ${botA.bot.id} (${scoreA.toFixed(3)}) beats ${botB.bot.id} (${scoreB.toFixed(3)})`
        );
      } else if (scoreB > scoreA + margin) {
        // Bot B wins
        eloTracker.recordComparison(
          comparison.tweetId,
          botB.bot.id,
          botA.bot.id,
          scoreB,
          scoreA,
          `${botB.bot.id} scored ${scoreB.toFixed(3)} vs ${botA.bot.id} ${scoreA.toFixed(3)}`
        );
        console.log(
          `[multi-bot] ${botB.bot.id} (${scoreB.toFixed(3)}) beats ${botA.bot.id} (${scoreA.toFixed(3)})`
        );
      } else {
        // Draw (scores within margin)
        eloTracker.recordComparison(
          comparison.tweetId,
          botA.bot.id,
          botB.bot.id,
          scoreA,
          scoreB,
          `Draw: ${botA.bot.id} (${scoreA.toFixed(3)}) ≈ ${botB.bot.id} (${scoreB.toFixed(3)})`
        );
        console.log(
          `[multi-bot] Draw: ${botA.bot.id} (${scoreA.toFixed(3)}) ≈ ${botB.bot.id} (${scoreB.toFixed(3)})`
        );
      }
    }
  }
}

/**
 * Create log entry for Airtable
 */
function createLogEntry(
  result: PipelineResult,
  botId: string,
  eloRating: number
): any {
  const url = `https://twitter.com/i/status/${result.post.id}`;
  const tweetText = result.post.text || "";

  let fullResult = `BOT: ${botId} (Elo: ${Math.round(eloRating)})\n\n`;

  fullResult += `COMPOSITE SCORE: ${result.compositeScore?.toFixed(3) || "N/A"}\n\n`;

  fullResult += `VERIFIABLE FACT SCORE: ${
    result.verifiableFactResult?.score?.toFixed(2) || "N/A"
  }\n`;
  fullResult += `REASONING: ${result.verifiableFactResult?.reasoning || "N/A"}\n\n`;

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
    fullResult += `- Positive Claims Score: ${result.scores.positive.toFixed(2)}\n`;
    fullResult += `  Reasoning: ${result.filterDetails.positive.reasoning}\n`;
    fullResult += `- Disagreement Score: ${result.scores.disagreement.toFixed(2)}\n`;
    fullResult += `  Reasoning: ${result.filterDetails.disagreement.reasoning}\n`;

    if (result.helpfulnessScore !== undefined) {
      fullResult += `- Helpfulness Prediction: ${result.helpfulnessScore.toFixed(2)}\n`;
      if (result.helpfulnessReasoning) {
        fullResult += `  Reasoning: ${result.helpfulnessReasoning}\n`;
      }
    }

    if (result.xApiScore !== undefined) {
      fullResult += `- X API Score: ${result.xApiScore}${result.xApiSuccess ? "" : " (failed)"}\n`;
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
    "Bot name": `multi-bot/${botId}`,
    "Initial post text": tweetText,
    "Initial tweet body": JSON.stringify(result.post),
    "Full Result": fullResult,
    "Final note": result.noteResult?.note || "",
    "Would be posted": result.allScoresPassed ? 1 : 0,
    "Posted to X": false, // Multi-bot mode never posts
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
  console.log("═".repeat(60));
  console.log("MULTI-BOT ELO EVALUATION MODE");
  console.log("═".repeat(60));

  try {
    const enabledBots = getEnabledBots();
    console.log(`[multi-bot] Enabled bots: ${enabledBots.length}`);
    enabledBots.forEach((bot) => {
      console.log(`  - ${bot.id}: ${bot.name} (${bot.noteModel})`);
    });

    if (enabledBots.length < 2) {
      console.error(
        "[multi-bot] Need at least 2 enabled bots for Elo comparisons"
      );
      process.exit(1);
    }

    const eloTracker = getBotEloTracker();
    console.log("\n[multi-bot] Current Elo Rankings:");
    console.log(eloTracker.getSummary());

    // Set up timeouts
    const softTimeout = setTimeout(() => {
      console.log("[multi-bot] Soft timeout reached - stopping new tasks");
      shouldStopProcessing = true;
    }, SOFT_TIMEOUT_MS);

    const hardTimeout = setTimeout(() => {
      console.log("[multi-bot] Hard timeout reached - forcing exit");
      process.exit(0);
    }, HARD_TIMEOUT_MS);

    // Initialize Airtable
    const airtableLogger = new AirtableLogger();
    const logEntries: any[] = [];

    // Get existing URLs for any bot (to avoid duplicates)
    const existingUrls = await airtableLogger.getExistingUrlsForBot("multi-bot");
    const skipPostIds = new Set<string>();
    existingUrls.forEach((url) => {
      const match = url.match(/status\/(\d+)$/);
      if (match && match[1]) skipPostIds.add(match[1]);
    });

    console.log(`[multi-bot] Skipping ${skipPostIds.size} already-processed posts`);

    // Fetch eligible posts
    const posts = await fetchEligiblePosts(maxPosts, skipPostIds, 2);
    if (!posts.length) {
      console.log("[multi-bot] No new eligible posts found.");
      clearTimeout(softTimeout);
      clearTimeout(hardTimeout);
      console.log("\n[multi-bot] Final Elo Rankings:");
      console.log(eloTracker.getSummary());
      process.exit(0);
    }

    // Sort posts (newest first)
    posts.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });

    console.log(`[multi-bot] Processing ${posts.length} posts with ${enabledBots.length} bots each...`);

    // Process each post with all bots
    for (const [postIdx, post] of posts.entries()) {
      if (shouldStopProcessing) {
        console.log(`[multi-bot] Stopping - ${posts.length - postIdx} posts remaining`);
        break;
      }

      console.log(`\n${"─".repeat(60)}`);
      console.log(`[multi-bot] Tweet ${postIdx + 1}/${posts.length}: ${post.id}`);
      console.log(`${"─".repeat(60)}`);

      const comparison: TweetComparison = {
        tweetId: post.id,
        results: [],
      };

      // Run all bots on this tweet with limited concurrency
      const queue = new PQueue({ concurrency: botsPerTweetConcurrency });

      for (const bot of enabledBots) {
        queue.add(async () => {
          console.log(`[multi-bot] Running bot: ${bot.id}`);
          const result = await processTweet(post, postIdx, bot);

          comparison.results.push({ bot, result });

          if (result) {
            console.log(
              `[multi-bot] ${bot.id} - Score: ${result.compositeScore?.toFixed(3) || "N/A"}, Passed: ${result.allScoresPassed}`
            );

            // Create log entry
            const eloRating = eloTracker.getRating(bot.id);
            const logEntry = createLogEntry(result, bot.id, eloRating);
            logEntries.push(logEntry);
          } else {
            console.log(`[multi-bot] ${bot.id} - Error or null result`);
          }
        });
      }

      await queue.onIdle();

      // Compare results and update Elo
      compareAndUpdateElo(comparison, eloTracker);
    }

    // Log to Airtable
    if (logEntries.length > 0) {
      try {
        await airtableLogger.logMultipleEntries(logEntries);
        console.log(`\n[multi-bot] Logged ${logEntries.length} entries to Airtable`);
      } catch (err) {
        console.error("[multi-bot] Failed to log to Airtable:", err);
      }
    }

    // Print final rankings
    console.log("\n" + "═".repeat(60));
    console.log("FINAL ELO RANKINGS");
    console.log("═".repeat(60));
    console.log(eloTracker.getSummary());

    // Print recent comparisons
    console.log("\nRecent Comparisons:");
    const recentComparisons = eloTracker.getRecentComparisons(10);
    recentComparisons.forEach((c) => {
      const timestamp = new Date(c.timestamp).toLocaleTimeString();
      console.log(`  [${timestamp}] ${c.reason}`);
    });

    clearTimeout(softTimeout);
    clearTimeout(hardTimeout);
    process.exit(0);
  } catch (error) {
    console.error("[multi-bot] Fatal error:", error);
    process.exit(1);
  }
}

main();
