import { fetchEligiblePosts } from "./lib/fetchEligiblePosts";
import type { Config, Post } from "./lib/fetchEligiblePosts";
import { select, spinner } from "@clack/prompts";
import { versionOneFn } from "./context";
import { writeNoteV1Fn } from "./write";

async function main() {
  // Load config from environment variables
  const config: Config = {
    x_api_key: process.env.X_API_KEY!,
    x_api_key_secret: process.env.X_API_KEY_SECRET!,
    x_access_token: process.env.X_ACCESS_TOKEN!,
    x_access_token_secret: process.env.X_ACCESS_TOKEN_SECRET!,
  };

  try {
    const posts: Post[] = await fetchEligiblePosts(config, 10);
    if (!posts.length) {
      console.log("No eligible posts found.");
      return;
    }

    // Prepare choices for select
    const choices = posts.map((post) => ({
      value: post.id,
      label: `${post.text
        .slice(0, 80)
        .replace(/\s+/g, " ")}...\nhttps://twitter.com/i/status/${post.id}`,
    }));

    const selectedId = await select({
      message: "Select a post to inspect:",
      options: choices,
    });

    if (!selectedId) {
      console.log("No post selected.");
      return;
    }

    const chosen = posts.find((p) => p.id === selectedId);
    if (!chosen) {
      console.log("Selected post not found.");
      return;
    }
    console.log("You selected:", chosen);
    console.log("URL:", `https://twitter.com/i/status/${chosen.id}`);

    // Spinner for LLM call
    const s = spinner();
    s.start("Evaluating post for misleading content and helpful context...");
    const result = await versionOneFn(
      {
        text: chosen.text,
        media: (chosen.media || [])
          .map((m: any) => m.url || m.preview_image_url)
          .filter(Boolean),
      },
      { model: "perplexity/sonar" }
    );
    s.stop("Evaluation complete!");

    // Nicely format output
    console.log("\n--- Community Notes LLM Output ---");
    console.log(`Reasoning:\n${result.reasoning}\n`);
    if (result.citations && result.citations.length) {
      console.log("Citations:");
      for (const cite of result.citations) {
        console.log(`- ${cite}`);
      }
      console.log("");
    }
    console.log(`Time taken: ${result.time}ms\n`);

    // Spinner for note writing
    const s2 = spinner();
    s2.start("Generating Community Note...");
    const note = await writeNoteV1Fn(
      {
        post: chosen.text,
        reasoning: result.reasoning,
        citations: result.citations,
      },
      { model: "perplexity/sonar" }
    );
    s2.stop("Note generated!");

    // Print the note
    console.log("\n--- Community Note ---\n");
    console.log(note);
    console.log("\n---------------------\n");
  } catch (err) {
    console.error("Error fetching eligible posts:", err);
    process.exit(1);
  }
}

main();

// Search...
// Then only moving on if there is correctection with trustworthy citiation
//

// New version
// searchContextGoal
// Write post
// check post
