import { fetchEligiblePosts } from "./fetchEligiblePosts";
import { versionOneFn as searchV1 } from "../searchContextGoal";
import { writeNoteWithSearchFn as writeV1 } from "../writeNoteWithSearchGoal";
import { check as checkV1 } from "../check";
import { AirtableLogger, createLogEntry } from "./airtableLogger";

const maxPosts = 3;

async function runPipeline(post: any, idx: number) {
  console.log(
    `[runPipeline] Starting pipeline for post #${idx + 1} (ID: ${post.id})`
  );
  try {
    const searchContextResult = await searchV1(
      {
        text: post.text,
        media: (post.media || [])
          .map((m: any) => m.url || m.preview_image_url)
          .filter(Boolean),
        searchResults: "",
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
    // Initialize Airtable logger
    const airtableLogger = new AirtableLogger();
    const logEntries: any[] = [];

    // Get existing URLs from Airtable
    const existingUrls = await airtableLogger.getExistingUrls();
    
    // Convert URLs to post IDs (extract ID from URL)
    const skipPostIds = new Set<string>();
    existingUrls.forEach(url => {
      const match = url.match(/status\/(\d+)$/);
      if (match) skipPostIds.add(match[1]);
    });
    
    console.log(`[main] Skipping ${skipPostIds.size} already-processed posts`);

    let posts = await fetchEligiblePosts(maxPosts, skipPostIds);
    if (!posts.length) {
      console.log("No new eligible posts found.");
      return;
    }
    console.log(`[main] Starting pipelines for ${posts.length} posts...`);
    const results = await Promise.all(
      posts.map((post, idx) => runPipeline(post, idx))
    );
    let submitted = 0;
    for (const [idx, r] of results.entries()) {
      if (!r) continue;

      // Create log entry for this result
      const logEntry = createLogEntry(
        r.post,
        r.searchContextResult,
        r.noteResult,
        r.checkResult,
        "first-bot"
      );
      logEntries.push(logEntry);

      if (r.noteResult.status === "CORRECTION WITH TRUSTWORTHY CITATION") {
        try {
          // Submit the note using the same info as in your submitNote.ts
          const { submitNote } = await import("./submitNote");
          const info = {
            classification: "misinformed_or_potentially_misleading",
            misleading_tags: ["disputed_claim_as_fact"],
            text: r.noteResult.note + " " + r.noteResult.url,
            trustworthy_sources: true,
          };
          // TODO: Change this to false when we're ready to submit for real
          const response = await submitNote(r.post.id, info, true);
          console.log(`[main] Submitted note for post ${r.post.id}:`, response);
          submitted++;
        } catch (err: any) {
          console.error(
            `[main] Failed to submit note for post ${r.post.id}:`,
            err.response?.data || err
          );
        }
      } else {
        console.log(
          `[main] Skipping post ${r.post.id} (status: ${r.noteResult.status})`
        );
      }
    }

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

    if (submitted === 0) {
      console.log(
        "No posts with status 'CORRECTION WITH TRUSTWORTHY CITATION' found."
      );
    }
  } catch (error: any) {
    console.error(
      "Error in daily community notes script:",
      error.response?.data || error
    );
  }
}

main();
