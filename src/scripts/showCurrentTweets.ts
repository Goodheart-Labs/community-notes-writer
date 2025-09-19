import axios from "axios";
import { getOAuth1Headers } from "../api/getOAuthToken";

async function showCurrentTweets() {
  console.log("[showCurrentTweets] Fetching tweets eligible for community notes from X API...\n");

  try {
    const url = "https://api.x.com/2/notes/search/posts_eligible_for_notes";
    const params = new URLSearchParams({
      max_results: "50",
      "tweet.fields": "id,text,created_at,attachments,author_id",
      "media.fields": "type,url,preview_image_url",
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
    
    if (!data.data || data.data.length === 0) {
      console.log("No tweets found");
      return;
    }

    // Create a map of media keys to media types
    const mediaMap = new Map();
    if (data.includes?.media) {
      data.includes.media.forEach((media: any) => {
        mediaMap.set(media.media_key, media.type);
      });
    }

    console.log(`Found ${data.data.length} tweets:\n`);
    console.log("=".repeat(100));

    data.data.forEach((tweet: any, index: number) => {
      console.log(`\n${index + 1}. Tweet ID: ${tweet.id}`);
      console.log(`   URL: https://twitter.com/i/status/${tweet.id}`);
      
      // Check for video
      let hasVideo = false;
      if (tweet.attachments?.media_keys) {
        for (const mediaKey of tweet.attachments.media_keys) {
          const mediaType = mediaMap.get(mediaKey);
          if (mediaType === 'video' || mediaType === 'animated_gif') {
            hasVideo = true;
            break;
          }
        }
      }
      
      console.log(`   Has Video: ${hasVideo ? "YES 🎬" : "NO"}`);
      console.log(`   Text: ${tweet.text.replace(/\n/g, ' ')}`);
      console.log("   " + "-".repeat(96));
    });

    console.log("\n" + "=".repeat(100));
    
    // Summary
    const videoCount = data.data.filter((tweet: any) => {
      if (!tweet.attachments?.media_keys) return false;
      return tweet.attachments.media_keys.some((key: string) => {
        const type = mediaMap.get(key);
        return type === 'video' || type === 'animated_gif';
      });
    }).length;
    
    console.log(`\nSUMMARY:`);
    console.log(`Total tweets: ${data.data.length}`);
    console.log(`Tweets with video: ${videoCount}`);
    console.log(`Tweets without video: ${data.data.length - videoCount}`);

  } catch (error: any) {
    console.error("[showCurrentTweets] Error fetching tweets:", error.response?.data || error.message);
    
    if (error.response?.status === 429) {
      console.log("[showCurrentTweets] Rate limited. Try again later.");
    } else if (error.response?.status === 401) {
      console.log("[showCurrentTweets] Authentication error. Check OAuth credentials.");
    }
  }
}

showCurrentTweets();