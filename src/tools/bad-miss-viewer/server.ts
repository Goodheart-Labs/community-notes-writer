import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Airtable from 'airtable';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.BAD_MISS_VIEWER_PORT || 3004;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY!,
}).base(process.env.AIRTABLE_BASE_ID!);

interface BadMiss {
  id: string;
  url: string;
  botName: string;
  tweetText?: string;
  finalNote?: string;
  fullResult?: string;
  wouldBePosted?: number;
  nathanScore?: number;
  createdTime?: string;
  // Filter scores
  notSarcasmFilter?: number;
  urlFilter?: number;
  characterCountFilter?: number;
  positiveClaimsFilter?: number;
  significantCorrectionFilter?: number;
}

// Fetch bad misses from Airtable
app.get('/api/bad-misses', async (req: Request, res: Response) => {
  try {
    const {
      branch = 'all',
      hours = '8'
    } = req.query;

    const hoursBack = parseInt(hours as string);
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hoursBack);
    const dateStr = startDate.toISOString();

    const badMisses: BadMiss[] = [];

    // Build filter formula
    let filterParts: string[] = [
      `{Would be posted} = 1`,
      `{Would Nathan have posted?} != BLANK()`,
      `{Would Nathan have posted?} < 0.5`,
      `IS_AFTER({Created}, '${dateStr}')`
    ];

    if (branch && branch !== 'all') {
      filterParts.push(`{Bot name} = '${branch}'`);
    }

    const filterFormula = `AND(${filterParts.join(', ')})`;

    console.log('[bad-miss-viewer] Filter formula:', filterFormula);

    await base(process.env.AIRTABLE_TABLE_NAME!)
      .select({
        filterByFormula: filterFormula,
        sort: [{field: 'Created', direction: 'desc'}],
        fields: [
          'URL',
          'Bot name',
          'Initial post text',
          'Final note',
          'Full Result',
          'Would be posted',
          'Would Nathan have posted?',
          'Created',
          'Not sarcasm filter',
          'URL filter',
          'Character count filter',
          'Positive claims only filter',
          'Significant correction filter'
        ],
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const entry: BadMiss = {
            id: record.id,
            url: record.get('URL') as string || '',
            botName: record.get('Bot name') as string || '',
            tweetText: record.get('Initial post text') as string,
            finalNote: record.get('Final note') as string,
            fullResult: record.get('Full Result') as string,
            wouldBePosted: record.get('Would be posted') as number,
            nathanScore: record.get('Would Nathan have posted?') as number,
            createdTime: record.get('Created') as string,
            notSarcasmFilter: record.get('Not sarcasm filter') as number,
            urlFilter: record.get('URL filter') as number,
            characterCountFilter: record.get('Character count filter') as number,
            positiveClaimsFilter: record.get('Positive claims only filter') as number,
            significantCorrectionFilter: record.get('Significant correction filter') as number,
          };

          badMisses.push(entry);
        });
        fetchNextPage();
      });

    res.json({
      badMisses,
      count: badMisses.length,
    });

  } catch (error) {
    console.error('[bad-miss-viewer] Error fetching bad misses:', error);
    res.status(500).json({
      error: 'Failed to fetch bad misses',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get unique branch names that have bad misses in the time range
app.get('/api/branches', async (req: Request, res: Response) => {
  try {
    const { hours = '8' } = req.query;

    const hoursBack = parseInt(hours as string);
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hoursBack);
    const dateStr = startDate.toISOString();

    const branches = new Set<string>();

    // Only fetch branches that have bad misses in the selected time range
    const filterFormula = `AND({Would be posted} = 1, {Would Nathan have posted?} != BLANK(), {Would Nathan have posted?} < 0.5, IS_AFTER({Created}, '${dateStr}'))`;

    await base(process.env.AIRTABLE_TABLE_NAME!)
      .select({
        filterByFormula: filterFormula,
        fields: ['Bot name'],
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const botName = record.get('Bot name') as string;
          if (botName) {
            branches.add(botName);
          }
        });
        fetchNextPage();
      });

    res.json({
      branches: Array.from(branches).sort(),
    });

  } catch (error) {
    console.error('[bad-miss-viewer] Error fetching branches:', error);
    res.status(500).json({
      error: 'Failed to fetch branches',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Serve the HTML file
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Bad Miss Viewer running on http://localhost:${PORT}`);
});
