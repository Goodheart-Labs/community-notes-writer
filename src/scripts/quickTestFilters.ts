// Quick test to see if filters are working properly now
import { checkSarcasm } from "../pipeline/sarcasmFilter";
import { checkUrlValidity } from "../pipeline/urlChecker";

async function quickTest() {
  console.log("Testing fixed filters...\n");
  
  // Test sarcasm filter
  try {
    console.log("1. Testing sarcasm filter:");
    const result = await checkSarcasm("The unemployment rate is 50% according to my dreams last night");
    console.log("   Score:", result.score);
    console.log("   Reasoning:", result.reasoning);
    console.log("   Type of reasoning:", typeof result.reasoning);
    console.log("   ✓ Success!\n");
  } catch (error) {
    console.log("   ✗ Failed:", error);
  }
  
  // Test URL checker
  try {
    console.log("2. Testing URL checker:");
    const result = await checkUrlValidity(
      "The rate is 3.7% according to BLS",
      "https://www.bls.gov/stats"
    );
    console.log("   Score:", result.score);
    console.log("   Reasoning:", result.reasoning);
    console.log("   Has URL:", result.hasUrl);
    console.log("   ✓ Success!\n");
  } catch (error) {
    console.log("   ✗ Failed:", error);
  }
}

quickTest();