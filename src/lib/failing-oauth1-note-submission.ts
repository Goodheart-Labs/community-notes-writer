import axios from "axios";
import crypto from "crypto";
import OAuth from "oauth-1.0a";

// === OAuth1 Configuration ===
const consumer_key = process.env.X_API_KEY as string;
const consumer_secret = process.env.X_API_KEY_SECRET as string;
const access_token = process.env.X_ACCESS_TOKEN as string;
const access_token_secret = process.env.X_ACCESS_TOKEN_SECRET as string;

// === OAuth1 Helper Function ===
function getOAuth1Headers(url: string, method: string = "GET", body?: string) {
  const oauth = new OAuth({
    consumer: {
      key: consumer_key,
      secret: consumer_secret,
    },
    signature_method: "HMAC-SHA1",
    hash_function(base_string, key) {
      return crypto
        .createHmac("sha1", key)
        .update(base_string)
        .digest("base64");
    },
  });

  const request_data = {
    url: url,
    method: method,
    ...(body && { data: body }),
  };

  const token = {
    key: access_token,
    secret: access_token_secret,
  };

  return oauth.toHeader(oauth.authorize(request_data, token));
}

// === OAuth1 Auth Headers Helper ===
function getOAuth1AuthHeaders(
  url: string,
  method: string = "GET",
  body?: string
) {
  return getOAuth1Headers(url, method, body);
}

// === Type Definitions ===
export type SubmitNoteResponse = {
  data?: any;
  errors?: any;
};

export type NoteInfo = {
  classification: string;
  misleading_tags: string[];
  text: string;
  trustworthy_sources: boolean;
};

// === OAuth1 Note Submission Function ===
async function submitNoteOAuth1(
  postId: string,
  info: NoteInfo,
  testMode: boolean = true
): Promise<SubmitNoteResponse> {
  const url = "https://api.twitter.com/2/notes";
  const data = {
    info,
    post_id: postId,
    test_mode: testMode,
  };

  const body = JSON.stringify(data);
  const headers = {
    ...getOAuth1AuthHeaders(url, "POST", body),
    "Content-Type": "application/json",
  };

  const response = await axios.post(url, data, { headers });
  return response.data;
}

// === Environment Variables Check ===
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

// === Test Configuration ===
const postId = "1949517747383054433";
const info: NoteInfo = {
  classification: "misinformed_or_potentially_misleading",
  misleading_tags: ["disputed_claim_as_fact"],
  text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  trustworthy_sources: true,
};

// === Main Test Function ===
async function testFailingOAuth1NoteSubmission() {
  try {
    console.log("=== Submitting Note with OAuth1 ===");
    console.log("Post ID:", postId);
    console.log("Note Info:", JSON.stringify(info, null, 2));
    console.log("Test Mode: true");
    console.log("URL: https://api.twitter.com/2/notes");
    console.log("Method: POST");
    console.log("===============================\n");

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

// === Execute Test ===
testFailingOAuth1NoteSubmission();
