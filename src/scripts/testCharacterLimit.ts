#!/usr/bin/env bun

import { checkCharacterLimit } from "../pipeline/characterLimitChecker";

console.log("Testing Community Note character limit checker...\n");
console.log("Twitter limit: 280 characters (URLs count as 23 chars each)\n");
console.log("=" + "=".repeat(79));

// Test cases
const testCases = [
  {
    name: "Short note without URL",
    note: "This claim is inaccurate. The actual unemployment rate is 3.7% according to the Bureau of Labor Statistics.",
  },
  {
    name: "Note with one URL",
    note: "The unemployment rate is 3.7% according to BLS: https://www.bls.gov/news.release/empsit.nr0.htm",
  },
  {
    name: "Note with multiple URLs",
    note: "This is false. See: https://www.bls.gov/data/ and https://fred.stlouisfed.org/series/UNRATE for accurate data.",
  },
  {
    name: "Long note without URL (should fail)",
    note: "This statement contains multiple inaccuracies that need correction. First, the unemployment rate mentioned is completely wrong - the actual rate is significantly lower than claimed. Second, the methodology used to calculate these figures is not what the poster suggests. The Bureau of Labor Statistics uses standardized international definitions that have been consistent for decades. Third, the seasonal adjustments mentioned are actually important.",
  },
  {
    name: "Note exactly at 280 chars with URL",
    note: "This claim about unemployment is incorrect. The actual rate is 3.7% not 15% as stated. The Bureau of Labor Statistics reports monthly employment data using standardized methodologies that have remained consistent. See the official data here for accurate information: https://www.bls.gov/",
  },
  {
    name: "Long note with URL (over limit)",
    note: "This post contains several factual errors that require correction. The unemployment rate is not 15% as claimed, but rather 3.7% according to the most recent Bureau of Labor Statistics report. Additionally, the methodology for calculating unemployment has not changed recently as suggested. The BLS uses the same internationally standardized definitions. For accurate data see: https://www.bls.gov/news.release/empsit.nr0.htm",
  }
];

// Run tests
testCases.forEach((testCase, idx) => {
  console.log(`\nTest ${idx + 1}: ${testCase.name}`);
  console.log("-".repeat(60));
  
  const result = checkCharacterLimit(testCase.note);
  
  // Show the note (truncated for display)
  const displayNote = testCase.note.length > 100 
    ? testCase.note.substring(0, 97) + "..." 
    : testCase.note;
  console.log(`Note: "${displayNote}"`);
  
  // Show results
  console.log(`Result: ${result.valid ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Characters: ${result.characterCount}/${result.limit}`);
  console.log(`Reasoning: ${result.reasoning}`);
  
  // Count URLs for additional info
  const urlCount = (testCase.note.match(/https?:\/\/[^\s]+/g) || []).length;
  if (urlCount > 0) {
    console.log(`URLs found: ${urlCount} (each counts as 23 chars)`);
  }
});

console.log("\n" + "=".repeat(80));
console.log("Character limit testing complete!");
console.log("\nSummary:");
console.log("- Twitter limit: 280 characters");
console.log("- URLs count as 23 characters each (t.co shortening)");
console.log("- Notes must stay within this limit to be postable");