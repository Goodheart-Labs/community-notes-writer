import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Airtable from 'airtable';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.NOTE_VIEWER_PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY!,
}).base(process.env.AIRTABLE_BASE_ID!);

interface NoteEntry {
  id: string;
  url: string;
  botName: string;
  tweetText?: string;
  tweetBody?: any;
  finalNote?: string;
  fullResult?: string;
  wouldBePosted?: number;
  postedToX?: boolean;
  createdTime?: string;
  // Filter scores
  notSarcasmFilter?: number;
  characterCountFilter?: number;
  positiveClaimsFilter?: number;
  significantCorrectionFilter?: number;
  keywordsExtracted?: string;
}

// Fetch notes from Airtable with optional filters
app.get('/api/notes', async (req: Request, res: Response) => {
  try {
    const { 
      branch, 
      limit = 100,
      onlyPosted = false,
      onlyWouldPost = false 
    } = req.query;
    
    const notes: NoteEntry[] = [];
    
    // Build filter formula
    let filterParts: string[] = [];
    
    if (branch && branch !== 'all') {
      if (branch === 'main') {
        filterParts.push(`{Bot name} = 'main'`);
      } else {
        filterParts.push(`FIND('${branch}', {Bot name})`);
      }
    }
    
    if (onlyPosted === 'true') {
      filterParts.push(`{Posted to X} = TRUE()`);
    }
    
    if (onlyWouldPost === 'true') {
      filterParts.push(`{Would be posted} = 1`);
    }
    
    const filterFormula = filterParts.length > 0 
      ? `AND(${filterParts.join(', ')})` 
      : '';
    
    console.log('[note-viewer] Filter formula:', filterFormula);
    
    await base(process.env.AIRTABLE_TABLE_NAME!)
      .select({
        filterByFormula: filterFormula,
        maxRecords: parseInt(limit as string),
        sort: [{field: 'Created', direction: 'desc'}],
        fields: [
          'URL',
          'Bot name',
          'Initial post text',
          'Initial tweet body',
          'Final note',
          'Full Result',
          'Would be posted',
          'Posted to X',
          'Created',
          // Filter columns
          'Not sarcasm filter',
          'Character count filter',
          'Positive claims only filter',
          'Significant correction filter',
          'Keywords extracted'
        ],
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const entry: NoteEntry = {
            id: record.id,
            url: record.get('URL') as string || '',
            botName: record.get('Bot name') as string || '',
            tweetText: record.get('Initial post text') as string,
            finalNote: record.get('Final note') as string,
            fullResult: record.get('Full Result') as string,
            wouldBePosted: record.get('Would be posted') as number,
            postedToX: record.get('Posted to X') as boolean,
            createdTime: record.get('Created') as string,
            // Filter scores
            notSarcasmFilter: record.get('Not sarcasm filter') as number,
            characterCountFilter: record.get('Character count filter') as number,
            positiveClaimsFilter: record.get('Positive claims only filter') as number,
            significantCorrectionFilter: record.get('Significant correction filter') as number,
            keywordsExtracted: record.get('Keywords extracted') as string,
          };
          
          // Try to parse tweet body if it's a JSON string
          const tweetBodyRaw = record.get('Initial tweet body');
          if (tweetBodyRaw && typeof tweetBodyRaw === 'string') {
            try {
              entry.tweetBody = JSON.parse(tweetBodyRaw);
            } catch {
              entry.tweetBody = tweetBodyRaw;
            }
          }
          
          notes.push(entry);
        });
        fetchNextPage();
      });
    
    res.json({
      notes,
      count: notes.length,
    });
    
  } catch (error) {
    console.error('[note-viewer] Error fetching notes:', error);
    res.status(500).json({ 
      error: 'Failed to fetch notes',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get unique branch names
app.get('/api/branches', async (req: Request, res: Response) => {
  try {
    const branches = new Set<string>();
    
    await base(process.env.AIRTABLE_TABLE_NAME!)
      .select({
        fields: ['Bot name'],
        maxRecords: 1000,
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
    console.error('[note-viewer] Error fetching branches:', error);
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
  console.log(`Note Viewer running on http://localhost:${PORT}`);
});