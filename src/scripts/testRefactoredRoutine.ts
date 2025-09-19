#!/usr/bin/env bun

/**
 * Test script for the refactored pipeline
 * Runs the full pipeline but NEVER posts to Twitter
 * Still logs to Airtable for analysis
 */

import { fetchEligiblePosts } from "../api/fetchEligiblePosts";
import { AirtableLogger } from "../api/airtableLogger";
import { getOriginalTweetContent } from "../utils/retweetUtils";
import { checkSarcasm } from "../pipeline/sarcasmFilter";
import { extractKeywords } from "../pipeline/extractKeywords";
import { searchWithKeywords } from "../pipeline/searchWithKeywords";
import { checkUrlValidity } from "../pipeline/urlChecker";
import { runScoringFilters } from "../pipeline/scoringFilters";
import { checkCharacterLimit } from "../pipeline/characterLimitChecker";
import PQueue from "p-queue";
import { execSync } from "child_process";

// Import existing implementations for parts we haven't refactored yet
import { searchV1 } from "../pipeline/searchContextGoal";
import { writeNoteWithSearchFn as writeV1 } from "../pipeline/writeNoteWithSearchGoal";

// Configuration - same as GitHub Action
const maxPosts = parseInt(process.env.MAX_POSTS || "10"); // Same default as production
const concurrencyLimit = 3; // Same as production
const SOFT_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes - stop processing new items
const HARD_TIMEOUT_MS = 25 * 60 * 1000; // 25 minutes - force exit

let shouldStopProcessing = false;

// Soft timeout - stop accepting new work
const softTimeout = setTimeout(() => {
  console.log("[TEST] Soft timeout reached (20 minutes), stopping new processing");
  shouldStopProcessing = true;
}, SOFT_TIMEOUT_MS);

// Hard timeout - force exit
const hardTimeout = setTimeout(() => {
  console.log("[TEST] Hard timeout reached (25 minutes), forcing exit");
  process.exit(1);
}, HARD_TIMEOUT_MS);

console.log(`
================================================================================
REFACTORED PIPELINE TEST MODE
================================================================================
This will:
- Run the full refactored pipeline
- Test all new scoring filters
- Log results to Airtable
- NEVER post to Twitter (even if on main branch)
================================================================================
`);

interface PipelineResult {
  post: any;
  sarcasmScore?: number;
  keywords?: any;
  searchContextResult?: any;
  noteResult?: any;
  characterLimit?: {
    valid: boolean;
    characterCount: number;
  };
  scores?: {
    url: number;
    positive: number;
    disagreement: number;
  };
  allScoresPassed: boolean;
  skipReason?: string;
}

async function runTestPipeline(post: any, idx: number): Promise<PipelineResult | null> {
  console.log(`\n[TEST ${idx + 1}] Starting pipeline for post ID: ${post.id}`);
  console.log(`[TEST ${idx + 1}] Tweet: ${post.text?.substring(0, 100)}...`);
  
  try {
    // Get the original tweet content
    const originalContent = getOriginalTweetContent(post);
    const quoteContext = originalContent.retweetContext;
    
    // 1. SARCASM FILTER
    console.log(`[TEST ${idx + 1}] Running sarcasm filter...`);
    const sarcasmResult = await checkSarcasm(originalContent.text, quoteContext);
    console.log(`[TEST ${idx + 1}] → Sarcasm score: ${sarcasmResult.score.toFixed(2)}`);
    
    if (sarcasmResult.score <= 0.5) {
      console.log(`[TEST ${idx + 1}] ❌ FILTERED: Sarcasm score too low`);
      return {
        post,
        sarcasmScore: sarcasmResult.score,
        allScoresPassed: false,
        skipReason: `Sarcasm filter: ${sarcasmResult.reasoning}`,
      };
    }

    // 2. EXTRACT KEYWORDS
    console.log(`[TEST ${idx + 1}] Extracting keywords...`);
    const keywords = await extractKeywords(originalContent.text, quoteContext);
    console.log(`[TEST ${idx + 1}] → Keywords: ${keywords.keywords.slice(0, 3).join(", ")}...`);
    
    // 3. SEARCH WITH KEYWORDS
    console.log(`[TEST ${idx + 1}] Searching with keywords + date...`);
    const todayDate = new Date().toISOString().split('T')[0];
    
    const searchResult = await searchWithKeywords(
      {
        keywords,
        date: todayDate,
        quoteContext,
        originalText: originalContent.text,
      },
      { model: "perplexity/sonar" as any }
    );
    console.log(`[TEST ${idx + 1}] → Search complete`);

    // 4. WRITE NOTE
    console.log(`[TEST ${idx + 1}] Writing note...`);
    const noteResult = await writeV1(
      {
        text: searchResult.text,
        searchResults: searchResult.searchResults,
        citations: searchResult.citations || [],
      },
      { model: "anthropic/claude-sonnet-4" }
    );
    console.log(`[TEST ${idx + 1}] → Status: ${noteResult.status}`);

    // Skip if not a correction
    if (noteResult.status !== "CORRECTION WITH TRUSTWORTHY CITATION") {
      console.log(`[TEST ${idx + 1}] ⚠️ SKIPPED: ${noteResult.status}`);
      return {
        post,
        sarcasmScore: sarcasmResult.score,
        keywords,
        searchContextResult: searchResult,
        noteResult,
        allScoresPassed: false,
        skipReason: `Status: ${noteResult.status}`,
      };
    }

    // 5. CHECK CHARACTER LIMIT
    console.log(`[TEST ${idx + 1}] Checking character limit...`);
    const charLimitResult = checkCharacterLimit(noteResult.note);
    console.log(`[TEST ${idx + 1}] → Characters: ${charLimitResult.characterCount}/${charLimitResult.limit} - ${charLimitResult.valid ? 'PASS' : 'FAIL'}`);
    
    if (!charLimitResult.valid) {
      console.log(`[TEST ${idx + 1}] ❌ FAILED: Note exceeds 280 character limit`);
      return {
        post,
        sarcasmScore: sarcasmResult.score,
        keywords,
        searchContextResult: searchResult,
        noteResult,
        characterLimit: {
          valid: charLimitResult.valid,
          characterCount: charLimitResult.characterCount,
        },
        allScoresPassed: false,
        skipReason: `Character limit exceeded: ${charLimitResult.characterCount} > ${charLimitResult.limit}`,
      };
    }
    
    // 6. RUN SCORING FILTERS
    console.log(`[TEST ${idx + 1}] Running scoring filters...`);
    
    // URL Check
    const urlScore = await checkUrlValidity(noteResult.note, noteResult.url);
    console.log(`[TEST ${idx + 1}] → URL score: ${urlScore.score.toFixed(2)}`);
    
    // Positive and Disagreement filters
    const filterScores = await runScoringFilters(noteResult.note, originalContent.text);
    
    const scores = {
      url: urlScore.score,
      positive: filterScores.positive.score,
      disagreement: filterScores.disagreement.score,
    };
    
    // Check thresholds
    const allPassed = scores.url > 0.5 && scores.positive > 0.5 && scores.disagreement > 0.5 && charLimitResult.valid;
    
    console.log(`[TEST ${idx + 1}] SCORES SUMMARY:`);
    console.log(`[TEST ${idx + 1}]   Sarcasm: ${sarcasmResult.score.toFixed(2)} ✓`);
    console.log(`[TEST ${idx + 1}]   Character Limit: ${charLimitResult.characterCount}/${charLimitResult.limit} ${charLimitResult.valid ? '✓' : '✗'}`);
    console.log(`[TEST ${idx + 1}]   URL: ${scores.url.toFixed(2)} ${scores.url > 0.5 ? '✓' : '✗'}`);
    console.log(`[TEST ${idx + 1}]   Positive: ${scores.positive.toFixed(2)} ${scores.positive > 0.5 ? '✓' : '✗'}`);
    console.log(`[TEST ${idx + 1}]   Disagreement: ${scores.disagreement.toFixed(2)} ${scores.disagreement > 0.5 ? '✓' : '✗'}`);
    console.log(`[TEST ${idx + 1}] ${allPassed ? '✅ ALL PASSED' : '❌ FAILED THRESHOLDS'}`);
    
    if (allPassed) {
      console.log(`[TEST ${idx + 1}] 📝 Note would be posted (but we're in test mode):`);
      console.log(`[TEST ${idx + 1}]    "${noteResult.note.substring(0, 100)}..."`);
    }
    
    return {
      post,
      sarcasmScore: sarcasmResult.score,
      keywords,
      searchContextResult: searchResult,
      noteResult,
      characterLimit: {
        valid: charLimitResult.valid,
        characterCount: charLimitResult.characterCount,
      },
      scores,
      allScoresPassed: allPassed,
      skipReason: allPassed ? undefined : "Failed score thresholds",
    };
    
  } catch (err) {
    console.error(`[TEST ${idx + 1}] ⚠️ ERROR:`, err);
    return null;
  }
}

function createTestLogEntry(
  result: PipelineResult,
  branchName: string
): any {
  const url = `https://twitter.com/i/status/${result.post.id}`;
  
  // Build the full result text with scores
  let fullResult = `TEST RUN - NO TWITTER POST\n\n`;
  fullResult += `SARCASM SCORE: ${result.sarcasmScore?.toFixed(2) || 'N/A'}\n\n`;
  
  if (result.keywords) {
    fullResult += `KEYWORDS EXTRACTED:\n`;
    fullResult += `- Keywords: ${result.keywords.keywords.join(", ")}\n`;
    fullResult += `- Entities: ${result.keywords.entities.join(", ")}\n`;
    fullResult += `- Claims: ${result.keywords.claims.join("; ")}\n\n`;
  }
  
  if (result.scores) {
    fullResult += `FILTER SCORES:\n`;
    fullResult += `- URL Score: ${result.scores.url.toFixed(2)}\n`;
    fullResult += `- Positive Claims Score: ${result.scores.positive.toFixed(2)}\n`;
    fullResult += `- Disagreement Score: ${result.scores.disagreement.toFixed(2)}\n`;
    fullResult += `- All Passed: ${result.allScoresPassed}\n\n`;
  }
  
  if (result.skipReason) {
    fullResult += `SKIP REASON: ${result.skipReason}\n\n`;
  }
  
  if (result.noteResult) {
    fullResult += `NOTE STATUS: ${result.noteResult.status}\n`;
    fullResult += `NOTE: ${result.noteResult.note}\n`;
    fullResult += `URL: ${result.noteResult.url}`;
  }
  
  const entry: any = {
    URL: url,
    "Bot name": `TEST-${branchName}`,
    "Initial tweet body": JSON.stringify(result.post), // Full JSON object
    "Full Result": fullResult,
    "Final note": result.noteResult?.note || "",
    "Would be posted": result.allScoresPassed ? 1 : 0,
    "Posted to X": false, // Always false in test mode
  };
  
  // Add optional fields only if they have values
  if (result.post.text) {
    entry["Initial post text"] = result.post.text;
  }
  
  // Add the filter columns as decimal scores (all are 0.0 to 1.0)
  if (result.sarcasmScore !== undefined) {
    entry["Not sarcasm filter"] = result.sarcasmScore;
  }
  
  if (result.characterLimit) {
    // Could calculate a score based on how much under the limit, but for now binary
    entry["Character count filter"] = result.characterLimit.valid ? 1.0 : 0.0;
  }
  
  if (result.scores?.positive !== undefined) {
    entry["Positive claims only filter"] = result.scores.positive;
  }
  
  if (result.scores?.disagreement !== undefined) {
    entry["Significant correction filter"] = result.scores.disagreement;
  }
  
  if (result.keywords && result.keywords.keywords) {
    entry["Keywords extracted"] = result.keywords.keywords.join(", ");
  }
  
  return entry;
}

async function main() {
  try {
    // Get current branch
    let currentBranch = "refactor";
    try {
      currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
    } catch (error) {
      console.warn("[main] Could not determine branch");
    }
    
    console.log(`\n[TEST] Running on branch: ${currentBranch}`);
    console.log(`[TEST] Processing up to ${maxPosts} posts`);
    console.log(`[TEST] Concurrency: ${concurrencyLimit}`);
    
    // Initialize Airtable
    const airtableLogger = new AirtableLogger();
    const logEntries: any[] = [];
    
    // Get existing URLs (to avoid duplicates)
    const testBotName = `TEST-${currentBranch}`;
    const existingUrls = await airtableLogger.getExistingUrlsForBot(testBotName);
    const skipPostIds = new Set<string>();
    existingUrls.forEach((url) => {
      const match = url.match(/status\/(\d+)$/);
      if (match && match[1]) skipPostIds.add(match[1]);
    });
    
    console.log(`[TEST] Skipping ${skipPostIds.size} already-tested posts`);
    
    // Fetch eligible posts
    const posts = await fetchEligiblePosts(maxPosts, skipPostIds, 2);
    if (!posts.length) {
      console.log("\n[TEST] No new eligible posts found.");
      clearTimeout(softTimeout);
      clearTimeout(hardTimeout);
      process.exit(0);
    }
    
    console.log(`\n[TEST] Found ${posts.length} posts to test`);
    console.log("=" * 80);
    
    // Process posts with concurrency limit
    const queue = new PQueue({ concurrency: concurrencyLimit });
    const results: PipelineResult[] = [];
    
    for (const [idx, post] of posts.entries()) {
      // Check for soft timeout before adding new tasks
      if (shouldStopProcessing) {
        console.log(`[TEST] Soft timeout reached, skipping remaining ${posts.length - idx} posts`);
        break;
      }
      
      queue.add(async () => {
        const result = await runTestPipeline(post, idx);
        if (result) {
          results.push(result);
          const logEntry = createTestLogEntry(result, currentBranch);
          logEntries.push(logEntry);
        }
      });
    }
    
    await queue.onIdle();
    
    // Print summary
    console.log("\n" + "=".repeat(80));
    console.log("TEST SUMMARY");
    console.log("=".repeat(80));
    
    const passedAll = results.filter(r => r.allScoresPassed).length;
    const failedSarcasm = results.filter(r => (r.sarcasmScore || 1) <= 0.5).length;
    const failedOther = results.filter(r => !r.allScoresPassed && (r.sarcasmScore || 1) > 0.5).length;
    
    console.log(`Total processed: ${results.length}`);
    console.log(`Would post: ${passedAll}`);
    console.log(`Failed sarcasm: ${failedSarcasm}`);
    console.log(`Failed other filters: ${failedOther}`);
    
    // Log to Airtable
    if (logEntries.length > 0) {
      console.log(`\n[TEST] Logging ${logEntries.length} entries to Airtable...`);
      try {
        await airtableLogger.logMultipleEntries(logEntries);
        console.log(`[TEST] ✅ Successfully logged to Airtable`);
      } catch (err) {
        console.error("[TEST] ⚠️ Failed to log to Airtable:", err);
      }
    }
    
    console.log("\n[TEST] Test complete!");
    clearTimeout(softTimeout);
    clearTimeout(hardTimeout);
    process.exit(0);
    
  } catch (error) {
    console.error("\n[TEST] Fatal error:", error);
    clearTimeout(softTimeout);
    clearTimeout(hardTimeout);
    process.exit(1);
  }
}

// Run the test
main();