import { fetchEligiblePosts } from "./lib/fetchEligiblePosts";
import type { Post } from "./lib/fetchEligiblePosts";
import { versionOneFn as searchV1 } from "./searchContextGoal";
import { writeNoteWithSearchFn as writeV1 } from "./writeNoteWithSearchGoal";
import { check as checkV1 } from "./check";
import { AirtableLogger, createLogEntry } from "./lib/airtableLogger";
import fs from "fs";
import path from "path";
import open from "open";

async function runPipeline(post: Post, idx: number) {
  console.log(
    `[runPipeline] Starting pipeline for post #${idx + 1} (ID: ${post.id})`
  );
  try {
    const searchContextResult = await searchV1(
      {
        text: post.text,
        media: (post.media || [])
          .map((m: any) => m.url || m.preview_image_url)
          .filter(Boolean),
        searchResults: "",
      },
      { model: "perplexity/sonar" }
    );
    console.log(
      `[runPipeline] Search context complete for post #${idx + 1} (ID: ${
        post.id
      })`
    );

    const noteResult = await writeV1(
      {
        text: searchContextResult.text,
        searchResults: searchContextResult.searchResults,
        citations: searchContextResult.citations || [],
      },
      { model: "anthropic/claude-sonnet-4" }
    );
    console.log(
      `[runPipeline] Note generated for post #${idx + 1} (ID: ${post.id})`
    );

    const checkResult = await checkV1({
      note: noteResult.note,
      url: noteResult.url,
      status: noteResult.status,
    });
    console.log(
      `[runPipeline] Check complete for post #${idx + 1} (ID: ${post.id})`
    );

    return {
      post,
      searchContextResult,
      noteResult,
      checkResult,
    };
  } catch (err) {
    console.error(
      `[runPipeline] Error in pipeline for post #${idx + 1} (ID: ${post.id}):`,
      err
    );
    return null;
  }
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(results: any[]) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Community Notes Test Runs</title>
  <style>
    body { font-family: 'Segoe UI', 'Roboto', 'Arial', sans-serif; background: #f4f6fb; color: #222; margin: 0; padding: 0; }
    header { background: #0a2540; color: #fff; padding: 2rem 0 1.5rem 0; text-align: center; box-shadow: 0 2px 8px #0002; }
    h1 { margin: 0; font-size: 2.5rem; letter-spacing: 0.02em; }
    main { max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
    .run { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px #0001; margin-bottom: 2.5rem; padding: 2rem 2.5rem; transition: box-shadow 0.2s; }
    .run:hover { box-shadow: 0 4px 24px #0002; }
    .tweet-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5em; }
    .tweet-label { font-size: 1.05em; color: #0a2540; font-weight: 600; }
    .tweet-link { font-size: 0.98em; color: #09f; text-decoration: none; margin-left: 1em; }
    .tweet-link:hover { text-decoration: underline; }
    .tweet { font-size: 1.18em; margin-bottom: 1.2em; white-space: pre-line; background: #f7fafd; border-radius: 6px; padding: 1em; border: 1px solid #e3e8f0; }
    .status-row { display: flex; align-items: center; margin-bottom: 0.7em; }
    .status-label { font-weight: 500; color: #888; margin-right: 0.5em; }
    .status { font-weight: bold; font-size: 1.08em; }
    .check-yes { color: #0a0; }
    .check-no { color: #a00; }
    .note-block { background: #f0f7ff; border-left: 4px solid #09f; padding: 1em 1.2em; border-radius: 6px; margin: 1em 0 0.5em 0; font-size: 1.08em; }
    .url { font-size: 0.98em; color: #09f; margin-bottom: 0.5em; }
    .url a { color: #09f; text-decoration: underline; }
    .citations { font-size: 0.97em; color: #555; margin-top: 0.5em; }
    .label { font-size: 0.97em; color: #888; margin-right: 0.5em; }
    .section-title { font-size: 1.12em; color: #0a2540; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.5em; }
    @media (max-width: 600px) { .run { padding: 1rem; } }
  </style>
</head>
<body>
  <header>
    <h1>Community Notes Test Runs</h1>
    <div style="font-size:1.1em; margin-top:0.5em; color:#e0e6f0;">Showing all results for 5 eligible tweets</div>
  </header>
  <main>
    ${results
      .map((r, i) => {
        if (!r)
          return `<div class="run"><b>Pipeline failed for post #${
            i + 1
          }</b></div>`;
        const checkYes =
          r.checkResult && r.checkResult.trim().toUpperCase() === "YES";
        return `<div class="run">
          <div class="tweet-header">
            <span class="tweet-label">Tweet #${i + 1}</span>
            <a class="tweet-link" href="https://twitter.com/i/status/${
              r.post.id
            }" target="_blank">View on Twitter</a>
          </div>
          <div class="tweet">${escapeHtml(r.post.text)}</div>
          <div class="status-row">
            <span class="status-label">Check Result:</span>
            <span class="status ${checkYes ? "check-yes" : "check-no"}">${
          r.checkResult ? r.checkResult : "NO CHECK"
        }</span>
          </div>
          <div class="status-row">
            <span class="status-label">Note Status:</span>
            <span class="status">${escapeHtml(r.noteResult.status)}</span>
          </div>
          <div class="section-title">Community Note</div>
          <div class="note-block">${escapeHtml(r.noteResult.note)}</div>
          <div class="url">${
            r.noteResult.url
              ? `<a href="${escapeHtml(
                  r.noteResult.url
                )}" target="_blank">${escapeHtml(r.noteResult.url)}</a>`
              : ""
          }</div>
          <div class="citations"><span class="label">Citations:</span> ${
            r.searchContextResult.citations &&
            r.searchContextResult.citations.length
              ? r.searchContextResult.citations.map(escapeHtml).join(", ")
              : "None"
          }</div>
        </div>`;
      })
      .join("\n")}
  </main>
</body>
</html>`;
}

async function main() {
  try {
    // Initialize Airtable logger to check existing posts
    const airtableLogger = new AirtableLogger();
    const logEntries: any[] = [];
    
    // Get existing URLs from Airtable
    const existingUrls = await airtableLogger.getExistingUrls();
    
    // Convert URLs to post IDs (extract ID from URL)
    const skipPostIds = new Set<string>();
    existingUrls.forEach(url => {
      const match = url.match(/status\/(\d+)$/);
      if (match && match[1]) skipPostIds.add(match[1]);
    });
    
    console.log(`[main] Skipping ${skipPostIds.size} already-processed posts`);

    let posts: Post[] = await fetchEligiblePosts(5, skipPostIds);
    console.log(
      `[main] Fetched ${posts.length} new posts:`,
      posts.map((p) => p.id)
    );
    if (!posts.length) {
      console.log("No new eligible posts found.");
      return;
    }

    // Run all pipelines in parallel
    console.log(`[main] Starting pipelines for ${posts.length} posts...`);
    const results = await Promise.all(
      posts.map((post, idx) => runPipeline(post, idx))
    );
    console.log(
      `[main] All pipelines complete. Results count: ${results.length}`
    );

    // Create log entries for Airtable
    for (const r of results) {
      if (!r) continue;
      
      const logEntry = createLogEntry(
        r.post,
        r.searchContextResult,
        r.noteResult,
        r.checkResult,
        "first-bot"
      );
      logEntries.push(logEntry);
    }

    // Log all entries to Airtable
    if (logEntries.length > 0) {
      try {
        await airtableLogger.logMultipleEntries(logEntries);
        console.log(
          `[main] Successfully logged ${logEntries.length} entries to Airtable`
        );
      } catch (err) {
        console.error("[main] Failed to log to Airtable:", err);
      }
    }

    // Write HTML output
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = path.join(process.cwd(), "test-runs");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
    const outFile = path.join(outDir, `test-run-${timestamp}.html`);
    fs.writeFileSync(outFile, renderHtml(results), "utf8");
    console.log(`\nHTML output written to: ${outFile}`);

    // Open the HTML file
    await open(outFile);
  } catch (err) {
    console.error("[main] Error in pipeline:", err);
    process.exit(1);
  }
}

main();
