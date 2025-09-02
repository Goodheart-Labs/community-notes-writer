import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { AirtableDataFetcher, ResearchData } from './fetchAirtableData';
import { testPromptOnSample } from './testPrompt';

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
app.get('/api/model-info', (req, res) => {
  res.json({ 
    model: process.env.LLM_MODEL || 'anthropic/claude-sonnet-4',
    description: 'Claude Sonnet 4.1'
  });
});

// Get default prompt template
app.get('/api/default-prompt', async (req, res) => {
  const defaultPrompt = `TASK: Analyze this X post and determine if it contains factual errors that require correction.

CRITICAL ANALYSIS STEPS:
1. IDENTIFY THE SPECIFIC CLAIM: What exact factual assertion is the post making?
2. VERIFY ACCURACY: Do the search results directly contradict this specific claim?
3. SOURCE RELEVANCE: Do the sources directly address this claim (not general background)?
4. DIRECTNESS: Can you definitively say "this specific claim is false" based on the evidence?

ONLY correct posts with clear factual errors supported by direct, relevant sources. Avoid:
- General background context that doesn't contradict the claim
- Sources about different timeframes than what the post discusses  
- Correcting things the post never actually claimed
- Vague corrections that don't directly address the core assertion

Please start by responding with one of the following statuses "TWEET NOT SIGNIFICANTLY INCORRECT" "NO MISSING CONTEXT" "CORRECTION WITH TRUSTWORTHY CITATION" "CORRECTION WITHOUT TRUSTWORTHY CITATION"

Format:
[Status]
[Direct correction stating exactly what is wrong]
[URL that specifically contradicts the claim]

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
app.post('/api/test-prompt', async (req, res) => {
  try {
    const { promptTemplate, sampleSize = 10 } = req.body;
    
    if (!promptTemplate) {
      return res.status(400).json({ error: 'Prompt template is required' });
    }
    
    if (cachedData.length === 0) {
      await initializeData();
      if (cachedData.length === 0) {
        return res.status(500).json({ error: 'No data available' });
      }
    }
    
    // Get random samples
    const samples = getRandomSamples(cachedData, sampleSize);
    
    // Test prompt on each sample
    const results = await testPromptOnSample(samples, promptTemplate);
    
    res.json({ results });
  } catch (error) {
    console.error('Error testing prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

// Refresh data from Airtable
app.post('/api/refresh-data', async (req, res) => {
  try {
    cachedData = await dataFetcher.getResearchData(true); // Force refresh
    res.json({ success: true, count: cachedData.length });
  } catch (error) {
    console.error('Error refreshing data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get cached data stats
app.get('/api/data-stats', (req, res) => {
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