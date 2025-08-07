import Airtable from "airtable";

interface AirtableLogEntry {
  URL: string;
  "Bot name": string;
  "Initial tweet body": string;
  "Full Result": string;
  "Final note": string;
  "Would be posted": number;
  commit?: string;
}

export class AirtableLogger {
  private base: Airtable.Base;
  private tableName: string;

  constructor() {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME;

    if (!apiKey || !baseId || !tableName) {
      throw new Error(
        "Missing required environment variables: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME"
      );
    }

    this.base = new Airtable({ apiKey }).base(baseId);
    this.tableName = tableName;
  }

  async getExistingUrls(): Promise<Set<string>> {
    const urls = new Set<string>();

    try {
      await this.base(this.tableName)
        .select({
          fields: ["URL"],
          pageSize: 100,
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach((record) => {
            const url = record.get("URL");
            if (url) urls.add(url.toString());
          });
          fetchNextPage();
        });

      console.log(
        `[AirtableLogger] Found ${urls.size} existing URLs in Airtable`
      );
      return urls;
    } catch (error) {
      console.error("[AirtableLogger] Error fetching existing URLs:", error);
      // Return empty set on error to allow processing to continue
      return new Set();
    }
  }

  async logEntry(entry: AirtableLogEntry): Promise<void> {
    try {
      const fields: any = {
        URL: entry.URL,
        "Bot name": entry["Bot name"],
        "Initial tweet body": entry["Initial tweet body"],
        "Full Result": entry["Full Result"],
        "Final note": entry["Final note"],
        "Would be posted": entry["Would be posted"],
      };
      
      if (entry.commit) {
        fields.commit = entry.commit;
      }

      await this.base(this.tableName).create([
        {
          fields,
        },
      ]);
      console.log(
        `[AirtableLogger] Successfully logged entry for URL: ${entry.URL}`
      );
    } catch (error) {
      console.error("[AirtableLogger] Error logging to Airtable:", error);
      throw error;
    }
  }

  async logMultipleEntries(entries: AirtableLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    try {
      const records = entries.map((entry) => {
        const fields: any = {
          URL: entry.URL,
          "Bot name": entry["Bot name"],
          "Initial tweet body": entry["Initial tweet body"],
          "Full Result": entry["Full Result"],
          "Final note": entry["Final note"],
          "Would be posted": entry["Would be posted"],
        };
        
        if (entry.commit) {
          fields.commit = entry.commit;
        }
        
        return { fields };
      });

      await this.base(this.tableName).create(records);
      console.log(
        `[AirtableLogger] Successfully logged ${entries.length} entries to Airtable`
      );
    } catch (error) {
      console.error(
        "[AirtableLogger] Error logging multiple entries to Airtable:",
        error
      );
      throw error;
    }
  }
}

// Helper function to create a human-readable result string
function formatFullResult(
  post: any,
  searchContextResult: any,
  noteResult: any,
  checkResult: any
): string {
  const checkYes = checkResult && checkResult.trim().toUpperCase() === "YES";

  let result = `=== COMMUNITY NOTES PROCESSING RESULTS ===\n\n`;

  // Tweet information
  result += `TWEET ID: ${post.id}\n`;
  result += `TWEET TEXT:\n${post.text}\n\n`;

  // Search context results
  result += `SEARCH CONTEXT:\n`;
  result += `- Enhanced text: ${searchContextResult.text || "N/A"}\n`;
  result += `- Search results: ${searchContextResult.searchResults || "N/A"}\n`;
  result += `- Citations: ${
    searchContextResult.citations && searchContextResult.citations.length > 0
      ? searchContextResult.citations.join(", ")
      : "None"
  }\n\n`;

  // Note results
  result += `COMMUNITY NOTE:\n`;
  result += `- Status: ${noteResult.status || "N/A"}\n`;
  result += `- Note text: ${noteResult.note || "N/A"}\n`;
  result += `- Source URL: ${noteResult.url || "None"}\n\n`;

  // Check results
  result += `SOURCE VERIFICATION:\n`;
  result += `- Check result: ${checkResult || "NO CHECK"}\n`;
  result += `- Would be posted: ${checkYes ? "YES" : "NO"}\n\n`;

  // Summary
  result += `SUMMARY:\n`;
  result += `- Final status: ${noteResult.status}\n`;
  result += `- Source verified: ${checkYes ? "YES" : "NO"}\n`;
  result += `- Ready for submission: ${
    noteResult.status === "CORRECTION WITH TRUSTWORTHY CITATION" && checkYes
      ? "YES"
      : "NO"
  }\n`;

  return result;
}

// Helper function to create a log entry from pipeline results
export function createLogEntry(
  post: any,
  searchContextResult: any,
  noteResult: any,
  checkResult: any,
  botName: string = "first-bot",
  commit?: string
): AirtableLogEntry {
  // Create the tweet URL
  const tweetUrl = `https://twitter.com/i/status/${post.id}`;

  // Stringify the full tweet data
  const tweetBody = JSON.stringify(post, null, 2);

  // Create human-readable full result string
  const fullResult = formatFullResult(
    post,
    searchContextResult,
    noteResult,
    checkResult
  );

  // Get the final note text (matching what gets submitted to Twitter)
  const finalNote =
    noteResult.note && noteResult.url
      ? noteResult.note + " " + noteResult.url
      : noteResult.note || "";

  // Determine if it would be posted (1 if status is "CORRECTION WITH TRUSTWORTHY CITATION" AND check result is "YES", 0 otherwise)
  const checkYes = checkResult && checkResult.trim().toUpperCase() === "YES";
  const wouldBePosted =
    noteResult.status === "CORRECTION WITH TRUSTWORTHY CITATION" && checkYes
      ? 1
      : 0;

  const logEntry: AirtableLogEntry = {
    URL: tweetUrl,
    "Bot name": botName,
    "Initial tweet body": tweetBody,
    "Full Result": fullResult,
    "Final note": finalNote,
    "Would be posted": wouldBePosted,
  };

  if (commit) {
    logEntry.commit = commit;
  }

  return logEntry;
}
