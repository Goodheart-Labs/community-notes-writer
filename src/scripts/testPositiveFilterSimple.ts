#!/usr/bin/env bun

import { checkPositiveClaims } from "../pipeline/scoringFilters";
import fs from "fs";

// Color codes for terminal output
const GREEN_CHECK = '\x1b[32m✓\x1b[0m';
const RED_X = '\x1b[31m✗\x1b[0m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

interface Note {
  id: string;
  url: string;
  finalNote: string;
  positiveClaimsFilter?: number;
}

async function testPositiveFilterSimple() {
  // Load the two files - the smaller one is the "should be positive" set
  const positiveSetFile = "community_notes_2025-09-24.json";
  const fullSetFile = "community_notes_2025-09-24 (1).json";

  console.log("Loading test data...\n");

  const positiveSet: Note[] = JSON.parse(fs.readFileSync(positiveSetFile, 'utf-8'));
  const fullSet: Note[] = JSON.parse(fs.readFileSync(fullSetFile, 'utf-8'));

  // Create a set of IDs that should be positive
  const shouldBePositive = new Set(positiveSet.map(n => n.id));

  console.log(`${shouldBePositive.size} notes marked as should be positive`);
  console.log(`${fullSet.length} total notes to test\n`);
  console.log("=" + "=".repeat(70));
  console.log("Running positive claims filter on all notes...\n");

  let correct = 0;
  let incorrect = 0;
  let errors = 0;

  for (const note of fullSet) {
    if (!note.finalNote) {
      continue;
    }

    const shortNote = note.finalNote.substring(0, 60).replace(/\n/g, ' ') + "...";
    const isPositiveExpected = shouldBePositive.has(note.id);

    try {
      const result = await checkPositiveClaims(note.finalNote);
      const passed = result.score >= 0.5;
      const isCorrect = passed === isPositiveExpected;

      if (isCorrect) {
        correct++;
      } else {
        incorrect++;
      }

      // Show result with visual indicator
      const icon = isCorrect ? GREEN_CHECK : RED_X;
      const expectedText = isPositiveExpected ? "POSITIVE" : "NEGATIVE";
      const actualText = passed ? "POSITIVE" : "NEGATIVE";

      console.log(`${icon} Want: ${expectedText}, Got: ${actualText}, Score: ${result.score.toFixed(2)}`);
      console.log(`  ${shortNote}`);

      // Show reasoning for incorrect predictions
      if (!isCorrect) {
        console.log(`  ${YELLOW}Reasoning: ${result.reasoning.substring(0, 100)}...${RESET}`);
      }
      console.log();

    } catch (error) {
      errors++;
      console.log(`${RED_X} ERROR processing note: ${error}`);
      console.log(`  ${shortNote}\n`);
    }
  }

  // Summary
  console.log("=" + "=".repeat(70));
  console.log("SUMMARY\n");

  const total = correct + incorrect;
  const accuracy = (correct / total * 100).toFixed(1);

  console.log(`${GREEN_CHECK} Correct: ${correct}`);
  console.log(`${RED_X} Incorrect: ${incorrect}`);
  console.log(`Errors: ${errors}`);
  console.log(`\nAccuracy: ${accuracy}%`);

  // Show breakdown of errors
  if (incorrect > 0) {
    console.log("\nError Breakdown:");

    let falsePositives = 0;
    let falseNegatives = 0;

    for (const note of fullSet) {
      if (!note.finalNote) continue;

      const isPositiveExpected = shouldBePositive.has(note.id);

      try {
        const result = await checkPositiveClaims(note.finalNote);
        const passed = result.score >= 0.5;

        if (passed && !isPositiveExpected) falsePositives++;
        if (!passed && isPositiveExpected) falseNegatives++;
      } catch (e) {
        // Skip errors
      }
    }

    console.log(`  False Positives (shouldn't pass but did): ${falsePositives}`);
    console.log(`  False Negatives (should pass but didn't): ${falseNegatives}`);
  }
}

// Run the test
testPositiveFilterSimple().catch(console.error);