import axios from "axios";
import { getOAuth1Headers } from "../api/getOAuthToken";
import { AirtableLogger } from "../api/airtableLogger";

async function checkNonVideoTweetsInAirtable() {
  console.log("[checkNonVideoTweets] Fetching tweets and checking Airtable...\n");
  
  // Fetch eligible tweets
  const url = "https://api.x.com/2/notes/search/posts_eligible_for_notes";
  const params = new URLSearchParams({
    max_results: "50",
    "tweet.fields": "id,text,created_at,attachments",
    "media.fields": "type",
    expansions: "attachments.media_keys",
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
    if (!tweet.attachments?.media_keys) return true;
    for (const mediaKey of tweet.attachments.media_keys) {
      const mediaType = mediaMap.get(mediaKey);
      if (mediaType === 'video' || mediaType === 'animated_gif') {
        return false;
      }
    }
    return true;
  });

  console.log(`Found ${tweetsWithoutVideo.length} tweets without video\n`);

  // Get ALL URLs from Airtable (not just for a specific bot)
  const airtableLogger = new AirtableLogger();
  const allExistingUrls = await airtableLogger.getExistingUrls();
  
  // Also get URLs for specific bots
  const mainUrls = await airtableLogger.getExistingUrlsForBot("main");
  const stagingUrls = await airtableLogger.getExistingUrlsForBot("staging/date-in-prompt-and-research");
  
  console.log(`Airtable records:`);
  console.log(`- Total URLs in Airtable: ${allExistingUrls.size}`);
  console.log(`- URLs for 'main' bot: ${mainUrls.size}`);
  console.log(`- URLs for 'staging/date-in-prompt-and-research' bot: ${stagingUrls.size}\n`);

  // Convert URLs to IDs
  const allIds = new Set<string>();
  const mainIds = new Set<string>();
  const stagingIds = new Set<string>();
  
  allExistingUrls.forEach(url => {
    const match = url.match(/status\/(\d+)/);
    if (match) allIds.add(match[1]);
  });
  
  mainUrls.forEach(url => {
    const match = url.match(/status\/(\d+)/);
    if (match) mainIds.add(match[1]);
  });
  
  stagingUrls.forEach(url => {
    const match = url.match(/status\/(\d+)/);
    if (match) stagingIds.add(match[1]);
  });

  // Check overlap
  let attemptedByAny = 0;
  let attemptedByMain = 0;
  let attemptedByStaging = 0;
  let notAttempted = 0;
  
  const notAttemptedTweets: any[] = [];
  const attemptedTweets: any[] = [];

  tweetsWithoutVideo.forEach((tweet: any) => {
    const id = tweet.id;
    let attempted = false;
    let bots: string[] = [];
    
    if (allIds.has(id)) {
      attemptedByAny++;
      attempted = true;
    }
    if (mainIds.has(id)) {
      attemptedByMain++;
      bots.push("main");
    }
    if (stagingIds.has(id)) {
      attemptedByStaging++;
      bots.push("staging");
    }
    
    if (attempted) {
      attemptedTweets.push({ ...tweet, bots });
    } else {
      notAttempted++;
      notAttemptedTweets.push(tweet);
    }
  });

  console.log("="*80);
  console.log("SUMMARY:");
  console.log(`Total tweets without video: ${tweetsWithoutVideo.length}`);
  console.log(`Already attempted (any bot): ${attemptedByAny}`);
  console.log(`  - By main bot: ${attemptedByMain}`);
  console.log(`  - By staging bot: ${attemptedByStaging}`);
  console.log(`Not yet attempted: ${notAttempted}`);
  console.log("="*80 + "\n");

  if (attemptedTweets.length > 0) {
    console.log("ALREADY ATTEMPTED TWEETS:");
    console.log("-"*80);
    attemptedTweets.slice(0, 10).forEach((tweet: any, i: number) => {
      console.log(`${i+1}. ID: ${tweet.id} (by: ${tweet.bots.join(", ")})`);
      console.log(`   Text: ${tweet.text.substring(0, 80)}...`);
    });
    if (attemptedTweets.length > 10) {
      console.log(`   ... and ${attemptedTweets.length - 10} more`);
    }
  }

  if (notAttemptedTweets.length > 0) {
    console.log("\nNOT YET ATTEMPTED TWEETS:");
    console.log("-"*80);
    notAttemptedTweets.forEach((tweet: any, i: number) => {
      console.log(`${i+1}. ID: ${tweet.id}`);
      console.log(`   URL: https://twitter.com/i/status/${tweet.id}`);
      console.log(`   Text: ${tweet.text.substring(0, 100)}...`);
    });
  }
}

checkNonVideoTweetsInAirtable().catch(console.error);