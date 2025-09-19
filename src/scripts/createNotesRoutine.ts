import { fetchEligiblePosts } from "../api/fetchEligiblePosts";
import { versionOneFn as searchV1 } from "../pipeline/searchContextGoal";
import { writeNoteWithSearchFn } from "../pipeline/writeNoteWithSearchGoal";
import { check as checkV1 } from "../pipeline/check";
import { AirtableLogger, createLogEntry } from "../api/airtableLogger";
import { getOriginalTweetContent } from "../utils/retweetUtils";
import {
  runProductionFilters,
  formatFilterResults,
} from "../pipeline/productionFilters";
import PQueue from "p-queue";
import { execSync } from "child_process";

const maxPosts = 10; // Maximum posts to process per run
const concurrencyLimit = 3; // Process 3 posts at a time to avoid rate limiting
const SOFT_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes - stop processing new items
const HARD_TIMEOUT_MS = 25 * 60 * 1000; // 25 minutes - force exit

let shouldStopProcessing = false;

// Soft timeout - stop accepting new work
const softTimeout = setTimeout(() => {
  console.log("[main] Soft timeout reached (20 minutes), stopping new processing");
  shouldStopProcessing = true;
}, SOFT_TIMEOUT_MS);

// Hard timeout - force exit
const hardTimeout = setTimeout(() => {
  console.log("[main] Hard timeout reached (25 minutes), forcing exit");
  process.exit(1);
}, HARD_TIMEOUT_MS);

async function runPipeline(post: any, idx: number) {
  console.log(
    `[runPipeline] Starting pipeline for post #${idx + 1} (ID: ${post.id})`
  );
  try {
    // Get the original tweet content (handling retweets)
    const originalContent = getOriginalTweetContent(post);

    console.log(
      `[runPipeline] Processing ${
        originalContent.isRetweet ? "retweet" : "original tweet"
      } for post #${idx + 1}`
    );

    // Check if the post contains video media
    const hasVideo =
      post.media?.some((m: any) => m.type === "video") ||
      post.referenced_tweet_data?.media?.some((m: any) => m.type === "video");

    if (hasVideo) {
      console.log(
        `[runPipeline] Skipping post #${idx + 1} (ID: ${
          post.id
        }) - contains video media`
      );

      // Return a special result for video posts that will still be logged to Airtable
      return {
        post,
        searchContextResult: {
          text: originalContent.text,
          searchResults: "SKIPPED - Post contains video media",
          citations: [],
        },
        noteResult: {
          status: "SKIPPED - VIDEO CONTENT",
          note: "Video content is not currently supported for Community Notes generation",
          url: "",
        },
        checkResult: "NO - VIDEO CONTENT",
      };
    }

    const searchContextResult = await searchV1(
      {
        text: originalContent.text,
        media: originalContent.media,
        searchResults: "",
        retweetContext: originalContent.retweetContext,
      },
      { model: "perplexity/sonar" }
    );
    console.log(
      `[runPipeline] Search context complete for post #${idx + 1} (ID: ${
        post.id
      })`
    );

    const noteResult = await writeNoteWithSearchFn(
      {
        text: searchContextResult.text,
        searchResults: searchContextResult.searchResults,
        citations: searchContextResult.citations || [],
      },
      { model: "anthropic/claude-sonnet-4" }
    );
    console.log(
      `[runPipeline] Note generated for post #${idx + 1} (ID: ${post.id})`
    );

    const checkResult = await checkV1({
      note: noteResult.note,
      url: noteResult.url,
      status: noteResult.status,
    });
    console.log(
      `[runPipeline] Check complete for post #${idx + 1} (ID: ${post.id})`
    );

    return {
      post,
      searchContextResult,
      noteResult,
      checkResult,
    };
  } catch (err) {
    console.error(
      `[runPipeline] Error in pipeline for post #${idx + 1} (ID: ${post.id}):`,
      err
    );
    return null;
  }
}

async function main() {
  try {
    // Get current branch name
    let currentBranch = "unknown";

    // First check if we're in GitHub Actions and use the branch from environment
    if (process.env.GITHUB_BRANCH_NAME) {
      currentBranch = process.env.GITHUB_BRANCH_NAME.trim().toLowerCase();
      console.log(
        `[main] Running in GitHub Actions, using branch from env: ${currentBranch}`
      );
    } else {
      // Fallback to git command for local development
      try {
        currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
          encoding: "utf8",
        }).trim().toLowerCase();
      } catch (error) {
        console.warn(
          "[main] Could not determine current branch, assuming main"
        );
        currentBranch = "main";
      }
    }

    // Determine if we should run in simulation mode (skip actual submission)
    const shouldSubmitNotes = currentBranch === "main";

    console.log(`[main] Current branch: ${currentBranch}`);
    console.log(`[main] Should submit notes: ${shouldSubmitNotes}`);

    if (!shouldSubmitNotes) {
      console.log(
        `[main] Running in SIMULATION MODE - notes will be generated and logged but not submitted to X.com`
      );
    }

    // Get commit hash from environment variable (available in GitHub Actions)
    const commit = process.env.GITHUB_SHA;

    // Initialize Airtable logger
    const airtableLogger = new AirtableLogger();
    const logEntries: any[] = [];

    // Get existing URLs from Airtable for this specific bot
    const existingUrls = await airtableLogger.getExistingUrlsForBot(
      currentBranch
    );

    // Convert URLs to post IDs (extract ID from URL)
    const skipPostIds = new Set<string>();
    existingUrls.forEach((url) => {
      const match = url.match(/status\/(\d+)$/);
      if (match && match[1]) skipPostIds.add(match[1]);
    });

    console.log(
      `[main] Skipping ${skipPostIds.size} already-processed posts for bot '${currentBranch}'`
    );

    let posts = await fetchEligiblePosts(maxPosts, skipPostIds, 3); // Fetch up to 3 pages to get at least 10 posts

    if (!posts.length) {
      console.log("No new eligible posts found.");
      clearTimeout(softTimeout);
      clearTimeout(hardTimeout);
      process.exit(0);
    }
    console.log(`[main] Starting pipelines for ${posts.length} posts...`);

    const queue = new PQueue({ concurrency: concurrencyLimit });
    const results: any[] = [];
    let submitted = 0;

    // Add progress logging
    queue.on("active", () => {
      console.log(`[queue] Task started - ${queue.size} remaining in queue`);
    });

    // Add all tasks to the queue
    for (const [idx, post] of posts.entries()) {
      // Check for soft timeout before adding new tasks
      if (shouldStopProcessing) {
        console.log(
          `[main] Soft timeout reached, skipping remaining ${
            posts.length - idx
          } posts`
        );
        break;
      }

      queue.add(async () => {
        const r = await runPipeline(post, idx);
        if (!r) return;

        // Check if the source verification passed
        const checkYes =
          r.checkResult && r.checkResult.trim().toUpperCase() === "YES";

        // Track if we actually posted to Twitter
        let postedToX = false;
        let twitterResponse = null;
        let filterResults = null;
        let filtersPassed = false;

        if (
          r.noteResult.status === "CORRECTION WITH TRUSTWORTHY CITATION" &&
          checkYes
        ) {
          // Run production filters before posting
          const noteText = r.noteResult.note + " " + r.noteResult.url;
          const postText = r.post.text || r.post.full_text || "";

          const filterRun = await runProductionFilters(noteText, postText);
          filterResults = formatFilterResults(filterRun.results);
          filtersPassed = filterRun.passed;

          if (!filtersPassed) {
            console.log(`[main] Filters blocked note for post ${r.post.id}`);
          } else if (shouldSubmitNotes) {
            try {
              // Submit the note using the same info as in your submitNote.ts
              const { submitNote } = await import("../api/submitNote");
              const info = {
                classification: "misinformed_or_potentially_misleading",
                misleading_tags: ["disputed_claim_as_fact"],
                text: noteText,
                trustworthy_sources: true,
              };
              const response = await submitNote(r.post.id, info);
              console.log(
                `[main] Successfully submitted note for post ${r.post.id}:`,
                response
              );
              postedToX = true;
              twitterResponse = response;
              submitted++;
            } catch (err: any) {
              console.error(
                `[main] Failed to submit note for post ${r.post.id}:`,
                err.response?.data || err
              );
              postedToX = false;
            }
          } else {
            console.log(
              `[main] SIMULATION MODE: Would submit note for post ${r.post.id} but skipping actual submission`
            );
          }
        } else {
          const reason =
            r.noteResult.status !== "CORRECTION WITH TRUSTWORTHY CITATION"
              ? `status: ${r.noteResult.status}`
              : `check result: ${r.checkResult}`;
          console.log(`[main] Skipping post ${r.post.id} (${reason})`);
        }

        // Create log entry with actual posting status and filter results
        const logEntry = createLogEntry(
          r.post,
          r.searchContextResult,
          r.noteResult,
          r.checkResult,
          currentBranch,
          commit,
          postedToX,
          filterResults || undefined
        );
        logEntries.push(logEntry);
      });
    }

    await queue.onIdle(); // Wait for all tasks to complete
    console.log(
      `[main] All ${posts.length} posts processed with concurrency limit of ${concurrencyLimit}`
    );

    // Log all entries to Airtable
    if (logEntries.length > 0) {
      try {
        await airtableLogger.logMultipleEntries(logEntries);
        console.log(
          `[main] Successfully logged ${logEntries.length} entries to Airtable`
        );
      } catch (err) {
        console.error("[main] Failed to log to Airtable:", err);
      }
    }

    if (logEntries.length === 0) {
      console.log(
        "No posts with status 'CORRECTION WITH TRUSTWORTHY CITATION' found."
      );
    } else {
      console.log(
        `[main] Successfully processed ${logEntries.length} posts, submitted ${submitted} notes`
      );
    }

    // Clear all timeouts and exit successfully
    clearTimeout(softTimeout);
    clearTimeout(hardTimeout);
    console.log("[main] Process completed successfully, exiting");
    process.exit(0);
  } catch (error: any) {
    console.error(
      "Error in create notes routine script:",
      error.response?.data || error
    );
    // Clear all timeouts and exit with error
    clearTimeout(softTimeout);
    clearTimeout(hardTimeout);
    process.exit(1);
  }
}

main();
