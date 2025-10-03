import { getOriginalTweetContent } from "../utils/retweetUtils";
import { filterPostsForVerifiableClaims } from "./filterPostsForVerifiableClaims";
import { extractKeywords } from "./extractKeywords";
import { searchWithKeywords } from "./searchWithKeywords";
import { checkUrlAndSource } from "./checkUrlContent";
import { checkUrlValidity } from "./checkUrlQuality";
import { runScoringFilters } from "./scoringFilters";
import { predictHelpfulness } from "./predictHelpfulness";
import { evaluateNoteWithXAPI } from "./evaluateNoteXAPI";
import { writeNote } from "./writeNote";
import { checkCharacterLimit } from "./checkCharacterLimit";
import { PipelineResult, PipelineStep } from "../lib/types";

export async function processPost(
  post: any,
  idx: number
): Promise<PipelineResult | null> {
  console.log(
    `\n========================================`
  );
  console.log(
    `[pipeline] Starting pipeline for post #${idx + 1} (ID: ${post.id})`
  );
  console.log(
    `========================================\n`
  );

  const steps: PipelineStep[] = [];
  let stepNumber = 0;
  let failedAtStep: string | undefined;

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

    // STEP 1: VERIFIABLE FACT FILTER
    stepNumber++;
    const STEP_VERIFIABLE_FACTS = "Filter for Verifiable Facts";
    console.log(`[Step ${stepNumber}] START: ${STEP_VERIFIABLE_FACTS}`);

    const verifiableFactResult = await filterPostsForVerifiableClaims(
      originalContent.text,
      quoteContext,
      imageUrl
    );

    const step1Passed = verifiableFactResult.score > 0.5;
    console.log(`[Step ${stepNumber}] COMPLETE: ${STEP_VERIFIABLE_FACTS}`);
    console.log(`[Step ${stepNumber}]   Score: ${verifiableFactResult.score.toFixed(2)}`);
    console.log(`[Step ${stepNumber}]   Passed: ${step1Passed ? 'YES' : 'NO'}`);
    console.log(`[Step ${stepNumber}]   Reasoning: ${verifiableFactResult.reasoning}\n`);

    steps.push({
      stepNumber,
      stepName: STEP_VERIFIABLE_FACTS,
      completed: true,
      passed: step1Passed,
      score: verifiableFactResult.score,
      reasoning: verifiableFactResult.reasoning,
    });

    if (!step1Passed) {
      failedAtStep = STEP_VERIFIABLE_FACTS;
      return {
        post,
        stepsExecuted: steps,
        failedAtStep,
        verifiableFactResult,
        allScoresPassed: false,
        skipReason: `Failed at step ${stepNumber}: ${STEP_VERIFIABLE_FACTS} (score: ${verifiableFactResult.score.toFixed(2)})`,
      };
    }

    // STEP 2: EXTRACT KEYWORDS
    stepNumber++;
    const STEP_EXTRACT_KEYWORDS = "Extract Keywords";
    console.log(`[Step ${stepNumber}] START: ${STEP_EXTRACT_KEYWORDS}`);

    const keywords = await extractKeywords(originalContent.text, quoteContext);

    console.log(`[Step ${stepNumber}] COMPLETE: ${STEP_EXTRACT_KEYWORDS}`);
    console.log(`[Step ${stepNumber}]   Keywords: ${keywords.keywords.join(", ")}`);
    console.log(`[Step ${stepNumber}]   Entities: ${keywords.entities.join(", ")}\n`);

    steps.push({
      stepNumber,
      stepName: STEP_EXTRACT_KEYWORDS,
      completed: true,
      passed: true,
      data: keywords,
    });

    // STEP 3: SEARCH WITH KEYWORDS
    stepNumber++;
    const STEP_SEARCH_CONTEXT = "Search for Context";
    console.log(`[Step ${stepNumber}] START: ${STEP_SEARCH_CONTEXT}`);

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

    const citations = searchResult.citations || [];
    const step3Passed = citations.length > 0;

    console.log(`[Step ${stepNumber}] COMPLETE: ${STEP_SEARCH_CONTEXT}`);
    console.log(`[Step ${stepNumber}]   Citations found: ${citations.length}`);
    console.log(`[Step ${stepNumber}]   Passed: ${step3Passed ? 'YES' : 'NO'}\n`);

    steps.push({
      stepNumber,
      stepName: STEP_SEARCH_CONTEXT,
      completed: true,
      passed: step3Passed,
      data: { citationsCount: citations.length },
    });

    if (!step3Passed) {
      failedAtStep = STEP_SEARCH_CONTEXT;
      return {
        post,
        stepsExecuted: steps,
        failedAtStep,
        verifiableFactResult,
        keywords,
        searchContextResult: searchResult,
        noteResult: {
          status: "NO CITATIONS",
          note: "No citations found",
          url: "",
        },
        allScoresPassed: false,
        skipReason: `Failed at step ${stepNumber}: ${STEP_SEARCH_CONTEXT} - No citations found`,
      };
    }

    // STEP 4: WRITE NOTE
    stepNumber++;
    const STEP_GENERATE_NOTE = "Generate Community Note";
    console.log(`[Step ${stepNumber}] START: ${STEP_GENERATE_NOTE}`);

    const noteResult = await writeNote(
      {
        text: searchResult.text,
        searchResults: searchResult.searchResults,
        citations,
      },
      { model: "anthropic/claude-sonnet-4" }
    );

    console.log(`[Step ${stepNumber}] COMPLETE: ${STEP_GENERATE_NOTE}`);
    console.log(`[Step ${stepNumber}]   Status: ${noteResult.status}`);
    console.log(`[Step ${stepNumber}]   Note length: ${noteResult.note.length} characters\n`);

    steps.push({
      stepNumber,
      stepName: STEP_GENERATE_NOTE,
      completed: true,
      passed: true,
      data: { status: noteResult.status },
    });

    // STEP 5: CHECK CHARACTER LIMIT
    stepNumber++;
    const STEP_CHARACTER_LIMIT = "Check Character Limit";
    console.log(`[Step ${stepNumber}] START: ${STEP_CHARACTER_LIMIT}`);

    const charLimitResult = checkCharacterLimit(noteResult.note);
    const step5Passed = charLimitResult.valid;

    console.log(`[Step ${stepNumber}] COMPLETE: ${STEP_CHARACTER_LIMIT}`);
    console.log(`[Step ${stepNumber}]   Character count: ${charLimitResult.characterCount}/${charLimitResult.limit}`);
    console.log(`[Step ${stepNumber}]   Passed: ${step5Passed ? 'YES' : 'NO'}\n`);

    steps.push({
      stepNumber,
      stepName: STEP_CHARACTER_LIMIT,
      completed: true,
      passed: step5Passed,
      data: charLimitResult,
    });

    if (!step5Passed) {
      failedAtStep = STEP_CHARACTER_LIMIT;
      return {
        post,
        stepsExecuted: steps,
        failedAtStep,
        verifiableFactResult,
        keywords,
        searchContextResult: searchResult,
        noteResult,
        characterLimitResult: charLimitResult,
        allScoresPassed: false,
        skipReason: `Failed at step ${stepNumber}: ${STEP_CHARACTER_LIMIT} - ${charLimitResult.reasoning}`,
      };
    }

    // STEP 6: CHECK NOTE STATUS
    stepNumber++;
    const STEP_NOTE_STATUS = "Verify Note Status";
    console.log(`[Step ${stepNumber}] START: ${STEP_NOTE_STATUS}`);

    const step6Passed = noteResult.status === "CORRECTION WITH TRUSTWORTHY CITATION";

    console.log(`[Step ${stepNumber}] COMPLETE: ${STEP_NOTE_STATUS}`);
    console.log(`[Step ${stepNumber}]   Status: ${noteResult.status}`);
    console.log(`[Step ${stepNumber}]   Passed: ${step6Passed ? 'YES' : 'NO'}\n`);

    steps.push({
      stepNumber,
      stepName: STEP_NOTE_STATUS,
      completed: true,
      passed: step6Passed,
      reasoning: `Note status: ${noteResult.status}`,
    });

    if (!step6Passed) {
      failedAtStep = STEP_NOTE_STATUS;
      return {
        post,
        stepsExecuted: steps,
        failedAtStep,
        verifiableFactResult,
        keywords,
        searchContextResult: searchResult,
        noteResult,
        characterLimitResult: charLimitResult,
        allScoresPassed: false,
        skipReason: `Failed at step ${stepNumber}: ${STEP_NOTE_STATUS} - Status is "${noteResult.status}"`,
      };
    }

    // STEP 7: URL QUALITY CHECK
    stepNumber++;
    const STEP_URL_QUALITY = "Check URL Quality";
    console.log(`[Step ${stepNumber}] START: ${STEP_URL_QUALITY}`);

    const urlValidityResult = await checkUrlValidity(noteResult.note, noteResult.url || "");
    const step7Passed = urlValidityResult.score > 0.5;

    console.log(`[Step ${stepNumber}] COMPLETE: ${STEP_URL_QUALITY}`);
    console.log(`[Step ${stepNumber}]   Score: ${urlValidityResult.score.toFixed(2)}`);
    console.log(`[Step ${stepNumber}]   Passed: ${step7Passed ? 'YES' : 'NO'}`);
    console.log(`[Step ${stepNumber}]   Reasoning: ${urlValidityResult.reasoning}\n`);

    steps.push({
      stepNumber,
      stepName: STEP_URL_QUALITY,
      completed: true,
      passed: step7Passed,
      score: urlValidityResult.score,
      reasoning: urlValidityResult.reasoning,
    });

    // STEP 8: URL CONTENT CHECK
    stepNumber++;
    const STEP_URL_CONTENT = "Check URL Content";
    console.log(`[Step ${stepNumber}] START: ${STEP_URL_CONTENT}`);

    const urlSourceResult = await checkUrlAndSource(noteResult.note, noteResult.url || "");
    const step8Passed = urlSourceResult.score > 0.5;

    console.log(`[Step ${stepNumber}] COMPLETE: ${STEP_URL_CONTENT}`);
    console.log(`[Step ${stepNumber}]   Score: ${urlSourceResult.score.toFixed(2)}`);
    console.log(`[Step ${stepNumber}]   Passed: ${step8Passed ? 'YES' : 'NO'}`);
    console.log(`[Step ${stepNumber}]   Has URL: ${urlSourceResult.hasUrl ? 'YES' : 'NO'}\n`);

    steps.push({
      stepNumber,
      stepName: STEP_URL_CONTENT,
      completed: true,
      passed: step8Passed,
      score: urlSourceResult.score,
      reasoning: `Source content supports claims: ${urlSourceResult.score > 0.5 ? "Yes" : "No"}`,
    });

    // STEP 9: POSITIVE CLAIMS FILTER
    stepNumber++;
    const STEP_POSITIVE_CLAIMS = "Check for Positive Claims";
    console.log(`[Step ${stepNumber}] START: ${STEP_POSITIVE_CLAIMS}`);

    const filterScores = await runScoringFilters(
      noteResult.note,
      originalContent.text
    );
    const step9Passed = filterScores.positive.score > 0.5;

    console.log(`[Step ${stepNumber}] COMPLETE: ${STEP_POSITIVE_CLAIMS}`);
    console.log(`[Step ${stepNumber}]   Score: ${filterScores.positive.score.toFixed(2)}`);
    console.log(`[Step ${stepNumber}]   Passed: ${step9Passed ? 'YES' : 'NO'}`);
    console.log(`[Step ${stepNumber}]   Reasoning: ${filterScores.positive.reasoning}\n`);

    steps.push({
      stepNumber,
      stepName: STEP_POSITIVE_CLAIMS,
      completed: true,
      passed: step9Passed,
      score: filterScores.positive.score,
      reasoning: filterScores.positive.reasoning,
    });

    // STEP 10: DISAGREEMENT FILTER
    stepNumber++;
    const STEP_DISAGREEMENT = "Check Substantive Disagreement";
    console.log(`[Step ${stepNumber}] START: ${STEP_DISAGREEMENT}`);

    const step10Passed = filterScores.disagreement.score > 0.5;

    console.log(`[Step ${stepNumber}] COMPLETE: ${STEP_DISAGREEMENT}`);
    console.log(`[Step ${stepNumber}]   Score: ${filterScores.disagreement.score.toFixed(2)}`);
    console.log(`[Step ${stepNumber}]   Passed: ${step10Passed ? 'YES' : 'NO'}`);
    console.log(`[Step ${stepNumber}]   Reasoning: ${filterScores.disagreement.reasoning}\n`);

    steps.push({
      stepNumber,
      stepName: STEP_DISAGREEMENT,
      completed: true,
      passed: step10Passed,
      score: filterScores.disagreement.score,
      reasoning: filterScores.disagreement.reasoning,
    });

    const scores = {
      urlValidity: urlValidityResult.score,
      urlSource: urlSourceResult.score,
      positive: filterScores.positive.score,
      disagreement: filterScores.disagreement.score,
    };

    const filterDetails = {
      urlValidity: {
        score: urlValidityResult.score,
        reasoning: urlValidityResult.reasoning,
      },
      urlSource: {
        score: urlSourceResult.score,
        reasoning: `Source content supports claims: ${urlSourceResult.score > 0.5 ? "Yes" : "No"}`,
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

    // Check if initial filters passed
    const initialPassed = step7Passed && step8Passed && step9Passed && step10Passed;

    if (!initialPassed) {
      if (!step7Passed) failedAtStep = STEP_URL_QUALITY;
      else if (!step8Passed) failedAtStep = STEP_URL_CONTENT;
      else if (!step9Passed) failedAtStep = STEP_POSITIVE_CLAIMS;
      else if (!step10Passed) failedAtStep = STEP_DISAGREEMENT;
    }

    // Only run helpfulness and X API if initial filters pass
    let helpfulnessScore: number | undefined;
    let helpfulnessReasoning: string | undefined;
    let xApiScore: number | undefined;
    let xApiSuccess: boolean | undefined;
    let allPassed = initialPassed;

    if (initialPassed) {
      // STEP 11: PREDICT HELPFULNESS
      stepNumber++;
      const STEP_HELPFULNESS = "Predict Helpfulness";
      console.log(`[Step ${stepNumber}] START: ${STEP_HELPFULNESS}`);

      const helpfulnessResult = await predictHelpfulness(
        noteResult.note,
        originalContent.text,
        searchResult.searchResults,
        noteResult.url || ""
      );
      helpfulnessScore = helpfulnessResult.score;
      helpfulnessReasoning = helpfulnessResult.reasoning;

      console.log(`[Step ${stepNumber}] COMPLETE: ${STEP_HELPFULNESS}`);
      console.log(`[Step ${stepNumber}]   Score: ${helpfulnessScore.toFixed(2)}`);
      console.log(`[Step ${stepNumber}]   Passed: N/A (informational only)`);
      console.log(`[Step ${stepNumber}]   Reasoning: ${helpfulnessReasoning}\n`);

      steps.push({
        stepNumber,
        stepName: STEP_HELPFULNESS,
        completed: true,
        passed: true, // Always pass - informational only
        score: helpfulnessScore,
        reasoning: helpfulnessReasoning,
      });

      // STEP 12: EVALUATE WITH X API
      stepNumber++;
      const STEP_X_API = "X API Evaluation";
      console.log(`[Step ${stepNumber}] START: ${STEP_X_API}`);

      const xApiResult = await evaluateNoteWithXAPI(noteResult.note, post.id);
      xApiScore = xApiResult.claimOpinionScore;
      xApiSuccess = xApiResult.success;
      const step11Passed = xApiSuccess && xApiScore >= -0.5;

      console.log(`[Step ${stepNumber}] COMPLETE: ${STEP_X_API}`);
      if (xApiSuccess) {
        console.log(`[Step ${stepNumber}]   Score: ${xApiScore}`);
        console.log(`[Step ${stepNumber}]   Passed: ${step11Passed ? 'YES' : 'NO'}\n`);
      } else {
        console.log(`[Step ${stepNumber}]   Failed: ${xApiResult.error}\n`);
      }

      steps.push({
        stepNumber,
        stepName: STEP_X_API,
        completed: true,
        passed: step11Passed,
        score: xApiScore,
        reasoning: xApiSuccess ? undefined : `API call failed: ${xApiResult.error}`,
      });

      if (!step11Passed) {
        allPassed = false;
        if (!failedAtStep) failedAtStep = STEP_X_API;
      }
    }

    console.log(`\n========================================`);
    console.log(`[pipeline] FINAL RESULT: ${allPassed ? 'PASS - Will be posted' : 'FAIL - Will not be posted'}`);
    console.log(`========================================\n`);

    return {
      post,
      stepsExecuted: steps,
      failedAtStep,
      verifiableFactResult,
      keywords,
      searchContextResult: searchResult,
      noteResult,
      characterLimitResult: charLimitResult,
      scores,
      filterDetails,
      helpfulnessScore,
      helpfulnessReasoning,
      xApiScore,
      xApiSuccess,
      allScoresPassed: allPassed,
      skipReason: failedAtStep ? `Failed at: ${failedAtStep}` : undefined,
    };
  } catch (err) {
    console.error(`\n[pipeline] ERROR for post #${idx + 1}:`, err);
    console.error(`========================================\n`);
    return null;
  }
}