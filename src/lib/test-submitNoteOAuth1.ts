import { submitNoteOAuth1, type NoteInfo } from "./submitNoteOAuth1";

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

const postId = "1949517747383054433";
const info: NoteInfo = {
  classification: "misinformed_or_potentially_misleading",
  misleading_tags: ["disputed_claim_as_fact"],
  text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  trustworthy_sources: true,
};

async function testSubmitNoteOAuth1() {
  try {
    console.log("=== Submitting Note ===");
    console.log("Post ID:", postId);
    console.log("Note Info:", JSON.stringify(info, null, 2));
    console.log("Test Mode: true");
    console.log("========================\n");

    const response = await submitNoteOAuth1(postId, info, true);

    console.log("=== SUCCESS - Full Response ===");
    console.log("Response:", JSON.stringify(response, null, 2));
    console.log("===============================\n");
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

testSubmitNoteOAuth1();
