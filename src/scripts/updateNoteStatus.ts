import axios from "axios";
import { getOAuth1Headers } from "../api/getOAuthToken";
import Airtable from "airtable";
import { NoteStatusEntry } from "./backfillNoteStatus";

interface ExistingNote {
  id: string;
  recordId: string;
  status: string;
}

class NoteStatusUpdater {
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

  async addNewNote(note: any): Promise<void> {
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
        `[NoteStatusUpdater] Added new note ${note.id} with status: ${note.status}`
      );
    } catch (error) {
      console.error(`[NoteStatusUpdater] Error adding note ${note.id}:`, error);
    }
  }

  async updateExistingNote(
    note: any,
    existingNote: ExistingNote
  ): Promise<void> {
    const newStatus = note.status || "unknown";

    // Only update if status has changed
    if (newStatus === existingNote.status) {
      return; // No change needed
    }

    try {
      const currentTimestamp = new Date().toISOString().split("T")[0]; // Just YYYY-MM-DD

      const updateFields = {
        Status: newStatus,
        "Last Updated": currentTimestamp,
        // Update other fields that might have changed
        Classification: note.info?.classification || "",
        "Trustworthy Sources": note.info?.trustworthy_sources || false,
        "Misleading Tags": note.info?.misleading_tags || [],
      };

      await this.base(this.tableName).update(
        existingNote.recordId,
        updateFields
      );
      console.log(
        `[NoteStatusUpdater] Updated note ${note.id}: ${existingNote.status} → ${newStatus}`
      );
    } catch (error) {
      console.error(
        `[NoteStatusUpdater] Error updating note ${note.id}:`,
        error
      );
    }
  }

  async getExistingNotes(): Promise<Map<string, ExistingNote>> {
    const existingNotes = new Map<string, ExistingNote>();

    try {
      await this.base(this.tableName)
        .select({
          fields: ["Note ID", "Status"],
          pageSize: 100,
        })
        .eachPage((records, fetchNextPage) => {
          records.forEach((record) => {
            const noteId = record.get("Note ID") as string;
            const status = record.get("Status") as string;

            if (noteId) {
              existingNotes.set(noteId, {
                id: noteId,
                recordId: record.id,
                status: status || "unknown",
              });
            }
          });
          fetchNextPage();
        });

      console.log(
        `[NoteStatusUpdater] Found ${existingNotes.size} existing notes in Airtable`
      );
      return existingNotes;
    } catch (error) {
      console.error(
        "[NoteStatusUpdater] Error fetching existing notes:",
        error
      );
      return new Map();
    }
  }
}

async function fetchRecentNotes(maxPages: number = 3): Promise<any[]> {
  console.log(
    `[updateNoteStatus] Fetching recent community notes (${maxPages} pages)...`
  );

  const allNotes: any[] = [];
  let nextToken: string | undefined;
  let pageCount = 0;

  try {
    while (pageCount < maxPages) {
      pageCount++;
      console.log(`[updateNoteStatus] Fetching page ${pageCount}...`);

      const url = "https://api.x.com/2/notes/search/notes_written";
      const params = new URLSearchParams({
        max_results: "100",
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
          `[updateNoteStatus] Page ${pageCount}: Found ${data.data.length} notes (total: ${allNotes.length})`
        );
      } else {
        console.log(`[updateNoteStatus] Page ${pageCount}: No notes found`);
        break;
      }

      nextToken = data.meta?.next_token;

      if (!nextToken) {
        console.log(`[updateNoteStatus] No more pages available`);
        break;
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(
      `[updateNoteStatus] Fetch complete! Found ${allNotes.length} total notes across ${pageCount} pages`
    );
    return allNotes;
  } catch (error: any) {
    console.error(
      "[updateNoteStatus] Error fetching notes:",
      error.response?.data || error.message
    );
    return allNotes;
  }
}

async function updateNoteStatus() {
  try {
    const noteStatusUpdater = new NoteStatusUpdater();

    // Get existing notes from Airtable
    const existingNotes = await noteStatusUpdater.getExistingNotes();

    // Fetch recent notes from X API (just the first few pages for updates)
    const recentNotes = await fetchRecentNotes(3);

    if (recentNotes.length === 0) {
      console.log("[updateNoteStatus] No notes to process");
      return;
    }

    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    for (const note of recentNotes) {
      const existingNote = existingNotes.get(note.id);

      if (existingNote) {
        const oldStatus = existingNote.status;
        const newStatus = note.status || "unknown";

        if (oldStatus !== newStatus) {
          await noteStatusUpdater.updateExistingNote(note, existingNote);
          updatedCount++;
        } else {
          unchangedCount++;
        }
      } else {
        // New note
        await noteStatusUpdater.addNewNote(note);
        newCount++;
      }

      // Small delay to avoid overwhelming Airtable
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log("\n" + "=".repeat(80));
    console.log("UPDATE SUMMARY");
    console.log("=".repeat(80));
    console.log(`Notes checked: ${recentNotes.length}`);
    console.log(`New notes added: ${newCount}`);
    console.log(`Status updates: ${updatedCount}`);
    console.log(`Unchanged: ${unchangedCount}`);
    console.log("=".repeat(80));
  } catch (error) {
    console.error("[updateNoteStatus] Fatal error:", error);
  }
}

updateNoteStatus();
