import { fetchEligiblePosts } from "../api/fetchEligiblePosts";
import { AirtableLogger } from "../api/airtableLogger";
import { getOriginalTweetContent } from "../utils/retweetUtils";
import { checkSarcasm } from "../pipeline/sarcasmFilter";
import { extractKeywords } from "../pipeline/extractKeywords";
import { searchWithKeywords } from "../pipeline/searchWithKeywords";
import { checkUrlValidity } from "../pipeline/urlChecker";
import { runScoringFilters } from "../pipeline/scoringFilters";
import PQueue from "p-queue";
import { execSync } from "child_process";
import { writeNoteWithSearchFn } from "../pipeline/writeNoteWithSearchGoal";

const maxPosts = parseInt(process.env.MAX_POSTS || "10");
const concurrencyLimit = 3;

// Soft timeout (8 minutes) - stop adding new tasks
const SOFT_TIMEOUT_MS = 8 * 60 * 1000;
// Hard timeout (9 minutes) - force exit
const HARD_TIMEOUT_MS = 9 * 60 * 1000;

let shouldStopProcessing = false;

interface PipelineResult {
  post: any;
  sarcasmScore?: number;
  keywords?: any;
  searchContextResult?: any;
  noteResult?: any;
  scores?: {
    url: number;
    positive: number;
    disagreement: number;
  };
  allScoresPassed: boolean;
  skipReason?: string;
}

async function runRefactoredPipeline(
  post: any,
  idx: number
): Promise<PipelineResult | null> {
  console.log(
    `[pipeline] Starting refactored pipeline for post #${idx + 1} (ID: ${
      post.id
    })`
  );

  try {
    // Get the original tweet content
    const originalContent = getOriginalTweetContent(post);
    const quoteContext = originalContent.retweetContext;

    // 1. SARCASM FILTER (Early exit)
    console.log(`[pipeline] Running sarcasm filter...`);
    const sarcasmResult = await checkSarcasm(
      originalContent.text,
      quoteContext
    );
    console.log(
      `[pipeline] Sarcasm score: ${sarcasmResult.score.toFixed(2)} - ${
        sarcasmResult.reasoning
      }`
    );

    if (sarcasmResult.score <= 0.5) {
      console.log(
        `[pipeline] Post filtered for sarcasm (score: ${sarcasmResult.score.toFixed(
          2
        )})`
      );
      return {
        post,
        sarcasmScore: sarcasmResult.score,
        allScoresPassed: false,
        skipReason: `Sarcasm filter: ${sarcasmResult.reasoning}`,
      };
    }

    // 2. EXTRACT KEYWORDS
    console.log(`[pipeline] Extracting keywords...`);
    const keywords = await extractKeywords(originalContent.text, quoteContext);
    console.log(`[pipeline] Keywords: ${keywords.keywords.join(", ")}`);

    // 3. SEARCH WITH KEYWORDS + DATE
    console.log(`[pipeline] Searching with keywords...`);
    const todayDate = new Date().toISOString().split("T")[0];

    const searchResult = await searchWithKeywords(
      {
        keywords,
        date: todayDate!,
        quoteContext,
        originalText: originalContent.text,
      },
      { model: "perplexity/sonar" as any }
    );
    console.log(`[pipeline] Search complete`);

    // 4. WRITE NOTE (using existing implementation for now)
    console.log(`[pipeline] Writing note...`);
    const noteResult = await writeNoteWithSearchFn(
      {
        text: searchResult.text,
        searchResults: searchResult.searchResults,
        citations: searchResult.citations || [],
      },
      { model: "anthropic/claude-sonnet-4" }
    );
    console.log(`[pipeline] Note generated`);

    // Skip if not a correction
    if (noteResult.status !== "CORRECTION WITH TRUSTWORTHY CITATION") {
      console.log(`[pipeline] Skipping - status: ${noteResult.status}`);
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

    // 5. RUN SCORING FILTERS
    console.log(`[pipeline] Running scoring filters...`);

    // URL Check
    const urlScore = await checkUrlValidity(noteResult.note, noteResult.url);
    console.log(`[pipeline] URL score: ${urlScore.score.toFixed(2)}`);

    // Positive and Disagreement filters
    const filterScores = await runScoringFilters(
      noteResult.note,
      originalContent.text
    );

    const scores = {
      url: urlScore.score,
      positive: filterScores.positive.score,
      disagreement: filterScores.disagreement.score,
    };

    // Check thresholds
    const allPassed =
      scores.url > 0.5 && scores.positive > 0.5 && scores.disagreement > 0.5;

    console.log(
      `[pipeline] Scores - URL: ${scores.url.toFixed(
        2
      )}, Positive: ${scores.positive.toFixed(
        2
      )}, Disagreement: ${scores.disagreement.toFixed(2)}`
    );
    console.log(`[pipeline] All filters passed: ${allPassed}`);

    return {
      post,
      sarcasmScore: sarcasmResult.score,
      keywords,
      searchContextResult: searchResult,
      noteResult,
      scores,
      allScoresPassed: allPassed,
      skipReason: allPassed ? undefined : "Failed score thresholds",
    };
  } catch (err) {
    console.error(`[pipeline] Error for post #${idx + 1}:`, err);
    return null;
  }
}

function createLogEntryWithScores(
  result: PipelineResult,
  branchName: string,
  commit?: string,
  postedToX: boolean = false
): any {
  const url = `https://twitter.com/i/status/${result.post.id}`;
  const tweetText = result.post.text || "";

  // Build the full result text with scores
  let fullResult = `SARCASM SCORE: ${
    result.sarcasmScore?.toFixed(2) || "N/A"
  }\n\n`;

  if (result.keywords) {
    fullResult += `KEYWORDS EXTRACTED:\n`;
    fullResult += `- Keywords: ${result.keywords.keywords.join(", ")}\n`;
    fullResult += `- Entities: ${result.keywords.entities.join(", ")}\n`;
    fullResult += `- Claims: ${result.keywords.claims.join("; ")}\n\n`;
  }

  if (result.scores) {
    fullResult += `FILTER SCORES:\n`;
    fullResult += `- URL Score: ${result.scores.url.toFixed(2)}\n`;
    fullResult += `- Positive Claims Score: ${result.scores.positive.toFixed(
      2
    )}\n`;
    fullResult += `- Disagreement Score: ${result.scores.disagreement.toFixed(
      2
    )}\n`;
    fullResult += `- All Passed: ${result.allScoresPassed}\n\n`;
  }

  if (result.skipReason) {
    fullResult += `SKIP REASON: ${result.skipReason}\n\n`;
  }

  if (result.searchContextResult) {
    fullResult += `SEARCH RESULTS:\n${result.searchContextResult.searchResults}\n\n`;
  }

  if (result.noteResult) {
    fullResult += `NOTE STATUS: ${result.noteResult.status}\n`;
    fullResult += `NOTE: ${result.noteResult.note}\n`;
    fullResult += `URL: ${result.noteResult.url}`;
  }

  return {
    URL: url,
    "Bot name": branchName,
    "Initial post text": tweetText,  // The actual tweet text
    "Initial tweet body": JSON.stringify(result.post),  // The full JSON object
    "Full Result": fullResult,
    "Final note": result.noteResult?.note || "",
    "Would be posted": result.allScoresPassed ? 1 : 0,
    "Posted to X": postedToX,
    // Use the correct filter column names (if they exist)
    "Not sarcasm filter": result.sarcasmScore,
    "Positive claims only filter": result.scores?.positive,
    "Significant correction filter": result.scores?.disagreement,
    "Keywords extracted": result.keywords
      ? result.keywords.keywords.join(", ")
      : "",
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
        }).trim().toLowerCase();
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

    console.log(`[main] Skipping ${skipPostIds.size} already-processed posts`);

    // Fetch eligible posts
    const posts = await fetchEligiblePosts(maxPosts, skipPostIds, 3);
    if (!posts.length) {
      console.log("No new eligible posts found.");
      clearTimeout(softTimeout);
      clearTimeout(hardTimeout);
      process.exit(0);
    }

    console.log(
      `[main] Starting refactored pipelines for ${posts.length} posts...`
    );

    // Process posts with concurrency limit
    const queue = new PQueue({ concurrency: concurrencyLimit });
    let submitted = 0;

    for (const [idx, post] of posts.entries()) {
      if (shouldStopProcessing) {
        console.log(`[main] Stopping - ${posts.length - idx} posts remaining`);
        break;
      }

      queue.add(async () => {
        const result = await runRefactoredPipeline(post, idx);
        if (!result) return;

        let postedToX = false;

        // Submit to Twitter if all checks pass and we're on main
        if (result.allScoresPassed && shouldSubmitNotes) {
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
