import { AirtableLogger, createLogEntry } from "./lib/airtableLogger";

async function testAirtableLogger() {
  try {
    console.log("Testing Airtable Logger...");

    // Create a sample log entry
    const samplePost = {
      id: "1234567890",
      text: "This is a sample tweet for testing",
      media: [],
    };

    const sampleSearchContext = {
      text: "Sample search context with enhanced information",
      searchResults: "Sample search results from various sources",
      citations: ["https://example.com", "https://sample.org"],
    };

    const sampleNoteResult = {
      status: "CORRECTION WITH TRUSTWORTHY CITATION",
      note: "This is a sample community note that provides important context",
      url: "https://example.com/source",
    };

    const sampleCheckResult = "YES";

    const logEntry = createLogEntry(
      samplePost,
      sampleSearchContext,
      sampleNoteResult,
      sampleCheckResult,
      "test-bot"
    );

    console.log("Created log entry:");
    console.log("URL:", logEntry.URL);
    console.log("Bot name:", logEntry["Bot name"]);
    console.log("Would be posted:", logEntry["Would be posted"]);
    console.log("Final note:", logEntry["Final note"]);
    console.log("\nFull Result (human-readable):");
    console.log(logEntry["Full Result"]);

    // Try to log to Airtable (this will fail if env vars aren't set, which is expected)
    const logger = new AirtableLogger();
    await logger.logEntry(logEntry);

    console.log("✅ Airtable logger test completed successfully!");
  } catch (error) {
    console.error("❌ Airtable logger test failed:", error);
    console.log("This is expected if environment variables aren't set yet.");
  }
}

testAirtableLogger();
