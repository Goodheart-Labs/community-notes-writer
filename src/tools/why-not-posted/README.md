# Why Not Posted Analysis

A tool to analyze which pipeline steps prevent notes from being posted, with interactive Sankey diagram visualization.

## Features

- **Pipeline Flow Visualization**: Sankey diagram showing where notes fail in the pipeline
- **Failure Breakdown**: Bar chart of most common failure points
- **Detailed Analysis**: Step-by-step breakdown for each note
- **Branch Filtering**: Analyze specific branches or all branches
- **Configurable Limits**: Analyze last 50, 100, 200, or 500 notes

## Pipeline Steps Analyzed

1. Generated Note - Did the pipeline generate a note?
2. Not Sarcasm Filter - Score > 0.5
3. URL Filter - Score > 0.5
4. Character Count Filter - Score > 0.5
5. Positive Claims Filter - Score > 0.5
6. Significant Correction Filter - Score > 0.5
7. Helpfulness Prediction - Score > 0.5
8. X API Score - Score > 0.5
9. Would Be Posted - Final decision

## Usage

```bash
npm run why-not-posted
```

Then open http://localhost:3005 in your browser.

## Configuration

Set the port in your `.env` file:
```
WHY_NOT_POSTED_PORT=3005
```

## Visualization

The Sankey diagram shows:
- **Blue nodes**: Start
- **Green nodes**: Successfully posted
- **Red nodes**: Failed at a specific step
- **Gray nodes**: Intermediate steps
- **Link colors**: Green for success path, red for failure paths

The tool helps identify:
- Which filter is the most common failure point
- What percentage of notes make it through each stage
- Patterns in pipeline failures
