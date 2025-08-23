import { fetchEligiblePosts } from "../api/fetchEligiblePosts";
import { versionOneFn as searchV1 } from "../pipeline/searchContextGoal";
import { writeNoteWithSearchFn as writeV1 } from "../pipeline/writeNoteWithSearchGoal";
import { check as checkV1 } from "../pipeline/check";
import { getOriginalTweetContent } from "../utils/retweetUtils";
import PQueue from "p-queue";

const maxPosts = 5; // Process only 5 most recent posts
const concurrencyLimit = 2; // Process 2 posts at a time

async function runPipeline(post: any, idx: number) {
  console.log(
    `\n[runPipeline] Starting pipeline for post #${idx + 1} (ID: ${post.id})`
  );
  console.log(`[runPipeline] URL: https://twitter.com/user/status/${post.id}`);
  
  try {
    // Get the original tweet content (handling retweets)
    const originalContent = getOriginalTweetContent(post);
    
    console.log(`[runPipeline] Processing ${originalContent.isRetweet ? 'retweet' : 'original tweet'}`);
    console.log(`[runPipeline] Text: ${originalContent.text.substring(0, 100)}...`);
    
    // Step 1: Search for context
    console.log("\n📍 Step 1: Searching for context...");
    const searchContextResult = await searchV1(
      {
        text: originalContent.text,
        media: originalContent.media,
        searchResults: "",
        retweetContext: originalContent.retweetContext,
      },
      { model: "perplexity/sonar" }
    );
    console.log(`✅ Search context complete`);
    console.log(`   Citations found: ${searchContextResult.citations?.length || 0}`);

    // Step 2: Write the note
    console.log("\n📝 Step 2: Writing community note...");
    const noteResult = await writeV1(
      {
        text: searchContextResult.text,
        searchResults: searchContextResult.searchResults,
        citations: searchContextResult.citations || [],
      },
      { model: "anthropic/claude-sonnet-4" }
    );
    console.log(`✅ Note generated`);
    console.log(`   Status: ${noteResult.status}`);
    console.log(`   Note (${noteResult.note.length} chars): ${noteResult.note}`);
    console.log(`   URL: ${noteResult.url}`);

    // Step 3: Check the note
    console.log("\n🔍 Step 3: Checking note quality...");
    const checkResult = await checkV1({
      note: noteResult.note,
      url: noteResult.url,
      status: noteResult.status,
    });
    console.log(`✅ Check complete: ${checkResult}`);

    // Summary
    console.log("\n📊 Summary for post #" + (idx + 1) + ":");
    console.log("   - Search citations: " + (searchContextResult.citations?.length || 0));
    console.log("   - Note status: " + noteResult.status);
    console.log("   - Note length: " + noteResult.note.length + " characters");
    console.log("   - Check result: " + checkResult);
    console.log("   - Would submit: " + (noteResult.status === "CORRECTION WITH TRUSTWORTHY CITATION" && checkResult.trim().toUpperCase() === "YES"));

    return {
      post,
      searchContextResult,
      noteResult,
      checkResult,
    };
  } catch (err) {
    console.error(
      `\n❌ Error in pipeline for post #${idx + 1} (ID: ${post.id}):`,
      err
    );
    return null;
  }
}

async function main() {
  console.log("🚀 Starting test run on 5 most recent posts");
  console.log("📌 Note: This is a TEST RUN - no notes will be submitted");
  console.log("📌 Note: Results will NOT be logged to Airtable\n");

  try {
    // Fetch posts without any skip list since we're just testing
    const posts = await fetchEligiblePosts(maxPosts, new Set(), 1);

    if (!posts.length) {
      console.log("❌ No eligible posts found.");
      process.exit(0);
    }

    console.log(`✅ Found ${posts.length} eligible posts\n`);

    const queue = new PQueue({ concurrency: concurrencyLimit });
    const results: any[] = [];

    // Process all posts
    for (const [idx, post] of posts.entries()) {
      queue.add(async () => {
        const result = await runPipeline(post, idx);
        if (result) {
          results.push(result);
        }
      });
    }

    await queue.onIdle();

    // Final summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 FINAL SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total posts processed: ${results.length}/${posts.length}`);
    
    const eligibleForSubmission = results.filter(
      r => r.noteResult.status === "CORRECTION WITH TRUSTWORTHY CITATION" && 
           r.checkResult.trim().toUpperCase() === "YES"
    );
    
    console.log(`Eligible for submission: ${eligibleForSubmission.length}`);
    
    if (eligibleForSubmission.length > 0) {
      console.log("\n📝 Notes that would be submitted:");
      eligibleForSubmission.forEach((r, idx) => {
        console.log(`\n${idx + 1}. Post ID: ${r.post.id}`);
        console.log(`   Note: ${r.noteResult.note}`);
        console.log(`   URL: ${r.noteResult.url}`);
      });
    }

    console.log("\n✅ Test run completed successfully!");
    process.exit(0);
  } catch (error: any) {
    console.error(
      "❌ Error in test script:",
      error.response?.data || error
    );
    process.exit(1);
  }
}

main();