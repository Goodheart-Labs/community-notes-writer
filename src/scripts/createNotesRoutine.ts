import { fetchEligiblePosts } from "../api/fetchEligiblePosts";
import { versionOneFn as searchV1 } from "../pipeline/searchContextGoal";
import { writeNoteWithSearchFn as writeV1 } from "../pipeline/writeNoteWithSearchGoal";
import { check as checkV1 } from "../pipeline/check";
import { AirtableLogger, createLogEntry } from "../api/airtableLogger";
import { getOriginalTweetContent } from "../utils/retweetUtils";
import PQueue from "p-queue";

const maxPosts = 10; // Maximum posts to process per run
const concurrencyLimit = 3; // Process 3 posts at a time to avoid rate limiting
const MAX_RUNTIME_MS = 5 * 60 * 1000; // 5 minutes maximum runtime

// Global timeout to prevent hanging
const globalTimeout = setTimeout(() => {
  console.log("[main] Maximum runtime reached (5 minutes), forcing exit");
  process.exit(0);
}, MAX_RUNTIME_MS);

async function runPipeline(post: any, idx: number) {
  console.log(
    `[runPipeline] Starting pipeline for post #${idx + 1} (ID: ${post.id})`
  );
  try {
    // Get the original tweet content (handling retweets)
    const originalContent = getOriginalTweetContent(post);
    
    console.log(`[runPipeline] Processing ${originalContent.isRetweet ? 'retweet' : 'original tweet'} for post #${idx + 1}`);
    
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

    const noteResult = await writeV1(
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
    // Get commit hash from environment variable (available in GitHub Actions)
    const commit = process.env.GITHUB_SHA;
    
    // Initialize Airtable logger
    const airtableLogger = new AirtableLogger();
    const logEntries: any[] = [];

    // Get existing URLs from Airtable
    const existingUrls = await airtableLogger.getExistingUrls();

    // Convert URLs to post IDs (extract ID from URL)
    const skipPostIds = new Set<string>();
    existingUrls.forEach((url) => {
      const match = url.match(/status\/(\d+)$/);
      if (match && match[1]) skipPostIds.add(match[1]);
    });

    console.log(`[main] Skipping ${skipPostIds.size} already-processed posts`);

    let posts = await fetchEligiblePosts(maxPosts, skipPostIds, 3); // Fetch up to 3 pages to get at least 10 posts

    if (!posts.length) {
      console.log("No new eligible posts found.");
      clearTimeout(globalTimeout);
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
      queue.add(async () => {
        const r = await runPipeline(post, idx);
        if (!r) return;

        // Check if the source verification passed
        const checkYes =
          r.checkResult && r.checkResult.trim().toUpperCase() === "YES";

        // Create log entry for this result
        const logEntry = createLogEntry(
          r.post,
          r.searchContextResult,
          r.noteResult,
          r.checkResult,
          "first-bot",
          commit
        );
        logEntries.push(logEntry);

        if (
          r.noteResult.status === "CORRECTION WITH TRUSTWORTHY CITATION" &&
          checkYes
        ) {
          try {
            // Submit the note using the same info as in your submitNote.ts
            const { submitNote } = await import("../api/submitNote");
            const info = {
              classification: "misinformed_or_potentially_misleading",
              misleading_tags: ["disputed_claim_as_fact"],
              text: r.noteResult.note + " " + r.noteResult.url,
              trustworthy_sources: true,
            };
            // TODO: Change this to false when we're ready to submit for real
            const response = await submitNote(r.post.id, info, true);
            console.log(
              `[main] Submitted note for post ${r.post.id}:`,
              response
            );
            submitted++;
          } catch (err: any) {
            console.error(
              `[main] Failed to submit note for post ${r.post.id}:`,
              err.response?.data || err
            );
          }
        } else {
          const reason =
            r.noteResult.status !== "CORRECTION WITH TRUSTWORTHY CITATION"
              ? `status: ${r.noteResult.status}`
              : `check result: ${r.checkResult}`;
          console.log(`[main] Skipping post ${r.post.id} (${reason})`);
        }
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

    // Clear the global timeout and exit successfully
    clearTimeout(globalTimeout);
    console.log("[main] Process completed successfully, exiting");
    process.exit(0);
  } catch (error: any) {
    console.error(
      "Error in create notes routine script:",
      error.response?.data || error
    );
    // Clear the global timeout and exit with error
    clearTimeout(globalTimeout);
    process.exit(1);
  }
}

main();
