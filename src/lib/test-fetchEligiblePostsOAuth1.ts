import { fetchEligiblePostsOAuth1, type Post } from "./fetchEligiblePostsOAuth1";

// Uses OAuth1 environment variables. Ensure these are set before running:
// X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET

// Log environment variables to verify they're set
console.log("=== Environment Variables Check ===");
console.log("X_API_KEY:", process.env.X_API_KEY ? "✅ Set" : "❌ Missing");
console.log(
  "X_API_KEY_SECRET:",
  process.env.X_API_KEY_SECRET ? "✅ Set" : "❌ Missing"
);
console.log(
  "X_ACCESS_TOKEN:",
  process.env.X_ACCESS_TOKEN ? "✅ Set" : "❌ Missing"
);
console.log(
  "X_ACCESS_TOKEN_SECRET:",
  process.env.X_ACCESS_TOKEN_SECRET ? "✅ Set" : "❌ Missing"
);
console.log("================================\n");

const maxResults = 5; // Limit to 5 posts for testing

async function testFetchEligiblePostsOAuth1() {
  try {
    console.log("=== Fetching Eligible Posts ===");
    console.log("Max Results:", maxResults);
    console.log("Test Mode: true");
    console.log("==============================\n");

    const posts = await fetchEligiblePostsOAuth1(maxResults);

    console.log("=== SUCCESS - Eligible Posts Found ===");
    console.log(`Total posts found: ${posts.length}`);
    console.log("\nPosts:");
    posts.forEach((post, index) => {
      console.log(`\n--- Post ${index + 1} ---`);
      console.log(`ID: ${post.id}`);
      console.log(`Author ID: ${post.author_id}`);
      console.log(`Created: ${post.created_at}`);
      console.log(`Text: ${post.text.substring(0, 100)}${post.text.length > 100 ? '...' : ''}`);
      console.log(`Media count: ${post.media.length}`);
      if (post.media.length > 0) {
        console.log("Media:");
        post.media.forEach((media, mediaIndex) => {
          console.log(`  ${mediaIndex + 1}. Type: ${media.type}, URL: ${media.url || 'N/A'}`);
        });
      }
    });
    console.log("\n===============================\n");
  } catch (error: any) {
    console.error("=== ERROR - Full Error Details ===");
    console.error("Error message:", error.message);
    console.error("Error code:", error.code);
    console.error("Error status:", error.response?.status);
    console.error("Error status text:", error.response?.statusText);
    console.error(
      "Error headers:",
      JSON.stringify(error.response?.headers, null, 2)
    );
    console.error("Error data:", JSON.stringify(error.response?.data, null, 2));
    console.error("Full error object:", JSON.stringify(error, null, 2));
    console.error("==================================\n");
  }
}

testFetchEligiblePostsOAuth1(); 