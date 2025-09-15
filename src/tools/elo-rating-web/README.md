# Community Notes Elo Rating System

A web-based tool for comparing Community Notes from different bot branches using an Elo rating system.

## Features

- **Live Data Fetching**: Retrieves tweets with multiple note attempts directly from Airtable
- **Blind Comparison**: Notes are presented side-by-side without revealing which branch wrote them
- **Elo Rating System**: Uses standard Elo algorithm (K=15) to rank branches based on pairwise comparisons
- **Real-time Leaderboard**: Shows current rankings, win/loss records, and win rates
- **Keyboard Shortcuts**: 
  - A/← : Left note is better
  - D/→ : Right note is better
  - S/↓ : Notes are equal
  - Space/↑ : Skip comparison
- **Export Results**: Download rankings as CSV

## Setup

1. Make sure your `.env` file contains Airtable credentials:
   ```
   AIRTABLE_API_KEY=your_api_key
   AIRTABLE_BASE_ID=your_base_id
   AIRTABLE_TABLE_NAME=your_table_name
   ```

2. Run the application:
   ```bash
   bun run elo
   ```

3. Open in browser:
   ```
   http://localhost:8000
   ```

   The server will automatically inject your Airtable credentials from the .env file.

## Usage

1. Select a date range (last 7, 14, 30, or 90 days)
2. Click "Fetch Data" to load tweets with multiple branch attempts
3. Compare the notes presented:
   - Read the tweet carefully
   - Evaluate both notes for accuracy, helpfulness, and adherence to Community Notes guidelines
   - Click the appropriate button or use keyboard shortcuts
4. Track progress and view live rankings in the leaderboard
5. Export results when done

## How It Works

The system:
1. Fetches all tweets from Airtable where multiple bots have written notes
2. Generates all possible pairwise comparisons between different branches for the same tweet
3. Presents comparisons in random order with randomized left/right placement
4. Updates Elo ratings after each comparison
5. Displays a live leaderboard sorted by rating

## Security Note

Currently, the API key is passed via URL parameters. For production use, consider:
- Setting up a proxy server to keep the API key secure
- Using environment variables
- Implementing proper authentication