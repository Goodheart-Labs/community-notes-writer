import express, { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import Airtable from "airtable";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.BAD_MISS_PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize Airtable
const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;
const tableName = process.env.AIRTABLE_TABLE_NAME;

if (!apiKey || !baseId || !tableName) {
  throw new Error(
    "Missing required environment variables: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME"
  );
}

const base = new Airtable({ apiKey }).base(baseId);
const table = base(tableName);

interface BadMissEntry {
  id: string;
  url: string;
  tweetText: string;
  postedNote: string;
  status: string;
  createdAt: string;
  branches?: BranchOutput[];
}

interface BranchOutput {
  name: string;
  note: string;
  status: string;
  wouldPost: boolean;
}

// Cache for bad misses
let cachedBadMisses: BadMissEntry[] = [];

// Helper function to escape strings for Airtable formulas
function escapeAirtableString(str: string): string {
  // In Airtable formulas, single quotes are escaped by doubling them
  // and the string should be wrapped in single quotes
  return str.replace(/'/g, "''");
}
let lastCacheUpdate = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Parse full result to extract data
function parseFullResult(fullResult: string): {
  tweetText: string;
  note: string;
  status: string;
} {
  const result = {
    tweetText: "",
    note: "",
    status: "",
  };

  // Extract tweet text
  const tweetTextMatch = fullResult.match(
    /TWEET TEXT:\n([\s\S]*?)\n\nSEARCH CONTEXT:/
  );
  result.tweetText = tweetTextMatch?.[1]?.trim() || "";

  // Extract note
  const noteMatch = fullResult.match(/NOTE:\n- Note: ([\s\S]*?)\n- URL:/);
  result.note = noteMatch?.[1]?.trim() || "";

  // Extract status
  const statusMatch = fullResult.match(/- Status: ([^\n]+)/);
  result.status = statusMatch?.[1]?.trim() || "";

  return result;
}

// Fetch bad misses from Airtable
async function fetchBadMisses(
  branchFilter: string = "main",
  hoursFilter: string = "all"
): Promise<BadMissEntry[]> {
  const badMisses: BadMissEntry[] = [];
  const urlMap = new Map<string, BadMissEntry>();

  // Build filter formula - Bad miss checkbox is checked
  let filterParts = ["{Bad miss}"];

  if (branchFilter === "main") {
    filterParts.push('{Bot name} = "main"');
  }

  // Add time filter if not 'all'
  if (hoursFilter !== "all") {
    const hours = parseInt(hoursFilter);
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    filterParts.push(`DATETIME_DIFF(NOW(), {Created}, 'hours') <= ${hours}`);
  }

  const filterFormula = `AND(${filterParts.join(", ")})`;

  console.log(`Fetching bad misses with filter: ${filterFormula}`);

  try {
    // First, fetch main branch bad misses
    await table
      .select({
        pageSize: 100,
        filterByFormula: filterFormula,
        sort: [{ field: "Created", direction: "desc" }],
        maxRecords: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const url = record.get("URL") as string;
          const fullResult = record.get("Full Result") as string;
          const finalNote = record.get("Final note") as string;
          const botName = record.get("Bot name") as string;
          const createdAt = record.get("Created") as string;

          if (url && fullResult) {
            const parsed = parseFullResult(fullResult);

            if (botName === "main") {
              // This is a main branch bad miss
              const entry: BadMissEntry = {
                id: record.id,
                url,
                tweetText: parsed.tweetText,
                postedNote: finalNote || parsed.note,
                status: parsed.status,
                createdAt,
                branches: [],
              };

              urlMap.set(url, entry);
              badMisses.push(entry);
            }
          }
        });
        fetchNextPage();
      });

    // If we want all branches, fetch other branch outputs for the same URLs
    if (branchFilter === "all" && badMisses.length > 0) {
      const urls = Array.from(urlMap.keys());

      // Fetch other branch outputs for these URLs
      for (const url of urls) {
        await table
          .select({
            pageSize: 100,
            filterByFormula: `AND({URL} = '${escapeAirtableString(
              url
            )}', {Bot name} != 'main')`,
            sort: [{ field: "Created", direction: "desc" }],
          })
          .eachPage((records, fetchNextPage) => {
            records.forEach((record) => {
              const fullResult = record.get("Full Result") as string;
              const finalNote = record.get("Final note") as string;
              const botName = record.get("Bot name") as string;
              const wouldPost = record.get("Would be posted") as number;

              if (fullResult) {
                const parsed = parseFullResult(fullResult);

                const branchOutput: BranchOutput = {
                  name: botName,
                  note: finalNote || parsed.note,
                  status: parsed.status,
                  wouldPost: wouldPost === 1,
                };

                const entry = urlMap.get(url);
                if (entry && entry.branches) {
                  entry.branches.push(branchOutput);
                }
              }
            });
            fetchNextPage();
          });
      }
    }

    console.log(`Found ${badMisses.length} bad misses`);
    return badMisses;
  } catch (error) {
    console.error("Error fetching bad misses:", error);
    throw error;
  }
}

// API Routes

// Get bad misses
app.get("/api/bad-misses", async (req: Request, res: Response) => {
  try {
    const branchFilter = (req.query.branch as string) || "main";
    const hoursFilter = (req.query.hours as string) || "all";

    // Check cache
    const now = Date.now();
    if (cachedBadMisses.length > 0 && now - lastCacheUpdate < CACHE_DURATION) {
      // Filter cached data based on parameters
      let filtered = cachedBadMisses;

      if (hoursFilter !== "all") {
        const hours = parseInt(hoursFilter);
        const cutoff = new Date(now - hours * 60 * 60 * 1000);
        filtered = filtered.filter((m) => new Date(m.createdAt) > cutoff);
      }

      res.json({
        badMisses: filtered,
        total: filtered.length,
        fromCache: true,
      });
      return;
    }

    // Fetch fresh data
    const badMisses = await fetchBadMisses(branchFilter, hoursFilter);

    // Update cache
    cachedBadMisses = badMisses;
    lastCacheUpdate = now;

    res.json({
      badMisses,
      total: badMisses.length,
      fromCache: false,
    });
  } catch (error) {
    console.error("Error getting bad misses:", error);
    res.status(500).json({ error: "Failed to fetch bad misses" });
  }
});

// Refresh bad misses from Airtable
app.post("/api/refresh-bad-misses", async (req: Request, res: Response) => {
  try {
    const badMisses = await fetchBadMisses("all", "all");

    // Update cache
    cachedBadMisses = badMisses;
    lastCacheUpdate = Date.now();

    res.json({
      success: true,
      count: badMisses.length,
    });
  } catch (error) {
    console.error("Error refreshing bad misses:", error);
    res.status(500).json({ error: "Failed to refresh bad misses" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\nBad Miss Analysis Server running at http://localhost:${PORT}`);
  console.log("Open the URL above in your browser to view bad misses!");
});
