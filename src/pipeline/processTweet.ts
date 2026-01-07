import { getOriginalTweetContent } from "../utils/retweetUtils";
import { checkVerifiableFacts } from "./checkVerifiableFacts";
import { extractKeywords } from "./extractKeywords";
import { searchWithKeywords } from "./searchWithKeywords";
import { checkUrlAndSource } from "./urlSourceChecker";
import { runScoringFilters } from "./scoringFilters";
import { predictHelpfulness } from "./predictHelpfulness";
import { evaluateNoteWithXAPI } from "./evaluateNoteXAPI";
import { writeNoteWithSearchFn } from "./writeNoteWithSearchGoal";
import { PipelineResult } from "../lib/types";
import {
  BotConfig,
  DEFAULT_THRESHOLDS,
  getBotThresholds,
} from "../lib/botConfig";

/**
 * Default bot configuration (matches current production behavior)
 */
const DEFAULT_BOT_CONFIG: BotConfig = {
  id: "default",
  name: "Default",
  description: "Default production configuration",
  noteModel: "anthropic/claude-sonnet-4",
  enabled: true,
};

/**
 * Calculate a composite score for Elo comparisons
 * Higher is better. Weights the different scores.
 */
function calculateCompositeScore(result: PipelineResult): number {
  // If the note wasn't even generated or failed early, score is 0
  if (!result.noteResult || result.noteResult.status !== "CORRECTION WITH TRUSTWORTHY CITATION") {
    return 0;
  }

  // Base score for generating a valid note
  let score = 0.2;

  // Add score components (each weighted)
  if (result.scores) {
    score += result.scores.url * 0.15;
    score += result.scores.positive * 0.15;
    score += result.scores.disagreement * 0.15;
  }

  if (result.helpfulnessScore !== undefined) {
    score += result.helpfulnessScore * 0.25;
  }

  // X API score is -1 to 1, normalize to 0-1
  if (result.xApiScore !== undefined && result.xApiSuccess) {
    const normalizedXApiScore = (result.xApiScore + 1) / 2;
    score += normalizedXApiScore * 0.1;
  }

  // Bonus for passing all thresholds
  if (result.allScoresPassed) {
    score += 0.1;
  }

  return score;
}

export async function processTweet(
  post: any,
  idx: number,
  botConfig?: BotConfig
): Promise<PipelineResult | null> {
  const bot = botConfig || DEFAULT_BOT_CONFIG;
  const thresholds = getBotThresholds(bot);
  console.log(
    `[pipeline] Starting pipeline for post #${idx + 1} (ID: ${
      post.id
    }) with bot: ${bot.id}`
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

    if (verifiableFactResult.score <= thresholds.verifiableFact) {
      console.log(
        `[pipeline] Post filtered for non-verifiable content (score: ${verifiableFactResult.score.toFixed(
          2
        )} <= ${thresholds.verifiableFact})`
      );
      return {
        post,
        botId: bot.id,
        verifiableFactResult,
        allScoresPassed: false,
        skipReason: `Verifiable fact filter: ${verifiableFactResult.reasoning}`,
        compositeScore: 0,
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
        botId: bot.id,
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
        compositeScore: 0,
      };
    }

    // 4. WRITE NOTE (using bot's configured model)
    console.log(`[pipeline] Writing note with model: ${bot.noteModel}`);
    const noteResult = await writeNoteWithSearchFn(
      {
        text: searchResult.text,
        searchResults: searchResult.searchResults,
        citations,
      },
      { model: bot.noteModel }
    );
    console.log(`[pipeline] Note generated`);

    // Skip if not a correction
    if (noteResult.status !== "CORRECTION WITH TRUSTWORTHY CITATION") {
      console.log(`[pipeline] Skipping - status: ${noteResult.status}`);
      return {
        post,
        botId: bot.id,
        verifiableFactResult,
        keywords,
        searchContextResult: searchResult,
        noteResult,
        allScoresPassed: false,
        skipReason: `Status: ${noteResult.status}`,
        compositeScore: 0,
      };
    }

    // 5. RUN SCORING FILTERS
    console.log(`[pipeline] Running scoring filters...`);

    // URL Check - now checks if the source actually supports the claims
    const urlScore = await checkUrlAndSource(noteResult.note, noteResult.url);
    console.log(
      `[pipeline] URL source support score: ${urlScore.score.toFixed(2)}`
    );

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

    const filterDetails = {
      url: {
        score: urlScore.score,
        reasoning: `URL source support: ${
          urlScore.hasUrl ? "URL provided" : "No URL provided"
        }`,
      },
      positive: {
        score: filterScores.positive.score,
        reasoning: filterScores.positive.reasoning,
      },
      disagreement: {
        score: filterScores.disagreement.score,
        reasoning: filterScores.disagreement.reasoning,
      },
    };

    // Check initial thresholds using bot's configured thresholds
    const initialPassed =
      scores.url > thresholds.url &&
      scores.positive > thresholds.positive &&
      scores.disagreement > thresholds.disagreement;

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
        `[pipeline] Helpfulness score: ${helpfulnessScore.toFixed(
          2
        )} - ${helpfulnessReasoning}`
      );

      // Check helpfulness threshold
      if (helpfulnessScore < thresholds.helpfulness) {
        allPassed = false;
        console.log(
          `[pipeline] Helpfulness score too low (${helpfulnessScore.toFixed(
            2
          )} < ${thresholds.helpfulness}), note will not be posted`
        );
      }

      // 7. EVALUATE WITH X API
      console.log(`[pipeline] Evaluating with X API...`);
      const xApiResult = await evaluateNoteWithXAPI(noteResult.note, post.id);
      xApiScore = xApiResult.claimOpinionScore;
      xApiSuccess = xApiResult.success;

      if (xApiSuccess) {
        console.log(`[pipeline] X API score: ${xApiScore}`);

        // Check X API threshold
        if (xApiScore < thresholds.xApiScore) {
          allPassed = false;
          console.log(
            `[pipeline] X API score too low (${xApiScore} < ${thresholds.xApiScore}), note will not be posted`
          );
        }
      } else {
        console.log(`[pipeline] X API evaluation failed: ${xApiResult.error}`);
      }
    }

    console.log(`[pipeline] All filters passed: ${allPassed}`);

    const result: PipelineResult = {
      post,
      botId: bot.id,
      verifiableFactResult,
      keywords,
      searchContextResult: searchResult,
      noteResult,
      scores,
      filterDetails,
      helpfulnessScore,
      helpfulnessReasoning,
      xApiScore,
      xApiSuccess,
      allScoresPassed: allPassed,
      skipReason: allPassed
        ? undefined
        : helpfulnessScore !== undefined && helpfulnessScore < thresholds.helpfulness
        ? `Helpfulness score too low (${helpfulnessScore.toFixed(2)})`
        : xApiScore !== undefined && xApiScore < thresholds.xApiScore
        ? `X API score too low (${xApiScore})`
        : "Failed score thresholds",
    };

    // Calculate composite score for Elo comparisons
    result.compositeScore = calculateCompositeScore(result);

    return result;
  } catch (err) {
    console.error(`[pipeline] Error for post #${idx + 1} (bot: ${bot.id}):`, err);
    return null;
  }
}