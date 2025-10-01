import Airtable from "airtable";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

interface SankeyAnalysis {
  totalTweets: number;
  sarcasmFilter: {
    droppedOut: number;
    passedThrough: number;
  };
  noteStatus: {
    [status: string]: number;
  };
  scoringFilters: {
    passedAll: number;
    failedScoring: number;
    failureBreakdown: {
      failedURL: number;
      failedPositive: number;
      failedDisagreement: number;
    };
  };
}

async function analyzeAirtableData() {
  console.log('Starting Airtable data analysis...');

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME;

  if (!apiKey || !baseId || !tableName) {
    throw new Error(
      "Missing required environment variables: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME"
    );
  }

  const base = new Airtable({ apiKey }).base(baseId);
  const targetDate = new Date('2025-09-20T12:37:11Z');

  console.log(`Pulling all rows from ${tableName} since ${targetDate.toISOString()}`);

  try {
    const allRecords: any[] = [];

    await base(tableName)
      .select({
        pageSize: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          // Get the record's creation time from Airtable's built-in _createdTime field
          const createdTime = new Date(record._rawJson.createdTime);

          // Only include records created on or after our target date
          if (createdTime >= targetDate) {
            allRecords.push({
              id: record.id,
              createdTime: createdTime.toISOString(),
              fields: record.fields
            });
          }
        });
        fetchNextPage();
      });

    console.log(`Found ${allRecords.length} records since ${targetDate.toISOString()}`);

    // Save data to JSON file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `data-export-airtable-${timestamp}.json`;
    const filepath = join(process.cwd(), filename);

    const exportData = {
      exportDate: new Date().toISOString(),
      filterDate: targetDate.toISOString(),
      recordCount: allRecords.length,
      records: allRecords
    };

    writeFileSync(filepath, JSON.stringify(exportData, null, 2));
    console.log(`Data saved to: ${filename}`);

    // Display summary of first few records
    console.log('\n--- Sample Records (first 3) ---');
    allRecords.slice(0, 3).forEach((record, index) => {
      console.log(`\n--- Record ${index + 1} (ID: ${record.id}) ---`);
      console.log(`Created: ${record.createdTime}`);
      console.log('Fields:', JSON.stringify(record.fields, null, 2));
    });

    console.log(`\nData analysis complete. Full data saved to ${filename}`);

    // Now analyze the data for sankey diagram
    const analysis = analyzeSankeyFlow(allRecords);
    console.log('\n=== SANKEY FLOW ANALYSIS ===');
    console.log(JSON.stringify(analysis, null, 2));

    return { filename, data: exportData, analysis };
  } catch (error) {
    console.error('Error during data analysis:', error);
    throw error;
  }
}

function analyzeSankeyFlow(records: any[]): SankeyAnalysis {
  const analysis: SankeyAnalysis = {
    totalTweets: records.length,
    sarcasmFilter: {
      droppedOut: 0,
      passedThrough: 0,
    },
    noteStatus: {},
    scoringFilters: {
      passedAll: 0,
      failedScoring: 0,
      failureBreakdown: {
        failedURL: 0,
        failedPositive: 0,
        failedDisagreement: 0,
      },
    },
  };

  const trustworthyTweets: any[] = [];

  records.forEach((record) => {
    const fullResult = record.fields["Full Result"] || "";

    // Check if this was filtered out by sarcasm filter
    if (fullResult.includes("SKIP REASON: Sarcasm filter:")) {
      analysis.sarcasmFilter.droppedOut++;
    } else {
      analysis.sarcasmFilter.passedThrough++;

      // For tweets that passed sarcasm filter, analyze note status
      const noteStatusMatch = fullResult.match(/NOTE STATUS: (.+?)(?:\n|$)/);
      if (noteStatusMatch) {
        const status = noteStatusMatch[1].trim();
        // Only count the main status types
        if (status.includes("CORRECTION WITH TRUSTWORTHY CITATION") ||
            status.includes("CORRECTION WITHOUT TRUSTWORTHY CITATION") ||
            status.includes("NO MISSING CONTEXT") ||
            status.includes("TWEET NOT SIGNIFICANTLY INCORRECT")) {
          analysis.noteStatus[status] = (analysis.noteStatus[status] || 0) + 1;

          // Collect tweets with trustworthy citations for scoring analysis
          if (status.includes("CORRECTION WITH TRUSTWORTHY CITATION")) {
            trustworthyTweets.push(record);
          }
        } else {
          analysis.noteStatus["OTHER_STATUS"] = (analysis.noteStatus["OTHER_STATUS"] || 0) + 1;
        }
      } else {
        // Look for skip reasons that aren't sarcasm
        if (fullResult.includes("SKIP REASON:") && !fullResult.includes("SKIP REASON: Sarcasm filter:")) {
          const skipReasonMatch = fullResult.match(/SKIP REASON: (.+?)(?:\n|$)/);
          if (skipReasonMatch) {
            const reason = skipReasonMatch[1].trim();
            const statusKey = `SKIP: ${reason}`;
            analysis.noteStatus[statusKey] = (analysis.noteStatus[statusKey] || 0) + 1;
          }
        } else {
          // Fallback - unknown status
          analysis.noteStatus["UNKNOWN STATUS"] = (analysis.noteStatus["UNKNOWN STATUS"] || 0) + 1;
        }
      }
    }
  });

  // Analyze scoring filters for tweets with trustworthy citations
  console.log(`\n=== DEBUGGING TRUSTWORTHY TWEETS (${trustworthyTweets.length} tweets) ===`);

  trustworthyTweets.forEach((record, index) => {
    const fullResult = record.fields["Full Result"] || "";

    console.log(`\n--- Trustworthy Tweet ${index + 1} ---`);
    console.log(`URL: ${record.fields["URL"]}`);
    console.log(`Would be posted: ${record.fields["Would be posted"]}`);

    // Check if there are score fields directly in the record
    if (record.fields["UrlValidity score"]) {
      console.log(`UrlValidity score: ${record.fields["UrlValidity score"]}`);
    }
    if (record.fields["ClaimOpinion score"]) {
      console.log(`ClaimOpinion score: ${record.fields["ClaimOpinion score"]}`);
    }
    if (record.fields["HarassmentAbuse score"]) {
      console.log(`HarassmentAbuse score: ${record.fields["HarassmentAbuse score"]}`);
    }

    // Look for scoring pattern: FILTER SCORES:
    const urlScoreMatch = fullResult.match(/- URL Score: ([\d.]+)/);
    const positiveScoreMatch = fullResult.match(/- Positive Claims Score: ([\d.]+)/);
    const disagreementScoreMatch = fullResult.match(/- Disagreement Score: ([\d.]+)/);
    const allPassedMatch = fullResult.match(/- All Passed: (true|false)/);

    if (urlScoreMatch && positiveScoreMatch && disagreementScoreMatch && allPassedMatch) {
      const urlScore = parseFloat(urlScoreMatch[1]);
      const positiveScore = parseFloat(positiveScoreMatch[1]);
      const disagreementScore = parseFloat(disagreementScoreMatch[1]);
      const allPassed = allPassedMatch[1] === 'true';

      console.log(`Found pipeline scores: URL=${urlScore}, Positive=${positiveScore}, Disagreement=${disagreementScore}, AllPassed=${allPassed}`);

      if (allPassed) {
        analysis.scoringFilters.passedAll++;
      } else {
        analysis.scoringFilters.failedScoring++;

        // Check which specific filters failed (score <= 0.5)
        if (urlScore <= 0.5) {
          analysis.scoringFilters.failureBreakdown.failedURL++;
        }
        if (positiveScore <= 0.5) {
          analysis.scoringFilters.failureBreakdown.failedPositive++;
        }
        if (disagreementScore <= 0.5) {
          analysis.scoringFilters.failureBreakdown.failedDisagreement++;
        }
      }
    } else {
      console.log("No pipeline scoring found in Full Result");
      // Show a snippet of the Full Result to debug
      console.log("Full Result snippet:", fullResult.substring(0, 500));
    }
  });

  return analysis;
}

function generateMermaidSankey(analysis: SankeyAnalysis): string {
  const lines = ['sankey', '', '%% source,target,value'];

  // Stage 1: Sarcasm Filter
  lines.push(`All Tweets,Sarcasm Filter Drop,${analysis.sarcasmFilter.droppedOut}`);
  lines.push(`All Tweets,Passed Sarcasm Filter,${analysis.sarcasmFilter.passedThrough}`);

  // Stage 2: Note Status
  lines.push(`Passed Sarcasm Filter,No Missing Context,${analysis.noteStatus['NO MISSING CONTEXT'] || 0}`);
  lines.push(`Passed Sarcasm Filter,Tweet Not Significantly Incorrect,${analysis.noteStatus['TWEET NOT SIGNIFICANTLY INCORRECT'] || 0}`);
  lines.push(`Passed Sarcasm Filter,Correction Without Citation,${analysis.noteStatus['CORRECTION WITHOUT TRUSTWORTHY CITATION'] || 0}`);
  lines.push(`Passed Sarcasm Filter,Other Status,${analysis.noteStatus['OTHER_STATUS'] || 0}`);
  lines.push(`Passed Sarcasm Filter,Correction With Citation,${analysis.noteStatus['CORRECTION WITH TRUSTWORTHY CITATION'] || 0}`);

  // Stage 3: Scoring Filters
  lines.push(`Correction With Citation,Passed All Scoring,${analysis.scoringFilters.passedAll}`);
  lines.push(`Correction With Citation,Failed Scoring,${analysis.scoringFilters.failedScoring}`);

  // Stage 4: Scoring Breakdown (for failed ones)
  if (analysis.scoringFilters.failureBreakdown.failedURL > 0) {
    lines.push(`Failed Scoring,Failed URL Score,${analysis.scoringFilters.failureBreakdown.failedURL}`);
  }
  if (analysis.scoringFilters.failureBreakdown.failedPositive > 0) {
    lines.push(`Failed Scoring,Failed Positive Score,${analysis.scoringFilters.failureBreakdown.failedPositive}`);
  }
  if (analysis.scoringFilters.failureBreakdown.failedDisagreement > 0) {
    lines.push(`Failed Scoring,Failed Disagreement Score,${analysis.scoringFilters.failureBreakdown.failedDisagreement}`);
  }

  return lines.join('\n');
}

function generateSarcasmFilterHtml(records: any[]): string {
  const sarcasmFiltered = records.filter(record => {
    const fullResult = record.fields["Full Result"] || "";
    return fullResult.includes("SKIP REASON: Sarcasm filter:");
  });

  let html = `<!DOCTYPE html>
<html>
<head>
    <title>Sarcasm Filter Rejected Tweets</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .tweet { border: 1px solid #ccc; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .tweet.filtered { background-color: #ffebee; } /* Light red for filtered (score <= 0.5) */
        .tweet.passed { background-color: #e8f5e8; } /* Light green for passed (score > 0.5) */
        .score { font-weight: bold; color: #d32f2f; }
        .text { margin: 10px 0; line-height: 1.4; }
        .count { color: #666; margin-bottom: 20px; }
        .controls { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #f5f5f5; }
        .checkbox { margin-right: 10px; }
        button { padding: 10px 20px; background-color: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; }
        button:hover { background-color: #1565c0; }
        .tweet-header { display: flex; align-items: center; margin-bottom: 10px; }
        .tweet-id { font-size: 0.9em; color: #666; margin-left: 10px; }
    </style>
</head>
<body>
    <h1>Tweets Rejected by Sarcasm Filter</h1>
    <div class="count">Total rejected: ${sarcasmFiltered.length} tweets</div>

    <div class="controls">
        <button onclick="selectAll()">Select All</button>
        <button onclick="selectNone()">Select None</button>
        <button onclick="saveSelected()">Save Selected IDs</button>
        <span id="selectedCount">0 selected</span>
    </div>
`;

  sarcasmFiltered.forEach((record, index) => {
    const fullResult = record.fields["Full Result"] || "";
    const initialText = record.fields["Initial post text"] || "";
    const url = record.fields["URL"] || "";
    const tweetId = url.split('/').pop() || "unknown";
    const sarcasmScoreMatch = fullResult.match(/SARCASM SCORE: ([\d.]+)/);
    const sarcasmScore = sarcasmScoreMatch ? parseFloat(sarcasmScoreMatch[1]) : 0;
    const scoreText = sarcasmScoreMatch ? sarcasmScoreMatch[1] : "Unknown";

    // Determine background class based on 0.5 threshold
    const backgroundClass = sarcasmScore <= 0.5 ? 'filtered' : 'passed';

    html += `
    <div class="tweet ${backgroundClass}">
        <div class="tweet-header">
            <input type="checkbox" class="checkbox tweet-checkbox" data-tweet-id="${tweetId}" onchange="updateSelectedCount()">
            <div class="score">Sarcasm Score: ${scoreText}</div>
            <div class="tweet-id">ID: ${tweetId}</div>
        </div>
        <div class="text">${initialText.replace(/\n/g, '<br>')}</div>
    </div>`;
  });

  html += `
    <script>
        function updateSelectedCount() {
            const checkboxes = document.querySelectorAll('.tweet-checkbox');
            const selected = document.querySelectorAll('.tweet-checkbox:checked');
            document.getElementById('selectedCount').textContent = selected.length + ' selected';
        }

        function selectAll() {
            const checkboxes = document.querySelectorAll('.tweet-checkbox');
            checkboxes.forEach(cb => cb.checked = true);
            updateSelectedCount();
        }

        function selectNone() {
            const checkboxes = document.querySelectorAll('.tweet-checkbox');
            checkboxes.forEach(cb => cb.checked = false);
            updateSelectedCount();
        }

        function saveSelected() {
            const selected = document.querySelectorAll('.tweet-checkbox:checked');
            const ids = Array.from(selected).map(cb => cb.dataset.tweetId);

            if (ids.length === 0) {
                alert('No tweets selected');
                return;
            }

            const content = ids.join('\\n');
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'selected-tweet-ids.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // Initialize count
        updateSelectedCount();
    </script>
</body>
</html>`;

  return html;
}

// Function to load and analyze existing JSON file instead of pulling from Airtable
async function analyzeExistingData(filename: string) {
  console.log(`Loading data from ${filename}...`);

  try {
    const filepath = join(process.cwd(), filename);
    const fileContent = readFileSync(filepath, 'utf8');
    const exportData = JSON.parse(fileContent);

    console.log(`Loaded ${exportData.recordCount} records from ${exportData.exportDate}`);

    // Analyze the data for sankey diagram
    const analysis = analyzeSankeyFlow(exportData.records);
    console.log('\n=== SANKEY FLOW ANALYSIS ===');
    console.log(JSON.stringify(analysis, null, 2));

    // Generate mermaid sankey diagram
    const mermaidCode = generateMermaidSankey(analysis);
    console.log('\n=== MERMAID SANKEY DIAGRAM ===');
    console.log(mermaidCode);

    // Generate HTML for sarcasm filtered tweets
    const sarcasmHtml = generateSarcasmFilterHtml(exportData.records);
    const htmlFilename = `data-export-sarcasm-filtered-${new Date().toISOString().replace(/[:.]/g, '-')}.html`;
    const htmlFilepath = join(process.cwd(), htmlFilename);
    writeFileSync(htmlFilepath, sarcasmHtml);
    console.log(`\nSarcasm filtered tweets HTML saved to: ${htmlFilename}`);

    return { data: exportData, analysis, mermaidCode, htmlFilename };
  } catch (error) {
    console.error('Error loading existing data:', error);
    throw error;
  }
}

if (require.main === module) {
  // Check if we have a filename argument to load existing data
  const filename = process.argv[2];
  if (filename) {
    analyzeExistingData(filename);
  } else {
    analyzeAirtableData();
  }
}