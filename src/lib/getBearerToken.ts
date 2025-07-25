import { createServer } from "http";
import crypto from "crypto";

// === CONFIGURATION ===
// Set these from your Twitter/X Developer Portal app settings:
const client_id = process.env.X_CLIENT_ID as string; // <-- From your env
const client_secret = process.env.X_CLIENT_SECRET as string; // <-- From your env
const redirect_uri = "http://localhost:8080/callback"; // <-- Must match your app settings
const scopes = [
  "tweet.read",
  "tweet.write",
  "users.read",
  // "offline.access",
  // "note.write",
]; // Add/remove scopes as needed

// === PKCE CODE VERIFIER/CHALLENGE ===
function base64url(input: Buffer) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function generateCodeVerifier() {
  return base64url(crypto.randomBytes(32));
}
function generateCodeChallenge(verifier: string) {
  return base64url(crypto.createHash("sha256").update(verifier).digest());
}

const code_verifier = generateCodeVerifier();
const code_challenge = generateCodeChallenge(code_verifier);

// === STEP 1: Print Authorization URL ===
const authUrl =
  `https://twitter.com/i/oauth2/authorize?` +
  `response_type=code` +
  `&client_id=${encodeURIComponent(client_id)}` +
  `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
  `&scope=${encodeURIComponent(scopes.join(" "))}` +
  `&state=state` +
  `&code_challenge=${code_challenge}` +
  `&code_challenge_method=S256`;

console.log("\n1. Open this URL in your browser and authorize the app:\n");
console.log(authUrl);
console.log("\n2. After authorizing, you will be redirected to:", redirect_uri);
console.log(
  "   This script will capture the code and exchange it for a Bearer token.\n"
);

// === STEP 2: Start Local Server to Receive Code ===
const server = createServer(async (req, res) => {
  if (!req.url) return;
  const url = new URL(req.url, `http://localhost:8080`);
  if (url.pathname === "/callback" && url.searchParams.has("code")) {
    const code = url.searchParams.get("code");
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(
      "Authorization code received! You can close this tab.\nCheck your terminal for the Bearer token.\n"
    );
    server.close();
    // === STEP 3: Exchange Code for Token ===
    const basicAuth = Buffer.from(`${client_id}:${client_secret}`).toString(
      "base64"
    );
    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        client_id,
        grant_type: "authorization_code",
        code: code!,
        redirect_uri,
        code_verifier,
      }).toString(),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
      console.log("\nSUCCESS! Your Bearer token is:\n");
      console.log(tokenData.access_token);
      console.log("\nSave this as X_BEARER_TOKEN in your .env.local file.");
    } else {
      console.error("\nFailed to get token:", tokenData);
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(8080, () => {
  console.log(
    "\nWaiting for the OAuth redirect on http://localhost:8080/callback ...\n"
  );
});
