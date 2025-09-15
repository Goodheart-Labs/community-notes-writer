import axios from "axios";
import { getOAuth1Headers } from "../api/getOAuthToken";

async function fetchOurCommunityNotes() {
  console.log("[fetchOurNotes] Fetching our community notes from X API...");

  try {
    const url = "https://api.x.com/2/notes/search/notes_written";
    const params = new URLSearchParams({
      max_results: "10", // Start with 10 to see what we get
      test_mode: "false", // Get production notes, not test notes
      "note.fields": "id,info,status,test_result"
    });

    const fullUrl = `${url}?${params.toString()}`;
    console.log(`[fetchOurNotes] Requesting: ${fullUrl}`);

    const response = await axios.get(fullUrl, {
      headers: {
        ...getOAuth1Headers(fullUrl, "GET"),
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    const data = response.data;
    console.log(`[fetchOurNotes] Raw API response:`, JSON.stringify(data, null, 4));

    if (!data.data || data.data.length === 0) {
      console.log("[fetchOurNotes] No notes found");
      return;
    }

    console.log(`\n[fetchOurNotes] Found ${data.data.length} notes:`);
    console.log("=".repeat(80));

    data.data.forEach((note: any, index: number) => {
      console.log(`\nNote #${index + 1}:`);
      console.log(`  ID: ${note.id}`);
      console.log(`  Status: ${note.status || 'N/A'}`);

      if (note.info) {
        console.log(`  Info:`, JSON.stringify(note.info, null, 4));
      }

      if (note.test_result) {
        console.log(`  Test Result:`, JSON.stringify(note.test_result, null, 4));
      }

      console.log("  " + "-".repeat(60));
    });

    // Check for pagination
    if (data.meta?.next_token) {
      console.log(`\n[fetchOurNotes] More results available. Next token: ${data.meta.next_token}`);
    } else {
      console.log(`\n[fetchOurNotes] All results retrieved.`);
    }

    // Summary of statuses
    const statusCounts: { [key: string]: number } = {};
    data.data.forEach((note: any) => {
      const status = note.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    console.log(`\n[fetchOurNotes] Status Summary:`);
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

  } catch (error: any) {
    console.error("[fetchOurNotes] Error fetching notes:", error.response?.data || error.message);

    if (error.response?.status === 429) {
      console.log("[fetchOurNotes] Rate limited. Try again later.");
    } else if (error.response?.status === 401) {
      console.log("[fetchOurNotes] Authentication error. Check OAuth credentials.");
    }
  }
}

fetchOurCommunityNotes();