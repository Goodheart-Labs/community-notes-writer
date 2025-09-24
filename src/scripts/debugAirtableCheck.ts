import axios from "axios";
import { getOAuth1Headers } from "../api/getOAuthToken";
import Airtable from "airtable";

async function debugAirtableCheck() {
  // Get the current eligible tweets
  const url = "https://api.x.com/2/notes/search/posts_eligible_for_notes";
  const params = new URLSearchParams({
    max_results: "10",
    "tweet.fields": "id,text",
    test_mode: "false"
  });

  const fullUrl = `${url}?${params.toString()}`;
  const response = await axios.get(fullUrl, {
    headers: {
      ...getOAuth1Headers(fullUrl, "GET"),
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });

  const tweets = response.data.data;
  console.log(`\nCurrent eligible tweets (first 10):`);
  tweets.forEach((t: any, i: number) => {
    console.log(`${i+1}. ${t.id} - ${t.text.substring(0, 50)}...`);
  });

  // Now check Airtable
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  }

  const base = new Airtable({ apiKey }).base(baseId);
  const tableName = process.env.AIRTABLE_TABLE_NAME || "Community Notes";
  
  // Get a sample of recent URLs from Airtable
  const recentUrls: string[] = [];
  
  try {
    await base(tableName)
      .select({
        fields: ["URL", "Bot name", "Created"],
        maxRecords: 20,
        sort: [{field: "Created", direction: "desc"}]
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const url = record.get("URL") as string;
          const bot = record.get("Bot name") as string;
          if (url) {
            const match = url.match(/status\/(\d+)/);
            const id = match ? match[1] : "unknown";
            recentUrls.push(`${id} (bot: ${bot || 'unknown'})`);
          }
        });
        fetchNextPage();
      });
  } catch (error) {
    console.error("Error:", error);
  }

  console.log(`\n20 most recent entries in Airtable:`);
  recentUrls.forEach((url, i) => {
    console.log(`${i+1}. ${url}`);
  });

  // Check if any of the current eligible tweets are in our recent Airtable records
  const airtableIds = new Set(recentUrls.map(r => r.split(" ")[0]));
  const eligibleIds = tweets.map((t: any) => t.id);
  
  console.log(`\nOverlap check:`);
  eligibleIds.forEach((id: string) => {
    if (airtableIds.has(id)) {
      console.log(`Tweet ${id} IS in recent Airtable records`);
    }
  });
}

debugAirtableCheck().catch(console.error);