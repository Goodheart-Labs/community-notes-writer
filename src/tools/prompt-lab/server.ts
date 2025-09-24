import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { AirtableDataFetcher, ResearchData } from './fetchAirtableData';
import { testPromptOnSample } from './testPrompt';
import { PromptLabError } from './errors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PROMPT_LAB_PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Data fetcher instance
const dataFetcher = new AirtableDataFetcher();
let cachedData: ResearchData[] = [];

// Initialize data on startup
async function initializeData() {
  try {
    cachedData = await dataFetcher.getResearchData();
    console.log(`Loaded ${cachedData.length} research records`);
  } catch (error) {
    console.error('Error loading initial data:', error);
  }
}

// API Routes

// Get model info
app.get('/api/model-info', (req: Request, res: Response) => {
  res.json({ 
    model: process.env.LLM_MODEL || 'anthropic/claude-sonnet-4',
    description: 'Claude Sonnet 4.1'
  });
});

// Get default prompt template
app.get('/api/default-prompt', async (req: Request, res: Response) => {
  const defaultPrompt = `TASK: Analyze this X post and determine if it contains inaccuracies that require additional context, then write a note to provide that additional context.

CRITICAL ANALYSIS STEPS:
1. IDENTIFY THE SPECIFIC CLAIM: What exact factual assertion is the post making?
2. CONSIDER POSSIBLE CONFLICT: Do the search results suggest that significant additional context is required
3. CHOOSE SOURCES: Choose 1 - 3 sources you are going to include
4. SOURCE RELEVANCE: Do the sources directly address all aspects of the additional context (literally check the sentences in the research and which sources you've chosen)?

Please write the note in the following fashion:
- Give the additional relevant context.
- Generally do not attempt to summarise the original tweet or say "This tweet is false"
- Only refer to "errors" in the original tweet if it is required to make clear how the context is relevant.
- *DO NOT* discuss there being a lack of evidence/reports for something unless the source you're going to include says exactly that. The world is fast moving and new evidence may have appeared. ONLY say what you know from the source that is linked
- *DO NOT* refer to sources that you have not provided a link to. 
- The note *MUST* be fewer than 280 characters, with URLS only counting as 1

If the context supports the original claim, please respond with "TWEET NOT SIGNIFICANTLY INCORRECT" rather than "CORRECTION WITH TRUSTWORTHY CITATION". 

Please start by responding with one of the following statuses "TWEET NOT SIGNIFICANTLY INCORRECT" "NO MISSING CONTEXT" "CORRECTION WITH TRUSTWORTHY CITATION" "CORRECTION WITHOUT TRUSTWORTHY CITATION"

Note examples:

Bad note: 

The claim that President Trump "has reportedly not been seen in several days" and rumors of his death are false. Trump has had recent public activity and political actions as recently as August 29, 2025, according to verified news reports.

[link]

Good note:

Trump was seen golfing on August 29, 2025, according to Reuters. 

[link]

Explanation:

Do not summarise or editorialise on the original post. His death might be real for all we know. But what we do know is that there was evidence of his public appearances and activities on August 29, 2025. So that is what we will say, and then provide a link. 

Bad note:

Post falsely claims UP is #1 in factories (15.91%) and GVA (25.03%). ASI 2023-24 shows UP ranks 4th in factories with 8.51%, behind Tamil Nadu, Gujarat, Maharashtra. UP's GVA share is 7%, not 25.03%.

[Link]

Good note:

ASI 2023-24 shows Uttar Pradesh ranks 4th in factories with 8.51%, behind Tamil Nadu, Gujarat, Maharashtra. UP's GVA share is 7%, not 25.03% as claimed.

[Link]

Explanation:

Bad note attempts to summarise original post. Readers don't need this, they can see it. Also it says the post is false. Instead we prefer to provide additional context.

Bad note:

This photograph is not from Rudy Giuliani's car accident. News reports describe Giuliani being "struck from behind at high speed," while this image shows a head-on collision that doesn't match the incident description.

[Link]

Good note

News reports describe Giuliani being "struck from behind at high speed," while this image shows a head-on collision that doesn't match the incident description.

Explanation:

We don't say what the photo is or is not. Instead we give context for why the photo is likely wrong. 

[Link]

Output format:

[Reasoning]

Status:
[Status]

Note:
[Clear additional context relating to the most important inaccurate claim]
[URL that specifically supports that additional context]

Post perhaps in need of community note:
\`\`\`
{tweetText}
\`\`\`

Perplexity search results:
\`\`\`
{searchResults}

Citations:
\`\`\`
{citations}
\`\`\``;

  res.json({ prompt: defaultPrompt });
});

// Test prompt on random samples
app.post('/api/test-prompt', async (req: Request, res: Response) => {
  try {
    const { promptTemplate, sampleSize = 10, badMissesOnly = false } = req.body;
    
    if (!promptTemplate) {
      return res.status(400).json({ error: 'Prompt template is required' });
    }
    
    // Log the prompt template to terminal for review
    const timestamp = new Date().toISOString();
    console.log('\n' + '='.repeat(80));
    console.log(`PROMPT TEMPLATE USED AT ${timestamp}`);
    console.log(`Bad Misses Only: ${badMissesOnly}`);
    console.log(`Sample Size: ${sampleSize}`);
    console.log('-'.repeat(80));
    console.log(promptTemplate);
    console.log('='.repeat(80) + '\n');
    
    // Also save to a history file
    const historyPath = path.join(__dirname, 'prompt-history.log');
    const historyEntry = `
${'='.repeat(80)}
TIMESTAMP: ${timestamp}
BAD_MISSES_ONLY: ${badMissesOnly}
SAMPLE_SIZE: ${sampleSize}
${'-'.repeat(80)}
${promptTemplate}
${'='.repeat(80)}

`;
    fs.appendFileSync(historyPath, historyEntry);
    
    // For bad misses, always fetch fresh data
    let dataToUse = cachedData;
    if (badMissesOnly) {
      console.log('Fetching bad misses for prompt testing...');
      dataToUse = await dataFetcher.getResearchData(true, true);
      if (dataToUse.length === 0) {
        return res.status(404).json({ error: 'No bad misses found' });
      }
    } else if (cachedData.length === 0) {
      await initializeData();
      dataToUse = cachedData;
      if (dataToUse.length === 0) {
        return res.status(500).json({ error: 'No data available' });
      }
    }
    
    // Get random samples
    const samples = getRandomSamples(dataToUse, sampleSize);
    
    // Test prompt on each sample
    const results = await testPromptOnSample(samples, promptTemplate);
    
    res.json({ results, isBadMissData: badMissesOnly });
  } catch (error) {
    console.error('Error testing prompt:', error);
    const promptError = PromptLabError.fromUnknown(error, 'Failed to test prompt');
    res.status(promptError.statusCode).json({ error: promptError.message });
  }
});

// Refresh data from Airtable
app.post('/api/refresh-data', async (req: Request, res: Response) => {
  try {
    cachedData = await dataFetcher.getResearchData(true); // Force refresh
    res.json({ success: true, count: cachedData.length });
  } catch (error) {
    console.error('Error refreshing data:', error);
    const promptError = PromptLabError.fromUnknown(error, 'Failed to refresh data');
    res.status(promptError.statusCode).json({ error: promptError.message });
  }
});

// Get cached data stats
app.get('/api/data-stats', (req: Request, res: Response) => {
  res.json({
    count: cachedData.length,
    hasData: cachedData.length > 0
  });
});

// Utility function to get random samples
function getRandomSamples<T>(array: T[], n: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(n, array.length));
}

// Start server
async function start() {
  await initializeData();
  
  app.listen(PORT, () => {
    console.log(`\nPrompt Testing Lab Server running at http://localhost:${PORT}`);
    console.log(`Loaded ${cachedData.length} research records`);
    console.log('\nOpen the URL above in your browser to start testing prompts!');
  });
}

start().catch(console.error);