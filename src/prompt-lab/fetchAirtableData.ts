import Airtable from "airtable";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ResearchData {
  id: string;
  url: string;
  tweetText: string;
  searchResults: string;
  citations: string[];
  originalNote: string;
  status: string;
  createdAt: string;
}

export class AirtableDataFetcher {
  private base: Airtable.Base;
  private tableName: string;
  private cacheFile: string;

  constructor() {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME;

    if (!apiKey || !baseId || !tableName) {
      throw new Error(
        "Missing required environment variables: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME"
      );
    }

    this.base = new Airtable({ apiKey }).base(baseId);
    this.tableName = tableName;
    this.cacheFile = path.join(__dirname, "research-cache.json");
  }

  parseFullResult(fullResult: string): Partial<ResearchData> {
    const result: Partial<ResearchData> = {};

    // Extract tweet text
    const tweetTextMatch = fullResult.match(/TWEET TEXT:\n([\s\S]*?)\n\nSEARCH CONTEXT:/);
    result.tweetText = tweetTextMatch?.[1]?.trim() || "";

    // Extract search results
    const searchResultsMatch = fullResult.match(/- Search results: ([\s\S]*?)\n- Citations:/);
    result.searchResults = searchResultsMatch?.[1]?.trim() || "";

    // Extract citations
    const citationsMatch = fullResult.match(/- Citations: ([^\n]+)/);
    const citationsStr = citationsMatch?.[1] || "";
    result.citations = citationsStr !== "None" && citationsStr 
      ? citationsStr.split(", ").map(c => c.trim()) 
      : [];

    // Extract status
    const statusMatch = fullResult.match(/- Status: ([^\n]+)/);
    result.status = statusMatch?.[1] || "";

    return result;
  }

  async fetchLatestNotes(limit: number = 50, badMissesOnly: boolean = false): Promise<ResearchData[]> {
    const records: ResearchData[] = [];

    const filterType = badMissesOnly ? 'bad misses' : 'posted notes';
    console.log(`Fetching last ${limit} ${filterType} from main branch...`);

    // Build filter formula based on whether we want bad misses or all posted notes
    const filterFormula = badMissesOnly 
      ? 'AND({Bad miss}, {Bot name} = "main")'
      : 'AND({Would be posted} = 1, {Bot name} = "main")';

    await this.base(this.tableName)
      .select({
        pageSize: 100,
        filterByFormula: filterFormula,
        sort: [{ field: "Created", direction: "desc" }],
        maxRecords: limit
      })
      .eachPage((fetchedRecords, fetchNextPage) => {
        fetchedRecords.forEach(record => {
          const fields = record.fields;
          
          if (fields["Full Result"] && fields["Final note"]) {
            const fullResult = fields["Full Result"] as string;
            const parsedData = this.parseFullResult(fullResult);
            
            records.push({
              id: record.id,
              url: fields.URL as string || "",
              tweetText: parsedData.tweetText || "",
              searchResults: parsedData.searchResults || "",
              citations: parsedData.citations || [],
              originalNote: fields["Final note"] as string || "",
              status: parsedData.status || "",
              createdAt: fields.Created as string || ""
            });
          }
        });
        fetchNextPage();
      });

    console.log(`Fetched ${records.length} records from Airtable`);
    return records;
  }

  saveToCache(data: ResearchData[]): void {
    const cacheData = {
      timestamp: new Date().toISOString(),
      count: data.length,
      data: data
    };
    
    fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
    console.log(`Cached ${data.length} records to ${this.cacheFile}`);
  }

  loadFromCache(): { data: ResearchData[], timestamp: string } | null {
    if (!fs.existsSync(this.cacheFile)) {
      return null;
    }

    try {
      const cacheContent = fs.readFileSync(this.cacheFile, "utf-8");
      const cacheData = JSON.parse(cacheContent);
      
      // Check if cache is less than 1 hour old
      const cacheAge = Date.now() - new Date(cacheData.timestamp).getTime();
      const oneHour = 60 * 60 * 1000;
      
      if (cacheAge < oneHour) {
        console.log(`Loading ${cacheData.count} records from cache (${Math.round(cacheAge / 60000)} minutes old)`);
        return cacheData;
      } else {
        console.log("Cache is stale, will fetch fresh data");
        return null;
      }
    } catch (error) {
      console.error("Error loading cache:", error);
      return null;
    }
  }

  async getResearchData(forceRefresh: boolean = false, badMissesOnly: boolean = false): Promise<ResearchData[]> {
    // For bad misses, always fetch fresh data (don't use cache)
    if (!forceRefresh && !badMissesOnly) {
      const cached = this.loadFromCache();
      if (cached) {
        return cached.data;
      }
    }

    const data = await this.fetchLatestNotes(50, badMissesOnly);
    // Only cache non-bad-miss data
    if (!badMissesOnly) {
      this.saveToCache(data);
    }
    return data;
  }
}

// CLI usage
if (process.argv[1] === __filename) {
  async function main() {
    const fetcher = new AirtableDataFetcher();
    const data = await fetcher.getResearchData();
    console.log(`\nSuccessfully fetched and cached ${data.length} research records`);
    console.log(`Cache location: ${path.join(path.dirname(__filename), "research-cache.json")}`);
  }
  
  main().catch(console.error);
}