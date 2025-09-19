// Test the refactored pipeline with a sample tweet
import { checkSarcasm } from "../pipeline/sarcasmFilter";
import { extractKeywords } from "../pipeline/extractKeywords";
import { checkUrlValidity } from "../pipeline/urlChecker";
import { checkPositiveClaims, checkSubstantiveDisagreement } from "../pipeline/scoringFilters";

async function testRefactoredPipeline() {
  console.log("Testing refactored pipeline components...\n");

  // Test tweet
  const testTweet = "The unemployment rate has reached 20% this month according to new government data.";
  const testNote = "According to the Bureau of Labor Statistics, the unemployment rate for December 2024 was 3.7%, not 20%. https://www.bls.gov/news.release/empsit.nr0.htm";
  
  console.log("Test Tweet:", testTweet);
  console.log("Test Note:", testNote);
  console.log("\n" + "=".repeat(80) + "\n");

  try {
    // 1. Test sarcasm filter
    console.log("1. SARCASM FILTER:");
    const sarcasmResult = await checkSarcasm(testTweet);
    console.log(`   Score: ${sarcasmResult.score.toFixed(2)}`);
    console.log(`   Passed: ${sarcasmResult.score > 0.5}`);
    console.log(`   Reasoning: ${sarcasmResult.reasoning}`);
    console.log();

    // 2. Test keyword extraction  
    console.log("2. KEYWORD EXTRACTION:");
    const keywords = await extractKeywords(testTweet);
    console.log(`   Keywords: ${keywords.keywords.join(", ")}`);
    console.log(`   Claims: ${keywords.claims.join(", ")}`);
    console.log(`   Entities: ${keywords.entities.join(", ")}`);
    console.log();

    // 3. Test URL checker
    console.log("3. URL VALIDITY CHECK:");
    const urlResult = await checkUrlValidity(testNote, "https://www.bls.gov/news.release/empsit.nr0.htm");
    console.log(`   Score: ${urlResult.score.toFixed(2)}`);
    console.log(`   Passed: ${urlResult.score > 0.5}`);
    console.log(`   Reasoning: ${urlResult.reasoning}`);
    console.log();

    // 4. Test positive claims filter
    console.log("4. POSITIVE CLAIMS FILTER:");
    const positiveResult = await checkPositiveClaims(testNote);
    console.log(`   Score: ${positiveResult.score.toFixed(2)}`);
    console.log(`   Passed: ${positiveResult.passed}`);
    console.log(`   Reasoning: ${positiveResult.reasoning}`);
    console.log();

    // 5. Test disagreement filter
    console.log("5. SUBSTANTIVE DISAGREEMENT FILTER:");
    const disagreementResult = await checkSubstantiveDisagreement(testNote, testTweet);
    console.log(`   Score: ${disagreementResult.score.toFixed(2)}`);
    console.log(`   Passed: ${disagreementResult.passed}`);
    console.log(`   Reasoning: ${disagreementResult.reasoning}`);
    console.log();

    // Summary
    console.log("=".repeat(80));
    console.log("SUMMARY:");
    const allPassed = 
      sarcasmResult.score > 0.5 &&
      urlResult.score > 0.5 &&
      positiveResult.score > 0.5 &&
      disagreementResult.score > 0.5;
    
    console.log(`All filters passed: ${allPassed}`);
    console.log("\nScores:");
    console.log(`  Sarcasm: ${sarcasmResult.score.toFixed(2)}`);
    console.log(`  URL: ${urlResult.score.toFixed(2)}`);
    console.log(`  Positive: ${positiveResult.score.toFixed(2)}`);
    console.log(`  Disagreement: ${disagreementResult.score.toFixed(2)}`);

  } catch (error) {
    console.error("Error during testing:", error);
  }
}

testRefactoredPipeline();