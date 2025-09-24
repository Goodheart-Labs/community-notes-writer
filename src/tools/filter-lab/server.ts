import express, { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Airtable from "airtable";
import OpenAI from "openai";
import fs from "fs/promises";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.FILTER_LAB_PORT || 3003;

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname)));

// Initialize OpenRouter client using OpenAI SDK
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY?.trim(),
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://github.com/Goodheart-Labs/community-notes-writer",
    "X-Title": "Community Notes Filter Lab",
  },
});

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

// Helper function to escape strings for Airtable formulas
function escapeAirtableString(str: string): string {
  return str.replace(/'/g, "''");
}

interface Note {
  id: string;
  text: string;
  url?: string;
  status?: string;
  wouldBePosted: boolean;
  tweetText?: string;
  botName?: string;
}

interface Filter {
  id: number;
  name: string;
  active: boolean;
  prompt: string;
}

interface FilterResult {
  note: string;
  wouldBePosted: boolean;
  filterResults: { [filterName: string]: "PASS" | "FAIL" | "ERROR" };
  filterErrors?: { [filterName: string]: string };
  tweetUrl?: string;
  tweetText?: string;
}

// Fetch notes from Airtable
async function fetchNotes(source: string): Promise<Note[]> {
  const notes: Note[] = [];

  let filterFormula = "";
  switch (source) {
    case "recent":
      // Recent posted notes from main branch
      filterFormula = `AND({Final note} != '', {Bot name} = 'main', {Would be posted} = 1)`;
      break;
    case "badmiss":
      // Bad misses only
      filterFormula = `AND({Bad miss}, {Bot name} = 'main')`;
      break;
    case "all":
      // All recent notes with final note
      filterFormula = `{Final note} != ''`;
      break;
    default:
      filterFormula = `AND({Final note} != '', {Bot name} = 'main', {Would be posted} = 1)`;
  }

  console.log(`Fetching notes with filter: ${filterFormula}`);

  try {
    await table
      .select({
        pageSize: 100,
        filterByFormula: filterFormula,
        sort: [{ field: "Created", direction: "desc" }],
        maxRecords: 50,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const finalNote = record.get("Final note") as string;
          const url = record.get("URL") as string;
          const wouldBePosted = record.get("Would be posted") === 1;
          const botName = record.get("Bot name") as string;

          // Extract tweet text from Initial tweet body
          let tweetText = "";
          try {
            const tweetBody = record.get("Initial tweet body") as string;
            if (tweetBody) {
              const parsed = JSON.parse(tweetBody);
              tweetText = parsed.text || parsed.full_text || "";
            }
          } catch (e) {
            tweetText = (record.get("Initial tweet body") as string) || "";
          }

          // Extract status from Full Result
          let status = "";
          try {
            const fullResult = record.get("Full Result") as string;
            if (fullResult) {
              const statusMatch = fullResult.match(/Final status:\s*([^\n]+)/);
              if (statusMatch) {
                status = statusMatch[1]?.trim() || "";
              }
            }
          } catch (e) {
            // Ignore
          }

          if (finalNote) {
            notes.push({
              id: record.id,
              text: finalNote,
              url,
              status,
              wouldBePosted,
              tweetText,
              botName,
            });
          }
        });
        fetchNextPage();
      });

    console.log(`Fetched ${notes.length} notes`);
    return notes;
  } catch (error) {
    console.error("Error fetching notes:", error);
    throw error;
  }
}

// Run a single filter on a single note
async function runFilter(
  filter: Filter,
  note: string,
  post: string = ""
): Promise<{
  result: "PASS" | "FAIL" | "ERROR";
  error?: string;
  rawResponse?: string;
}> {
  try {
    // Replace placeholders with actual text
    let prompt = filter.prompt.replace(/\{note\}/g, note);
    prompt = prompt.replace(
      /\{post\}/g,
      post || "[No original post available]"
    );

    console.log(
      `[Filter: ${filter.name}] Running with prompt length: ${prompt.length} chars`
    );

    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-sonnet-4",
      messages: [
        {
          role: "system",
          content:
            'You are a Community Notes filter evaluator. Respond with ONLY the single word "PASS" or "FAIL" based on the criteria given. Do not include any other text, punctuation, or explanation.',
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1, // Lower temperature for more consistent responses
      max_tokens: 10,
    });

    const rawResult = response.choices[0]?.message?.content || "";
    // Clean up the result - just trim and uppercase
    const trimmed = rawResult.trim().toUpperCase();

    console.log(`[Filter: ${filter.name}] Raw response: "${rawResult}"`);

    // Check for exact matches first
    if (trimmed === "PASS" || trimmed === "FAIL") {
      return { result: trimmed as "PASS" | "FAIL" };
    }

    // Check for common variations with punctuation
    if (trimmed === "PASS." || trimmed === "PASS!" || trimmed === '"PASS"')
      return { result: "PASS" };
    if (trimmed === "FAIL." || trimmed === "FAIL!" || trimmed === '"FAIL"')
      return { result: "FAIL" };

    // Check if it starts with PASS or FAIL (might have explanation after)
    if (trimmed.startsWith("PASS")) return { result: "PASS" };
    if (trimmed.startsWith("FAIL")) return { result: "FAIL" };

    // Check if PASS or FAIL appears anywhere in the response
    const cleanedAlpha = trimmed.replace(/[^A-Z]/g, "");
    if (cleanedAlpha === "PASS" || cleanedAlpha === "FAIL") {
      return { result: cleanedAlpha as "PASS" | "FAIL" };
    }

    // Return ERROR with the actual response the LLM gave
    console.warn(
      `[Filter: ${filter.name}] Unexpected response: "${rawResult}"`
    );
    return {
      result: "ERROR",
      error: `LLM responded with: "${rawResult}"`,
      rawResponse: rawResult,
    };
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error(`[Filter: ${filter.name}] Error:`, errorMsg);
    return {
      result: "ERROR",
      error: errorMsg,
    };
  }
}

// API Routes

// Get default filters
app.get(
  "/api/filter-lab/default-filters",
  async (req: Request, res: Response) => {
    try {
      const filtersPath = path.join(__dirname, "defaultFilters.json");
      const filtersData = await fs.readFile(filtersPath, "utf-8");
      const filters = JSON.parse(filtersData);
      res.json({ filters });
    } catch (error: any) {
      console.error("Error loading default filters:", error);
      // Return empty array if file doesn't exist
      res.json({ filters: [] });
    }
  }
);

// Get notes
app.get("/api/filter-lab/notes", async (req: Request, res: Response) => {
  try {
    const source = (req.query.source as string) || "recent";
    const notes = await fetchNotes(source);

    res.json({ notes });
  } catch (error: any) {
    console.error("Error fetching notes:", error);
    res.status(500).json({ error: error.message || "Failed to fetch notes" });
  }
});

// Run filters on notes
app.post("/api/filter-lab/run", async (req: Request, res: Response) => {
  try {
    const { filters, notes } = req.body as { filters: Filter[]; notes: Note[] };

    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return res.status(400).json({ error: "No filters provided" });
    }

    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return res.status(400).json({ error: "No notes provided" });
    }

    const activeFilters = filters.filter((f) => f.active);
    if (activeFilters.length === 0) {
      return res.status(400).json({ error: "No active filters" });
    }

    console.log(
      `Running ${activeFilters.length} filters on ${notes.length} notes`
    );

    const results: FilterResult[] = [];

    // Process each note
    for (const note of notes) {
      const filterResults: { [filterName: string]: "PASS" | "FAIL" | "ERROR" } =
        {};
      const filterErrors: { [filterName: string]: string } = {};

      // Run each filter on this note
      for (const filter of activeFilters) {
        console.log(`Running filter "${filter.name}" on note ${note.id}`);
        const filterResponse = await runFilter(
          filter,
          note.text,
          note.tweetText || ""
        );
        filterResults[filter.name] = filterResponse.result;
        if (filterResponse.error) {
          filterErrors[filter.name] = filterResponse.error;
        }
      }

      results.push({
        note: note.text,
        wouldBePosted: note.wouldBePosted,
        filterResults,
        filterErrors:
          Object.keys(filterErrors).length > 0 ? filterErrors : undefined,
        tweetUrl: note.url,
        tweetText: note.tweetText,
      });
    }

    // Calculate statistics
    const stats = {
      totalNotes: notes.length,
      totalFilters: activeFilters.length,
      filterPassRates: {} as {
        [filterName: string]: { pass: number; fail: number; error: number };
      },
    };

    activeFilters.forEach((filter) => {
      stats.filterPassRates[filter.name] = { pass: 0, fail: 0, error: 0 };
    });

    results.forEach((result) => {
      Object.entries(result.filterResults).forEach(([filterName, status]) => {
        if (!stats.filterPassRates[filterName]) {
          stats.filterPassRates[filterName] = { pass: 0, fail: 0, error: 0 };
        }
        if (status === "PASS") stats.filterPassRates[filterName].pass++;
        else if (status === "FAIL") stats.filterPassRates[filterName].fail++;
        else stats.filterPassRates[filterName].error++;
      });
    });

    console.log("Filter run complete:", stats);

    res.json({ results, stats });
  } catch (error: any) {
    console.error("Error running filters:", error);
    res.status(500).json({ error: error.message || "Failed to run filters" });
  }
});

// Serve the HTML page
app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`Filter Lab server running on http://localhost:${PORT}`);
  console.log(`Using OpenRouter with Claude Sonnet 4 for filter evaluation`);
});
