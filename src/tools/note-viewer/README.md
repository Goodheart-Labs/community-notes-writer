# Community Notes Viewer

A web-based tool for viewing and analyzing Community Notes from Airtable with filtering and score visualization.

## Features

- **Browse All Notes**: View all Community Notes stored in Airtable
- **Branch Filtering**: Filter notes by git branch/bot name
- **Status Filtering**: Filter by posted status or "would be posted" status
- **Score Visualization**: See all decimal filter scores (0.0-1.0)
- **Keywords Display**: View extracted keywords for each note
- **Reasoning Display**: See the full processing details and skip reasons
- **Statistics**: Real-time stats on total notes, posted, would post, and rejected

## Setup

Ensure your `.env` file has the required Airtable credentials:
```
AIRTABLE_API_KEY=your_api_key
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_TABLE_NAME=your_table_name
```

## Usage

### Start the Note Viewer Server

```bash
bun run src/tools/note-viewer/server.ts
```

Or if you prefer npm:
```bash
npx tsx src/tools/note-viewer/server.ts
```

The server will start on port 3001 (or the port specified in `NOTE_VIEWER_PORT` env variable).

Open http://localhost:3001 in your browser.

## Interface

### Filters
- **Branch Filter**: Select a specific branch or view all
- **Max Results**: Limit the number of notes displayed (default 50)
- **Only Posted to X**: Show only notes that were actually posted
- **Only Would Be Posted**: Show only notes that passed all filters

### Note Cards Display
Each note card shows:
- Branch/bot name badge
- Posted status (Posted to X, Would Post, or Rejected)
- Tweet text
- Generated Community Note
- Keywords extracted
- Filter scores (decimal 0.0-1.0):
  - Not Sarcasm Filter
  - Character Count Filter
  - Positive Claims Filter
  - Significant Correction Filter
- Processing details/reasoning

### Statistics
- Total Notes: Count of all notes in current view
- Posted to X: Actually posted to Twitter/X
- Would Be Posted: Passed all filters but not posted
- Rejected: Failed one or more filters

## Filter Scores

All filters use decimal scoring (0.0 to 1.0):
- **Not Sarcasm Filter**: Higher = more sincere (threshold: > 0.5)
- **Character Count Filter**: 1.0 if under 280 chars, 0.0 if over
- **Positive Claims Filter**: Higher = more positive framing (threshold: > 0.5)
- **Significant Correction Filter**: Higher = more substantive disagreement (threshold: > 0.5)

## Tips

- Use branch filtering to compare performance across different branches
- Check the reasoning section to understand why notes were rejected
- Look for patterns in scores to identify areas for improvement
- Export data by copying from the browser for further analysis