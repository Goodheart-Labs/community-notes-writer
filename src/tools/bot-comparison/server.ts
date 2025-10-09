import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Airtable from 'airtable';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.BOT_COMPARISON_PORT || 3006;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY!,
}).base(process.env.AIRTABLE_BASE_ID!);

interface BotRecord {
  id: string;
  url: string;
  botName: string;
  initialPostText: string;
  initialTweetBody: string;
  finalNote?: string;
  wouldBePosted?: number;
  createdTime: string;
  fullResult?: string;
  notSarcasmFilter?: number;
  urlValidityFilter?: number;
  urlSourceFilter?: number;
  positiveClaimsFilter?: number;
  significantCorrectionFilter?: number;
  helpfulnessPrediction?: number;
  xApiScore?: number;
  nathanScore?: number;
  skipReason?: string;
}

app.get('/api/comparison', async (req: Request, res: Response) => {
  try {
    const { limit = '50' } = req.query;
    const maxRecords = parseInt(limit as string);

    // Group records by URL
    const tweetMap = new Map<string, BotRecord[]>();

    await base(process.env.AIRTABLE_TABLE_NAME!)
      .select({
        sort: [{ field: 'Created', direction: 'desc' }],
        maxRecords: maxRecords * 10, // Fetch more to ensure we get enough unique tweets
        fields: [
          'URL',
          'Bot name',
          'Initial post text',
          'Initial tweet body',
          'Final note',
          'Would be posted',
          'Created',
          'Full Result',
          'Not sarcasm filter',
          // 'URL Validity filter',  // TODO: Add these fields to Airtable
          // 'URL Source filter',     // TODO: Add these fields to Airtable
          'Positive claims only filter',
          'Significant correction filter',
          'Helpfulness Prediction',
          'X API Score',
          'Would Nathan have posted?',
        ],
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const url = record.get('URL') as string || '';
          const botRecord: BotRecord = {
            id: record.id,
            url,
            botName: record.get('Bot name') as string || '',
            initialPostText: record.get('Initial post text') as string || '',
            initialTweetBody: record.get('Initial tweet body') as string || '',
            finalNote: record.get('Final note') as string,
            wouldBePosted: record.get('Would be posted') as number,
            createdTime: record.get('Created') as string,
            fullResult: record.get('Full Result') as string,
            notSarcasmFilter: record.get('Not sarcasm filter') as number,
            urlValidityFilter: undefined, // record.get('URL Validity filter') as number,
            urlSourceFilter: undefined, // record.get('URL Source filter') as number,
            positiveClaimsFilter: record.get('Positive claims only filter') as number,
            significantCorrectionFilter: record.get('Significant correction filter') as number,
            helpfulnessPrediction: record.get('Helpfulness Prediction') as number,
            xApiScore: record.get('X API Score') as number,
            nathanScore: record.get('Would Nathan have posted?') as number,
            skipReason: undefined, // TODO: Add this field to Airtable if needed
          };

          if (!tweetMap.has(url)) {
            tweetMap.set(url, []);
          }
          tweetMap.get(url)!.push(botRecord);
        });
        fetchNextPage();
      });

    // Convert to array and take only the most recent N tweets
    const tweets = Array.from(tweetMap.entries())
      .map(([url, bots]) => ({
        url,
        tweetText: bots[0]?.initialPostText || '',
        tweetBody: bots[0]?.initialTweetBody || '',
        bots: bots.sort((a, b) => a.botName.localeCompare(b.botName)),
        latestTimestamp: Math.max(...bots.map(b => new Date(b.createdTime).getTime())),
      }))
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
      .slice(0, maxRecords);

    // Get all unique bot names
    const allBotNames = new Set<string>();
    tweets.forEach(tweet => {
      tweet.bots.forEach(bot => allBotNames.add(bot.botName));
    });

    res.json({
      tweets,
      botNames: Array.from(allBotNames).sort(),
      totalTweets: tweets.length,
    });

  } catch (error) {
    console.error('[bot-comparison] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch comparison data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/update-nathan-score', async (req: Request, res: Response) => {
  try {
    const { recordId, score } = req.body;

    if (!recordId || score === undefined) {
      return res.status(400).json({ error: 'Missing recordId or score' });
    }

    await base(process.env.AIRTABLE_TABLE_NAME!).update(recordId, {
      'Would Nathan have posted?': score,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[bot-comparison] Error updating Nathan score:', error);
    res.status(500).json({
      error: 'Failed to update Nathan score',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Bot Comparison running on http://localhost:${PORT}`);
});
