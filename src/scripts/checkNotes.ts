import { config } from "dotenv";
import {
  fetchAllSubmittedNotes,
  displayNotesSummary,
} from "../api/fetchSubmittedNotes";

// Load environment variables
config();

async function main() {
  console.log("🔍 Fetching your submitted Community Notes...\n");

  try {
    // Fetch test notes (change to false for production notes when available)
    const testNotes = await fetchAllSubmittedNotes(true);

    if (testNotes.length === 0) {
      console.log("No test notes found. Checking production notes...");
      const prodNotes = await fetchAllSubmittedNotes(false);

      if (prodNotes.length === 0) {
        console.log("No notes found in either test or production mode.");
      } else {
        console.log("Production Notes:");
        displayNotesSummary(prodNotes);

        // Show detailed info for the most recent notes
        console.log("\n📝 Most recent notes (up to 5):");
        prodNotes.slice(0, 5).forEach((note) => {
          console.log("\n" + "=".repeat(50));
          console.log(JSON.stringify(note, null, 2));
        });
      }
    } else {
      console.log("Test Notes:");
      displayNotesSummary(testNotes);

      // Show detailed info for the most recent notes
      console.log("\n📝 Most recent notes (up to 5):");
      testNotes.slice(0, 5).forEach((note) => {
        console.log("\n" + "=".repeat(50));
        console.log(JSON.stringify(note, null, 2));
      });
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the script
main().catch(console.error);
