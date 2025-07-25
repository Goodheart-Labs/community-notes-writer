import { fetchEligiblePosts } from "./fetchEligiblePosts";
import { versionOneFn as searchV1 } from "../searchContextGoal";
import { writeNoteWithSearchFn as writeV1 } from "../writeNoteWithSearchGoal";
import { check as checkV1 } from "../check";

const bearerToken = process.env.X_BEARER_TOKEN!;
const maxPosts = 5;

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
    let posts = await fetchEligiblePosts(bearerToken, maxPosts);
    if (posts.length > maxPosts) posts = posts.slice(0, maxPosts);
    if (!posts.length) {
      console.log("No eligible posts found.");
      return;
    }
    console.log(`[main] Starting pipelines for ${posts.length} posts...`);
    const results = await Promise.all(
      posts.map((post, idx) => runPipeline(post, idx))
    );
    let submitted = 0;
    for (const [idx, r] of results.entries()) {
      if (!r) continue;
      if (r.noteResult.status === "CORRECTION WITH TRUSTWORTHY CITATION") {
        try {
          // Submit the note using the same info as in your submitNote.ts
          const { submitNote } = await import("./submitNote");
          const info = {
            classification: "misinformed_or_potentially_misleading",
            misleading_tags: ["disputed_claim_as_fact"],
            text: r.noteResult.note,
            trustworthy_sources: true,
          };
          const response = await submitNote(
            bearerToken,
            r.post.id,
            info,
            false
          );
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
