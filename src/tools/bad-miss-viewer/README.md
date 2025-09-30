# Bad Miss Viewer

A tool to view tweets that would have been posted by the bot (Would be posted = 1) but Nathan rated with a score less than 0.5.

## Features

- **Branch Filtering**: View bad misses from specific branches or all branches
- **Time Range Filter**: View data from last 8 hours, 24 hours, 48 hours, or last week
- **Detailed View**: See original tweet, the note that would have been posted, filter scores, and full reports
- **Real-time Stats**: Count of total bad misses for selected filters

## Usage

```bash
npm run bad-miss-viewer
```

Then open http://localhost:3004 in your browser.

## What is a "Bad Miss"?

A bad miss is when:
1. The bot decided to post (`Would be posted` = 1)
2. But Nathan's rating was less than 0.5 (`Would Nathan have posted?` < 0.5)

This indicates the bot would have posted something Nathan wouldn't have, which helps identify areas for improvement.

## Configuration

Set the port in your `.env` file:
```
BAD_MISS_VIEWER_PORT=3004
```
