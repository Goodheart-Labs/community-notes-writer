# Airtable Integration Setup

This project now includes Airtable logging functionality to track community notes processing results.

## Required Environment Variables

Add these environment variables to your `.env` file:

```bash
# Airtable Configuration
AIRTABLE_API_KEY=your_airtable_api_key_here
AIRTABLE_BASE_ID=your_airtable_base_id_here
AIRTABLE_TABLE_NAME=your_table_name_here
```

## How to Get Airtable Credentials

1. **API Key**:

   - Go to https://airtable.com/account
   - Click "Generate API key"
   - Copy the generated key

2. **Base ID**:

   - Open your Airtable base in the browser
   - The URL will be: `https://airtable.com/appXXXXXXXXXXXXXX/...`
   - The Base ID is the `appXXXXXXXXXXXXXX` part

3. **Table Name**:
   - This is the name of your table in Airtable (e.g., "Community Notes Log")

## Airtable Table Structure

Your Airtable table should have these columns:

- **URL** (Single line text) - Links to the tweet
- **Bot name** (Single line text) - Defaults to "first-bot"
- **Initial tweet body** (Long text) - Full JSON of the eligible tweet
- **Full Result** (Long text) - Complete results of all processing steps
- **Final note** (Long text) - The final community note text
- **Would be posted** (Number) - 0 or 1 based on check response

## Testing the Integration

Run the test script to verify your setup:

```bash
bun run src/test-airtable-logger.ts
```

## Usage

The Airtable logging is now integrated into the main community notes script (`src/lib/createNotesRoutine.ts`). Each time the script runs, it will:

1. Process eligible posts through the pipeline
2. Create log entries for each processed post
3. Submit notes for posts that meet the criteria
4. Log all results to Airtable

The logging happens automatically and won't interfere with the existing functionality.
