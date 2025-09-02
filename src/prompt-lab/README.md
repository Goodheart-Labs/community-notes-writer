# Community Notes Prompt Testing Lab

A web-based tool for rapidly iterating on Community Notes generation prompts using real data from Airtable.

## Features

- **Live Prompt Testing**: Test custom prompt templates on real community notes data
- **Random Sampling**: Test on random samples of 10 notes to avoid overfitting
- **Side-by-Side Comparison**: Compare your generated notes with the original ones
- **Character Count Validation**: Automatic validation of the 275 character limit
- **Data Caching**: Local caching of Airtable data for fast iteration
- **Model Display**: Shows which LLM model is being used (currently Claude Sonnet 4.1)

## Setup

1. Ensure your `.env` file has the required Airtable credentials:
   ```
   AIRTABLE_API_KEY=your_api_key
   AIRTABLE_BASE_ID=your_base_id
   AIRTABLE_TABLE_NAME=your_table_name
   ```

2. Ensure you have LLM credentials configured for the pipeline.

## Usage

### Start the Prompt Lab Server

```bash
npm run prompt-lab
```

This will start the server on port 3000 (or the port specified in `PROMPT_LAB_PORT` env variable).

Open http://localhost:3000 in your browser.

### Fetch/Refresh Data

To manually fetch and cache data from Airtable:

```bash
npm run prompt-lab:fetch
```

The server will automatically fetch data on startup if no cache exists or if the cache is stale (>1 hour old).

## How It Works

1. **Data Source**: Fetches the last 50 notes from Airtable where:
   - `Would be posted` = 1 (notes that would be posted)
   - `Bot name` = "main" (from the main branch)

2. **Research Data Extraction**: Extracts from the "Full Result" field:
   - Tweet text
   - Search results from Perplexity
   - Citations
   - Original generated note
   - Status

3. **Prompt Testing**:
   - Enter your custom prompt template using placeholders:
     - `{tweetText}` - The original tweet text
     - `{searchResults}` - Perplexity search results
     - `{citations}` - List of citation URLs
   - Click "Test on Random 10" to generate notes using your prompt
   - Results are displayed vertically with:
     - Original tweet
     - Original note (what was previously generated)
     - Your generated note (using the new prompt)
     - Character counts and status badges

4. **Iteration**:
   - Modify your prompt based on the results
   - Test again on a new random sample
   - Continue iterating until satisfied with the output

## Prompt Template Placeholders

Your prompt template can use these placeholders:
- `{tweetText}` - The tweet content
- `{searchResults}` - Search results from Perplexity
- `{citations}` - Citation URLs (joined with newlines)

Alternative formats also work:
- `${tweetText}`, `${searchResults}`, `${citations}`
- `{{tweetText}}`, `{{searchResults}}`, `{{citations}}`

## Files

- `fetchAirtableData.ts` - Fetches and caches data from Airtable
- `server.ts` - Express server that serves the web interface and API
- `testPrompt.ts` - Logic for testing prompts with the LLM
- `index.html` - Web interface for testing prompts
- `research-cache.json` - Local cache of Airtable data (auto-generated)

## Tips

- Start with the default prompt (click "Load Default Prompt") and modify from there
- Test on multiple random samples to ensure your prompt generalizes well
- Pay attention to the character count - notes must be ≤275 characters
- Watch for status changes between original and generated notes
- Use the "Refresh Data" button to get the latest notes from Airtable