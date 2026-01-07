import { getOriginalTweetContent } from "../utils/retweetUtils";
import { checkVerifiableFacts } from "./checkVerifiableFacts";
import { extractKeywords } from "./extractKeywords";
import { searchWithKeywords } from "./searchWithKeywords";
import { multiSourceSearch } from "./multiSourceSearch";
import { checkUrlAndSource } from "./urlSourceChecker";
import { runScoringFilters } from "./scoringFilters";
import { predictHelpfulness } from "./predictHelpfulness";
import { evaluateNoteWithXAPI } from "./evaluateNoteXAPI";
import { writeNoteWithSearchFn } from "./writeNoteWithSearchGoal";
import { PipelineResult } from "../lib/types";
import { BotConfig, getBotThresholds } from "../lib/botConfig";

/**
 * Default bot configuration (matches current production behavior)
 */
const DEFAULT_BOT_CONFIG: BotConfig = {
  id: "default",
  name: "Default",
  description: "Default production configuration",
  noteModel: "anthropic/claude-sonnet-4",
  enabled: true,
  weight: 100,
  searchStrategy: "default",
};

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
      };
    }

    // 2. EXTRACT KEYWORDS
    console.log(`[pipeline] Extracting keywords...`);
    const keywords = await extractKeywords(originalContent.text, quoteContext);
    console.log(`[pipeline] Keywords: ${keywords.keywords.join(", ")}`);

    // 3. SEARCH (using bot's search strategy)
    const todayDate = new Date().toISOString().split("T")[0]!;
    let searchResult: { text: string; searchResults: string; citations?: string[] };
    let citations: string[];

    if (bot.searchStrategy === "multi-source") {
      console.log(`[pipeline] Using multi-source search strategy...`);
      const multiResult = await multiSourceSearch({
        keywords,
        date: todayDate,
        quoteContext,
        originalText: originalContent.text,
      });
      searchResult = {
        text: multiResult.text,
        searchResults: multiResult.searchResults,
        citations: multiResult.citations,
      };
      citations = multiResult.citations;
      console.log(`[pipeline] Multi-source search complete (topic: "${multiResult.topic}")`);
    } else {
      console.log(`[pipeline] Using default Perplexity search...`);
      searchResult = await searchWithKeywords(
        {
          keywords,
          date: todayDate,
          quoteContext,
          originalText: originalContent.text,
        },
        { model: "perplexity/sonar" as any }
      );
      citations = searchResult.citations || [];
      console.log(`[pipeline] Search complete`);
    }

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
      };
    }

    // 4. WRITE NOTE (using bot's configured model)
    console.log(`[pipeline] Writing note with model: ${bot.noteModel}`);
    let noteResult = await writeNoteWithSearchFn(
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
      };
    }

    // 4b. EARLY X API CHECK (optional - regenerate note if score too low)
    let earlyXApiScore: number | undefined;
    let earlyXApiSuccess: boolean | undefined;

    if (bot.useEarlyXApiCheck) {
      console.log(`[pipeline] Running early X API evaluation...`);
      const earlyXApiResult = await evaluateNoteWithXAPI(
        noteResult.note,
        post.id,
        noteResult.url
      );
      earlyXApiScore = earlyXApiResult.claimOpinionScore;
      earlyXApiSuccess = earlyXApiResult.success;

      if (earlyXApiSuccess) {
        console.log(`[pipeline] Early X API score: ${earlyXApiScore}`);

        // If score is below -0.5, regenerate the note once
        if (earlyXApiScore < -0.5) {
          console.log(
            `[pipeline] X API score too low (${earlyXApiScore} < -0.5), regenerating note...`
          );

          noteResult = await writeNoteWithSearchFn(
            {
              text: searchResult.text,
              searchResults: searchResult.searchResults,
              citations,
            },
            { model: "anthropic/claude-sonnet-4" }
          );
          console.log(`[pipeline] Note regenerated`);

          // Check status again
          if (noteResult.status !== "CORRECTION WITH TRUSTWORTHY CITATION") {
            console.log(
              `[pipeline] Skipping - regenerated note status: ${noteResult.status}`
            );
            return {
              post,
              botId: bot.id,
              verifiableFactResult,
              keywords,
              searchContextResult: searchResult,
              noteResult,
              xApiScore: earlyXApiScore,
              xApiSuccess: earlyXApiSuccess,
              allScoresPassed: false,
              skipReason: `Status after regeneration: ${noteResult.status}`,
            };
          }

          // Re-evaluate with X API
          console.log(`[pipeline] Re-evaluating with X API...`);
          const reEvalResult = await evaluateNoteWithXAPI(
            noteResult.note,
            post.id,
            noteResult.url
          );
          earlyXApiScore = reEvalResult.claimOpinionScore;
          earlyXApiSuccess = reEvalResult.success;

          if (earlyXApiSuccess) {
            console.log(
              `[pipeline] X API score after regeneration: ${earlyXApiScore}`
            );
          } else {
            console.log(
              `[pipeline] X API re-evaluation failed: ${reEvalResult.error}`
            );
          }
        }
      } else {
        console.log(
          `[pipeline] Early X API evaluation failed: ${earlyXApiResult.error}`
        );
      }
    }

    // 5. RUN SCORING FILTERS
    console.log(`[pipeline] Running scoring filters...`);

    // URL Check - now checks if the source actually supports the claims
    const urlScore = await checkUrlAndSource(noteResult.note, noteResult.url);
    console.log(
      `[pipeline] URL source support score: ${urlScore.score.toFixed(2)}`
    );

    // Positive, Disagreement, and optionally Partisan filters
    const filterScores = await runScoringFilters(
      noteResult.note,
      originalContent.text,
      { includePartisan: bot.usePartisanFilter }
    );

    const scores: {
      url: number;
      positive: number;
      disagreement: number;
      partisan?: number;
    } = {
      url: urlScore.score,
      positive: filterScores.positive.score,
      disagreement: filterScores.disagreement.score,
    };

    const filterDetails: {
      url: { score: number; reasoning: string };
      positive: { score: number; reasoning: string };
      disagreement: { score: number; reasoning: string };
      partisan?: { score: number; reasoning: string };
    } = {
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

    // Add partisan score if filter was run
    if (filterScores.partisan) {
      scores.partisan = filterScores.partisan.score;
      filterDetails.partisan = {
        score: filterScores.partisan.score,
        reasoning: filterScores.partisan.reasoning,
      };
    }

    // Check initial thresholds using bot's configured thresholds
    let initialPassed =
      scores.url > thresholds.url &&
      scores.positive > thresholds.positive &&
      scores.disagreement > thresholds.disagreement;

    // Also check partisan threshold if filter was run
    if (bot.usePartisanFilter && filterScores.partisan) {
      if (filterScores.partisan.score <= thresholds.partisan) {
        initialPassed = false;
        console.log(
          `[pipeline] Partisan filter failed (${filterScores.partisan.score.toFixed(
            2
          )} <= ${thresholds.partisan})`
        );
      }
    }

    const partisanLog = scores.partisan !== undefined
      ? `, Partisan: ${scores.partisan.toFixed(2)}`
      : "";
    console.log(
      `[pipeline] Scores - URL: ${scores.url.toFixed(
        2
      )}, Positive: ${scores.positive.toFixed(
        2
      )}, Disagreement: ${scores.disagreement.toFixed(2)}${partisanLog}`
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
      // If we used early X API check, use those scores instead of re-evaluating
      if (bot.useEarlyXApiCheck && earlyXApiScore !== undefined) {
        xApiScore = earlyXApiScore;
        xApiSuccess = earlyXApiSuccess;
        console.log(`[pipeline] Using early X API score: ${xApiScore}`);
      } else {
        console.log(`[pipeline] Evaluating with X API...`);
        const xApiResult = await evaluateNoteWithXAPI(noteResult.note, post.id);
        xApiScore = xApiResult.claimOpinionScore;
        xApiSuccess = xApiResult.success;

        if (xApiSuccess) {
          console.log(`[pipeline] X API score: ${xApiScore}`);
        } else {
          console.log(`[pipeline] X API evaluation failed: ${xApiResult.error}`);
        }
      }

      // Check X API threshold
      if (xApiSuccess && xApiScore !== undefined && xApiScore < thresholds.xApiScore) {
        allPassed = false;
        console.log(
          `[pipeline] X API score too low (${xApiScore} < ${thresholds.xApiScore}), note will not be posted`
        );
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

    return result;
  } catch (err) {
    console.error(`[pipeline] Error for post #${idx + 1} (bot: ${bot.id}):`, err);
    return null;
  }
}