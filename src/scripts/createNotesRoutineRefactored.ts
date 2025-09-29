import { fetchEligiblePosts } from "../api/fetchEligiblePosts";
import { AirtableLogger } from "../api/airtableLogger";
import { getOriginalTweetContent } from "../utils/retweetUtils";
import {
  checkVerifiableFacts,
  VerifiableFactResult,
} from "../pipeline/checkVerifiableFacts";
import { extractKeywords } from "../pipeline/extractKeywords";
import { searchWithKeywords } from "../pipeline/searchWithKeywords";
import { checkUrlAndSource } from "../pipeline/urlSourceChecker";
import { runScoringFilters } from "../pipeline/scoringFilters";
import { predictHelpfulness } from "../pipeline/predictHelpfulness";
import { evaluateNoteWithXAPI } from "../pipeline/evaluateNoteXAPI";
import PQueue from "p-queue";
import { execSync } from "child_process";
import { writeNoteWithSearchFn } from "../pipeline/writeNoteWithSearchGoal";
import { considerForRerun, RerunQueueLogger } from "../pipeline/considerForRerun";

const maxPosts = parseInt(process.env.MAX_POSTS || "10");
const concurrencyLimit = 3;

// Soft timeout (8 minutes) - stop adding new tasks
const SOFT_TIMEOUT_MS = 8 * 60 * 1000;
// Hard timeout (9 minutes) - force exit
const HARD_TIMEOUT_MS = 9 * 60 * 1000;

let shouldStopProcessing = false;

export interface PipelineResult {
  post: any;
  verifiableFactResult?: VerifiableFactResult;
  keywords?: any;
  searchContextResult?: any;
  noteResult?: any;
  scores?: {
    url: number;
    positive: number;
    disagreement: number;
  };
  helpfulnessScore?: number;
  helpfulnessReasoning?: string;
  xApiScore?: number;
  xApiSuccess?: boolean;
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

    // Extract image URL if present
    let imageUrl: string | undefined;
    if (post.media && post.media.length > 0) {
      const imageMedia = post.media.find(
        (media: any) => media.type === "photo"
      );
      if (imageMedia && imageMedia.url) {
        imageUrl = imageMedia.url;
      }
    }

    // 1. VERIFIABLE FACT FILTER (Early exit)
    console.log(`[pipeline] Running verifiable fact filter...`);
    const verifiableFactResult = await checkVerifiableFacts(
      originalContent.text,
      quoteContext,
      imageUrl
    );

    console.log(
      `[pipeline] Verifiable fact score: ${verifiableFactResult.score.toFixed(
        2
      )} - ${verifiableFactResult.reasoning}`
    );

    if (verifiableFactResult.score <= 0.5) {
      console.log(
        `[pipeline] Post filtered for non-verifiable content (score: ${verifiableFactResult.score.toFixed(
          2
        )})`
      );
      return {
        post,
        verifiableFactResult,
        allScoresPassed: false,
        skipReason: `Verifiable fact filter: ${verifiableFactResult.reasoning}`,
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

    const citations = searchResult.citations || [];

    // If there are no citations, skip the rest of the pipeline
    if (citations.length === 0) {
      console.log(
        `[pipeline] No citations found, skipping the rest of the pipeline`
      );
      return {
        post,
        verifiableFactResult,
        keywords,
        searchContextResult: searchResult,
        noteResult: {
          status: "NO CITATIONS",
          note: "No citations found",
          url: "",
        },
        allScoresPassed: false,
        skipReason: "No citations found",
      };
    }

    // 4. WRITE NOTE (using existing implementation for now)
    console.log(`[pipeline] Writing note...`);
    const noteResult = await writeNoteWithSearchFn(
      {
        text: searchResult.text,
        searchResults: searchResult.searchResults,
        citations,
      },
      { model: "anthropic/claude-sonnet-4" }
    );
    console.log(`[pipeline] Note generated`);

    // Skip if not a correction
    if (noteResult.status !== "CORRECTION WITH TRUSTWORTHY CITATION") {
      console.log(`[pipeline] Skipping - status: ${noteResult.status}`);
      return {
        post,
        verifiableFactResult,
        keywords,
        searchContextResult: searchResult,
        noteResult,
        allScoresPassed: false,
        skipReason: `Status: ${noteResult.status}`,
      };
    }

    // 5. RUN SCORING FILTERS
    console.log(`[pipeline] Running scoring filters...`);

    // URL Check - now checks if the source actually supports the claims
    const urlScore = await checkUrlAndSource(noteResult.note, noteResult.url);
    console.log(`[pipeline] URL source support score: ${urlScore.score.toFixed(2)}`);

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

    // Check initial thresholds
    const initialPassed =
      scores.url > 0.5 && scores.positive > 0.5 && scores.disagreement > 0.5;

    console.log(
      `[pipeline] Scores - URL: ${scores.url.toFixed(
        2
      )}, Positive: ${scores.positive.toFixed(
        2
      )}, Disagreement: ${scores.disagreement.toFixed(2)}`
    );

    // Only run helpfulness ratings if initial filters pass
    let helpfulnessScore: number | undefined;
    let helpfulnessReasoning: string | undefined;
    let xApiScore: number | undefined;
    let xApiSuccess: boolean | undefined;
    let allPassed = initialPassed;

    if (initialPassed) {
      // 6. PREDICT HELPFULNESS
      console.log(`[pipeline] Predicting helpfulness...`);
      const helpfulnessResult = await predictHelpfulness(
        noteResult.note,
        originalContent.text,
        searchResult.searchResults,
        noteResult.url
      );
      helpfulnessScore = helpfulnessResult.score;
      helpfulnessReasoning = helpfulnessResult.reasoning;
      console.log(
        `[pipeline] Helpfulness score: ${helpfulnessScore.toFixed(2)} - ${helpfulnessReasoning}`
      );

      // 7. EVALUATE WITH X API
      console.log(`[pipeline] Evaluating with X API...`);
      const xApiResult = await evaluateNoteWithXAPI(
        noteResult.note,
        post.id
      );
      xApiScore = xApiResult.claimOpinionScore;
      xApiSuccess = xApiResult.success;

      if (xApiSuccess) {
        console.log(`[pipeline] X API score: ${xApiScore}`);

        // Check X API threshold
        if (xApiScore < -0.5) {
          allPassed = false;
          console.log(`[pipeline] X API score too low (${xApiScore} < -0.5), note will not be posted`);
        }
      } else {
        console.log(`[pipeline] X API evaluation failed: ${xApiResult.error}`);
      }
    }

    console.log(`[pipeline] All filters passed: ${allPassed}`);

    return {
      post,
      verifiableFactResult,
      keywords,
      searchContextResult: searchResult,
      noteResult,
      scores,
      helpfulnessScore,
      helpfulnessReasoning,
      xApiScore,
      xApiSuccess,
      allScoresPassed: allPassed,
      skipReason: allPassed
        ? undefined
        : xApiScore !== undefined && xApiScore < -0.5
          ? `X API score too low (${xApiScore})`
          : "Failed score thresholds",
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
  let fullResult = `VERIFIABLE FACT SCORE: ${
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

  if (result.scores) {
    fullResult += `FILTER SCORES:\n`;
    fullResult += `- URL Score: ${result.scores.url.toFixed(2)}\n`;
    fullResult += `- Positive Claims Score: ${result.scores.positive.toFixed(
      2
    )}\n`;
    fullResult += `- Disagreement Score: ${result.scores.disagreement.toFixed(
      2
    )}\n`;

    if (result.helpfulnessScore !== undefined) {
      fullResult += `- Helpfulness Prediction: ${result.helpfulnessScore.toFixed(2)}\n`;
      if (result.helpfulnessReasoning) {
        fullResult += `  Reasoning: ${result.helpfulnessReasoning}\n`;
      }
    }

    if (result.xApiScore !== undefined) {
      fullResult += `- X API Score: ${result.xApiScore}${result.xApiSuccess ? '' : ' (failed)'}\n`;
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
    console.log(`[main] Found ${rerunQueueTweetIds.size} tweets in rerun queue`);

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
