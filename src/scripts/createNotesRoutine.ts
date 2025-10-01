import { fetchEligiblePosts } from "../api/fetchEligiblePosts";
import { AirtableLogger } from "../api/airtableLogger";
import { processPost } from "../pipeline/processPost";
import PQueue from "p-queue";
import { execSync } from "child_process";
import {
  considerForRerun,
  RerunQueueLogger,
} from "../pipeline/considerForRerun";
import { PipelineResult } from "../lib/types";

const maxPosts = parseInt(process.env.MAX_POSTS || "10");
const concurrencyLimit = 3;

// Soft timeout (8 minutes) - stop adding new tasks
const SOFT_TIMEOUT_MS = 8 * 60 * 1000;
// Hard timeout (9 minutes) - force exit
const HARD_TIMEOUT_MS = 9 * 60 * 1000;

let shouldStopProcessing = false;


function createLogEntryWithScores(
  result: PipelineResult,
  branchName: string,
  commit?: string,
  postedToX: boolean = false
): any {
  const url = `https://twitter.com/i/status/${result.post.id}`;
  const tweetText = result.post.text || "";

  // Build the full result text with step-by-step execution
  let fullResult = `========================================\n`;
  fullResult += `PIPELINE EXECUTION REPORT\n`;
  fullResult += `========================================\n\n`;

  // Add step-by-step results
  if (result.stepsExecuted && result.stepsExecuted.length > 0) {
    fullResult += `STEPS EXECUTED:\n\n`;

    result.stepsExecuted.forEach((step) => {
      fullResult += `[Step ${step.stepNumber}] ${step.stepName}\n`;
      fullResult += `  Status: ${step.completed ? 'COMPLETED' : 'NOT COMPLETED'}\n`;
      if (step.passed !== undefined) {
        fullResult += `  Result: ${step.passed ? 'PASSED ✓' : 'FAILED ✗'}\n`;
      }
      if (step.score !== undefined) {
        fullResult += `  Score: ${step.score.toFixed(2)}\n`;
      }
      if (step.reasoning) {
        fullResult += `  Reasoning: ${step.reasoning}\n`;
      }
      if (step.data) {
        if (step.data.citationsCount !== undefined) {
          fullResult += `  Citations Found: ${step.data.citationsCount}\n`;
        }
        if (step.data.status) {
          fullResult += `  Note Status: ${step.data.status}\n`;
        }
        if (step.data.characterCount) {
          fullResult += `  Character Count: ${step.data.characterCount}/${step.data.limit}\n`;
        }
      }
      fullResult += `\n`;
    });

    if (result.failedAtStep) {
      fullResult += `FAILED AT: ${result.failedAtStep}\n\n`;
    }
  } else {
    // Fallback to old format if stepsExecuted is not available
    fullResult += `VERIFIABLE FACT SCORE: ${
      result.verifiableFactResult?.score?.toFixed(2) || "N/A"
    }\n\n`;
    fullResult += `REASONING: ${
      result.verifiableFactResult?.reasoning || "N/A"
    }\n\n`;
  }

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
    "Bot name": branchName,
    "Initial post text": tweetText, // The actual tweet text
    "Initial tweet body": JSON.stringify(result.post), // The full JSON object
    "Full Result": fullResult,
    "Final note": result.noteResult?.note || "",
    "Would be posted": result.allScoresPassed ? 1 : 0,
    "Posted to X": postedToX,
    // Use the correct filter column names (if they exist)
    "Not sarcasm filter": result.verifiableFactResult?.score,
    "Positive claims only filter": result.scores?.positive,
    "Significant correction filter": result.scores?.disagreement,
    "Keywords extracted": result.keywords
      ? result.keywords.keywords.join(", ")
      : "",
    // Filter reasoning is now included in Full Result, not as separate field
    "Helpfulness Prediction": result.helpfulnessScore,
    "X API Score": result.xApiScore,
    // Character count is computed in Airtable, don't write to it
  };
}

async function main() {
  try {
    // Get current branch
    let currentBranch = "refactor";
    try {
      if (process.env.GITHUB_BRANCH_NAME) {
        currentBranch = process.env.GITHUB_BRANCH_NAME.trim().toLowerCase();
      } else {
        currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
          encoding: "utf8",
        })
          .trim()
          .toLowerCase();
      }
    } catch (error) {
      console.warn("[main] Could not determine branch");
    }

    const shouldSubmitNotes = currentBranch === "main";
    console.log(
      `[main] Branch: ${currentBranch}, Submit notes: ${shouldSubmitNotes}`
    );

    if (!shouldSubmitNotes) {
      console.log(
        `[main] SIMULATION MODE - notes will not be submitted to X.com`
      );
    }

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

    // Get existing URLs
    const existingUrls = await airtableLogger.getExistingUrlsForBot(
      currentBranch
    );
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

    for (const [idx, post] of posts.entries()) {
      if (shouldStopProcessing) {
        console.log(`[main] Stopping - ${posts.length - idx} posts remaining`);
        break;
      }

      queue.add(async () => {
        const result = await processPost(post, idx);
        if (!result) return;

        let postedToX = false;

        // Submit to Twitter if all checks pass and we're on main
        if (shouldSubmitNotes) {
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
        }

        // Create log entry with scores
        const logEntry = createLogEntryWithScores(
          result,
          currentBranch,
          process.env.GITHUB_SHA,
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
