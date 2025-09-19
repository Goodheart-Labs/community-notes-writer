import axios from "axios";
import { getOAuth1Headers } from "../api/getOAuthToken";
import Airtable from "airtable";

async function checkAttemptedTweets() {
  // First, fetch the tweets without video
  console.log(
    "[checkAttemptedTweets] Fetching tweets eligible for community notes...\n"
  );

  const url = "https://api.x.com/2/notes/search/posts_eligible_for_notes";
  const params = new URLSearchParams({
    max_results: "50",
    "tweet.fields": "id,text,created_at,attachments,author_id",
    "media.fields": "type,url,preview_image_url",
    expansions: "attachments.media_keys",
    test_mode: "false",
  });

  const fullUrl = `${url}?${params.toString()}`;

  const response = await axios.get(fullUrl, {
    headers: {
      ...getOAuth1Headers(fullUrl, "GET"),
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });

  const data = response.data;

  // Create a map of media keys to media types
  const mediaMap = new Map();
  if (data.includes?.media) {
    data.includes.media.forEach((media: any) => {
      mediaMap.set(media.media_key, media.type);
    });
  }

  // Filter for tweets WITHOUT video
  const tweetsWithoutVideo = data.data.filter((tweet: any) => {
    if (!tweet.attachments?.media_keys) return true; // No media = no video

    // Check if any media is video
    for (const mediaKey of tweet.attachments.media_keys) {
      const mediaType = mediaMap.get(mediaKey);
      if (mediaType === "video" || mediaType === "animated_gif") {
        return false; // Has video, exclude it
      }
    }
    return true; // Has media but no video
  });

  console.log(`Found ${tweetsWithoutVideo.length} tweets without video\n`);

  // Now check Airtable for which ones we've already attempted
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  }

  const base = new Airtable({ apiKey }).base(baseId);
  const tableName = process.env.AIRTABLE_TABLE_NAME || "Community Notes";

  // Get all tweet URLs from Airtable
  const attemptedUrls = new Set<string>();
  const attemptedIds = new Set<string>();

  try {
    await base(tableName)
      .select({
        fields: ["URL"],
        pageSize: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const tweetUrl = record.get("URL") as string;
          if (tweetUrl) {
            attemptedUrls.add(tweetUrl);
            // Extract ID from URL
            const match = tweetUrl.match(/status\/(\d+)/);
            if (match) {
              attemptedIds.add(match[1] || "");
            }
          }
        });
        fetchNextPage();
      });
  } catch (error) {
    console.error("Error fetching from Airtable:", error);
  }

  console.log(
    `Found ${attemptedIds.size} tweets already attempted in Airtable\n`
  );

  // Check which tweets we've already attempted
  const alreadyAttempted: any[] = [];
  const notAttempted: any[] = [];

  tweetsWithoutVideo.forEach((tweet: any) => {
    if (attemptedIds.has(tweet.id)) {
      alreadyAttempted.push(tweet);
    } else {
      notAttempted.push(tweet);
    }
  });

  console.log("=".repeat(100) + "\n");
  console.log("SUMMARY:");
  console.log(`Total tweets without video: ${tweetsWithoutVideo.length}`);
  console.log(`Already attempted: ${alreadyAttempted.length}`);
  console.log(`Not yet attempted: ${notAttempted.length}`);
  console.log("\n" + "=".repeat(100) + "\n");

  if (alreadyAttempted.length > 0) {
    console.log("\nTWEETS WE'VE ALREADY ATTEMPTED:");
    console.log("-".repeat(100));
    alreadyAttempted.forEach((tweet: any, index: number) => {
      console.log(`${index + 1}. ID: ${tweet.id}`);
      console.log(`   Text: ${tweet.text.substring(0, 100)}...`);
      console.log("");
    });
  }

  if (notAttempted.length > 0) {
    console.log("\nNEW TWEETS NOT YET ATTEMPTED:");
    console.log("-".repeat(100));
    notAttempted.forEach((tweet: any, index: number) => {
      console.log(`${index + 1}. ID: ${tweet.id}`);
      console.log(`   URL: https://twitter.com/i/status/${tweet.id}`);
      console.log(
        `   Text: ${tweet.text.substring(0, 150)}${
          tweet.text.length > 150 ? "..." : ""
        }`
      );
      console.log("");
    });
  }
}

checkAttemptedTweets().catch(console.error);
