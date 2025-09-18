import { fetchEligiblePosts } from "../api/fetchEligiblePosts";

async function testVideoFiltering() {
  console.log("[testVideoFiltering] Testing video filtering in fetchEligiblePosts...\n");
  
  try {
    // Fetch 10 posts with the new filtering
    const posts = await fetchEligiblePosts(10, new Set(), 5);
    
    console.log("\n" + "="*80);
    console.log("RESULTS:");
    console.log(`Successfully fetched ${posts.length} non-video posts\n`);
    
    // Check if any have video (they shouldn't)
    let videosFound = 0;
    posts.forEach((post, i) => {
      const hasVideo = post.media.some(m => m.type === 'video' || m.type === 'animated_gif');
      if (hasVideo) {
        console.log(`WARNING: Post ${i+1} (${post.id}) has video!`);
        videosFound++;
      }
    });
    
    if (videosFound === 0) {
      console.log("✅ SUCCESS: No videos found in fetched posts!");
    } else {
      console.log(`❌ PROBLEM: Found ${videosFound} posts with video`);
    }
    
    console.log("\nFirst 5 posts:");
    posts.slice(0, 5).forEach((post, i) => {
      console.log(`${i+1}. ID: ${post.id}`);
      console.log(`   Text: ${post.text.substring(0, 80)}...`);
      console.log(`   Media types: ${post.media.map(m => m.type).join(", ") || "none"}`);
    });
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testVideoFiltering();