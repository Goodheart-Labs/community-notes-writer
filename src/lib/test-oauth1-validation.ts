import { validateOAuth1Tokens } from "./getOAuth1Token";

async function testOAuth1Validation() {
  console.log("=== Testing OAuth1 Token Validation ===");
  const isValid = await validateOAuth1Tokens();
  console.log("Validation result:", isValid);
}

testOAuth1Validation();
