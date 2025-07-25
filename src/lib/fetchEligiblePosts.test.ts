import { fetchEligiblePosts } from "./fetchEligiblePosts";

const bearerToken = process.env.X_BEARER_TOKEN!;

async function testFetchEligiblePosts() {
  try {
    const posts = await fetchEligiblePosts(bearerToken, 5);
    console.log("Fetched eligible posts:", posts);
  } catch (error) {
    console.error(
      "Failed to fetch eligible posts:",
      error.response?.data || error
    );
  }
}

testFetchEligiblePosts();
