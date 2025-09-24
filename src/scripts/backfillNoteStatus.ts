import axios from "axios";
import { getOAuth1Headers } from "../api/getOAuthToken";
import Airtable from "airtable";
import type { FieldSet } from "airtable";

export interface NoteStatusEntry extends FieldSet {
  "Tweet URL": string;
  "Note ID": string;
  Status: string;
  Classification: string;
  "Trustworthy Sources": boolean;
  "Misleading Tags": string[];
  "Note Text": string;
  "Note URL": string;
  "Last Updated": string;
}

class NoteStatusLogger {
  private base: Airtable.Base;
  private tableName = "Note Status";

  constructor() {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;

    if (!apiKey || !baseId) {
      throw new Error(
        "Missing required environment variables: AIRTABLE_API_KEY, AIRTABLE_BASE_ID"
      );
    }

    this.base = new Airtable({ apiKey }).base(baseId);
  }

  private constructTweetUrl(postId: string): string {
    return `https://twitter.com/i/status/${postId}`;
  }

  private constructNoteUrl(noteId: string): string {
    return `https://twitter.com/i/birdwatch/n/${noteId}`;
  }

  async addNoteStatus(note: any): Promise<void> {
    try {
      const tweetUrl = this.constructTweetUrl(note.info.post_id);
      const noteUrl = this.constructNoteUrl(note.id);
      const currentTimestamp = new Date().toISOString().split("T")[0]; // Just YYYY-MM-DD

      const fields: NoteStatusEntry = {
        "Tweet URL": tweetUrl,
        "Note ID": note.id,
        Status: note.status || "unknown",
        Classification: note.info?.classification || "",
        "Trustworthy Sources": note.info?.trustworthy_sources || false,
        "Misleading Tags": note.info?.misleading_tags || [],
        "Note Text": note.info?.text || "",
        "Note URL": noteUrl,
        "Last Updated": currentTimestamp || "",
      };

      this.base(this.tableName).create(fields);
      console.log(
        `[NoteStatusLogger] Added note ${note.id} with status: ${note.status}`
      );
    } catch (error) {
      console.error(`[NoteStatusLogger] Error adding note ${note.id}:`, error);
    }
  }

  async getExistingNoteIds(): Promise<Set<string>> {
    const noteIds = new Set<string>();

    try {
      await this.base(this.tableName)
        .select({
          fields: ["Note ID"],
          pageSize: 100,
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach((record) => {
            const noteId = record.get("Note ID");
            if (noteId) noteIds.add(noteId.toString());
          });
          fetchNextPage();
        });

      console.log(
        `[NoteStatusLogger] Found ${noteIds.size} existing notes in Airtable`
      );
      return noteIds;
    } catch (error) {
      console.error(
        "[NoteStatusLogger] Error fetching existing note IDs:",
        error
      );
      return new Set();
    }
  }
}

async function fetchAllNotes(): Promise<any[]> {
  console.log(
    "[backfillNoteStatus] Starting backfill of all community notes..."
  );

  const allNotes: any[] = [];
  let nextToken: string | undefined;
  let pageCount = 0;

  try {
    do {
      pageCount++;
      console.log(`[backfillNoteStatus] Fetching page ${pageCount}...`);

      const url = "https://api.x.com/2/notes/search/notes_written";
      const params = new URLSearchParams({
        max_results: "100", // Maximum allowed
        test_mode: "false",
        "note.fields": "id,info,status,test_result",
      });

      if (nextToken) {
        params.append("pagination_token", nextToken);
      }

      const fullUrl = `${url}?${params.toString()}`;

      const response = await axios.get(fullUrl, {
        headers: {
          ...getOAuth1Headers(fullUrl, "GET"),
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });

      const data = response.data;

      if (data.data && data.data.length > 0) {
        allNotes.push(...data.data);
        console.log(
          `[backfillNoteStatus] Page ${pageCount}: Found ${data.data.length} notes (total: ${allNotes.length})`
        );
      } else {
        console.log(`[backfillNoteStatus] Page ${pageCount}: No notes found`);
      }

      nextToken = data.meta?.next_token;

      // Add a small delay to avoid rate limiting
      if (nextToken) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } while (nextToken);

    console.log(
      `[backfillNoteStatus] Backfill complete! Found ${allNotes.length} total notes across ${pageCount} pages`
    );
    return allNotes;
  } catch (error: any) {
    console.error(
      "[backfillNoteStatus] Error fetching notes:",
      error.response?.data || error.message
    );

    if (error.response?.status === 429) {
      console.log(
        "[backfillNoteStatus] Rate limited. You may need to retry later."
      );
    }

    return allNotes; // Return what we have so far
  }
}

async function backfillNoteStatus() {
  try {
    const noteStatusLogger = new NoteStatusLogger();

    // Get existing notes to avoid duplicates
    const existingNoteIds = await noteStatusLogger.getExistingNoteIds();

    // Fetch all notes from X API
    const allNotes = await fetchAllNotes();

    if (allNotes.length === 0) {
      console.log("[backfillNoteStatus] No notes to process");
      return;
    }

    // Filter out notes we already have
    const newNotes = allNotes.filter((note) => !existingNoteIds.has(note.id));

    console.log(
      `[backfillNoteStatus] Processing ${newNotes.length} new notes (${existingNoteIds.size} already exist)`
    );

    // Add notes to Airtable
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < newNotes.length; i++) {
      const note = newNotes[i];

      try {
        await noteStatusLogger.addNoteStatus(note);
        successCount++;

        // Progress indicator
        if ((i + 1) % 10 === 0) {
          console.log(
            `[backfillNoteStatus] Progress: ${i + 1}/${
              newNotes.length
            } notes processed`
          );
        }

        // Small delay to avoid overwhelming Airtable
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(
          `[backfillNoteStatus] Failed to add note ${note.id}:`,
          error
        );
        errorCount++;
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("BACKFILL SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total notes found: ${allNotes.length}`);
    console.log(`Already existed: ${existingNoteIds.size}`);
    console.log(`New notes processed: ${newNotes.length}`);
    console.log(`Successfully added: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log("=".repeat(80));
  } catch (error) {
    console.error("[backfillNoteStatus] Fatal error:", error);
  }
}

backfillNoteStatus();
