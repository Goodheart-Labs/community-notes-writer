import { createServer } from "http";
import crypto from "crypto";
import OAuth from "oauth-1.0a";

// === CONFIGURATION ===
// Set these from your Twitter/X Developer Portal app settings:
const consumer_key = process.env.X_API_KEY as string; // <-- From your env
const consumer_secret = process.env.X_API_KEY_SECRET as string; // <-- From your env
const access_token = process.env.X_ACCESS_TOKEN as string; // <-- From your env
const access_token_secret = process.env.X_ACCESS_TOKEN_SECRET as string; // <-- From your env

// === OAuth1 Helper Function ===
export function getOAuth1Headers(
  url: string,
  method: string = "GET",
  body?: string
) {
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

// === OAuth1 Token Validation ===
export async function validateOAuth1Tokens() {
  if (
    !consumer_key ||
    !consumer_secret ||
    !access_token ||
    !access_token_secret
  ) {
    console.error("\n❌ Missing OAuth1 environment variables!");
    console.log("\nRequired environment variables:");
    console.log("- X_API_KEY");
    console.log("- X_API_KEY_SECRET");
    console.log("- X_ACCESS_TOKEN");
    console.log("- X_ACCESS_TOKEN_SECRET");
    console.log(
      "\nYou can get these from your Twitter/X Developer Portal app settings."
    );
    return false;
  }

  try {
    // Test the tokens by making a simple API call
    const headers = getOAuth1Headers("https://api.twitter.com/2/users/me");

    const response = await fetch("https://api.twitter.com/2/users/me", {
      method: "GET",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const userData = await response.json();
      console.log("\n✅ OAuth1 tokens are valid!");
      console.log(`Authenticated as: @${userData.data.username}`);
      return true;
    } else {
      console.error("\n❌ OAuth1 tokens are invalid!");
      console.error("Response status:", response.status);
      const errorData = await response.json().catch(() => ({}));
      console.error("Error details:", errorData);
      return false;
    }
  } catch (error) {
    console.error("\n❌ Error validating OAuth1 tokens:", error);
    return false;
  }
}

// === OAuth1 Token Setup Helper ===
export function printOAuth1SetupInstructions() {
  console.log("\n=== OAuth1 Setup Instructions ===");
  console.log("\n1. Go to https://developer.twitter.com/en/portal/dashboard");
  console.log("2. Create a new app or use an existing one");
  console.log("3. In your app settings, note down:");
  console.log("   - API Key (Consumer Key)");
  console.log("   - API Key Secret (Consumer Secret)");
  console.log("4. Generate Access Token and Secret:");
  console.log("   - Go to 'Keys and tokens' tab");
  console.log("   - Generate 'Access Token and Secret'");
  console.log("   - Note down both the Access Token and Access Token Secret");
  console.log("\n5. Add these to your .env.local file:");
  console.log("   X_API_KEY=your_api_key_here");
  console.log("   X_API_KEY_SECRET=your_api_key_secret_here");
  console.log("   X_ACCESS_TOKEN=your_access_token_here");
  console.log("   X_ACCESS_TOKEN_SECRET=your_access_token_secret_here");
  console.log("\n6. Run this script to validate your tokens");
}

// === Main Execution ===
// Removed module check for ES modules compatibility
