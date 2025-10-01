import Airtable from "airtable";
import fs from "fs";
import path from "path";
import open from "open";
import dotenv from "dotenv";

dotenv.config();

interface AirtableRecord {
  URL: string;
  "Bot name": string;
  "Initial tweet body": string;
  "Full Result": string;
  "Final note": string;
  "Would be posted": number;
  "Would Nathan have posted?": number | undefined;
  "Nathan Notes": string | undefined;
  Created: string;
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseFullResult(fullResult: string) {
  const sections: any = {};
  
  const tweetIdMatch = fullResult.match(/TWEET ID: (\d+)/);
  sections.tweetId = tweetIdMatch?.[1] || "";
  
  const tweetTextMatch = fullResult.match(/TWEET TEXT:\n([\s\S]*?)\n\nSEARCH CONTEXT:/);
  sections.tweetText = tweetTextMatch?.[1]?.trim() || "";
  
  const statusMatch = fullResult.match(/- Status: ([^\n]+)/);
  sections.status = statusMatch?.[1] || "";
  
  const noteTextMatch = fullResult.match(/- Note text: ([^\n]+)/);
  sections.noteText = noteTextMatch?.[1] || "";
  
  const sourceUrlMatch = fullResult.match(/- Source URL: ([^\n]+)/);
  sections.sourceUrl = sourceUrlMatch?.[1] !== "None" ? sourceUrlMatch?.[1] || "" : "";
  
  const checkResultMatch = fullResult.match(/- Check result: ([^\n]+)/);
  sections.checkResult = checkResultMatch?.[1] || "";
  
  const citationsMatch = fullResult.match(/- Citations: ([^\n]+)/);
  sections.citations = citationsMatch?.[1] !== "None" ? citationsMatch?.[1] || "" : "";
  
  return sections;
}

function renderHtml(records: AirtableRecord[]) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Community Notes Needing Review</title>
  <style>
    body { font-family: 'Segoe UI', 'Roboto', 'Arial', sans-serif; background: #f4f6fb; color: #222; margin: 0; padding: 0; }
    header { background: #0a2540; color: #fff; padding: 2rem 0 1.5rem 0; text-align: center; box-shadow: 0 2px 8px #0002; }
    h1 { margin: 0; font-size: 2.5rem; letter-spacing: 0.02em; }
    .stats { font-size: 1.1em; margin-top: 0.5em; color: #e0e6f0; }
    main { max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
    .run { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px #0001; margin-bottom: 2rem; padding: 2rem 2.5rem; transition: box-shadow 0.2s; border-left: 4px solid #0a0; }
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
    .bot-name { font-size: 0.9em; color: #666; margin-top: 1em; font-style: italic; }
    .timestamp { font-size: 0.95em; color: #666; margin-bottom: 0.8em; font-weight: 500; }
    @media (max-width: 600px) { .run { padding: 1rem; } }
  </style>
</head>
<body>
  <header>
    <h1>Community Notes Needing Review</h1>
    <div class="stats">Showing ${records.length} notes that need review (newest to oldest)</div>
  </header>
  <main>
    ${records.map((r, i) => {
      const parsed = parseFullResult(r["Full Result"]);
      const checkYes = parsed.checkResult && parsed.checkResult.trim().toUpperCase() === "YES";
      
      return `<div class="run">
        <div class="timestamp">${new Date(r.Created).toLocaleString('en-US', { 
          weekday: 'short', 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        })}</div>
        <div class="tweet-header">
          <span class="tweet-label">Note #${i + 1}</span>
          <a class="tweet-link" href="${escapeHtml(r.URL)}" target="_blank">View on Twitter</a>
        </div>
        <div class="tweet">${escapeHtml(parsed.tweetText || "Tweet text not available")}</div>
        <div class="status-row">
          <span class="status-label">Check Result:</span>
          <span class="status ${checkYes ? "check-yes" : "check-no"}">${escapeHtml(parsed.checkResult || "NO CHECK")}</span>
        </div>
        <div class="status-row">
          <span class="status-label">Note Status:</span>
          <span class="status">${escapeHtml(parsed.status || "Unknown")}</span>
        </div>
        <div class="note-block">${escapeHtml(r["Final note"])}</div>
        ${parsed.sourceUrl ? `<div class="url"><a href="${escapeHtml(parsed.sourceUrl)}" target="_blank">${escapeHtml(parsed.sourceUrl)}</a></div>` : ""}
        ${parsed.citations ? `<div class="citations"><span class="label">Citations:</span> ${escapeHtml(parsed.citations)}</div>` : ""}
        <div class="bot-name">Processed by: ${escapeHtml(r["Bot name"])}</div>
      </div>`;
    }).join("\n")}
  </main>
</body>
</html>`;
}

async function main() {
  try {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME;

    if (!apiKey || !baseId || !tableName) {
      throw new Error(
        "Missing required environment variables: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME"
      );
    }

    const base = new Airtable({ apiKey }).base(baseId);
    const records: AirtableRecord[] = [];

    console.log("Fetching records from Airtable (filtering for entries needing review)...");
    
    await base(tableName)
      .select({
        pageSize: 100,
        filterByFormula: 'AND({Would be posted} = 1, COUNTA({Would Nathan have posted?}) = 0)',
        sort: [{ field: "Created", direction: "desc" }]
      })
      .eachPage((fetchedRecords, fetchNextPage) => {
        fetchedRecords.forEach(record => {
          const fields = record.fields;
          if (fields.URL && fields["Full Result"]) {
            records.push({
              URL: fields.URL as string,
              "Bot name": fields["Bot name"] as string || "Unknown",
              "Initial tweet body": fields["Initial tweet body"] as string || "",
              "Full Result": fields["Full Result"] as string,
              "Final note": fields["Final note"] as string || "",
              "Would be posted": fields["Would be posted"] as number || 0,
              "Would Nathan have posted?": fields["Would Nathan have posted?"] as number | undefined,
              "Nathan Notes": fields["Nathan Notes"] as string | undefined,
              Created: fields.Created as string || "",
            });
          }
        });
        fetchNextPage();
      });

    console.log(`Fetched ${records.length} records that need review from Airtable`);

    // Generate HTML
    const html = renderHtml(records);
    
    // Write to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = path.join(process.cwd(), "airtable-reports");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
    const outFile = path.join(outDir, `airtable-notes-${timestamp}.html`);
    fs.writeFileSync(outFile, html, "utf8");
    
    console.log(`\nHTML report written to: ${outFile}`);
    console.log(`Total notes needing review: ${records.length}`);

    // Open the HTML file
    await open(outFile);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();