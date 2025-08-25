# Elo Rating System for Community Notes Branches

## Overview

This document outlines the plan for implementing an Elo rating system to compare different Community Notes bot branches. The system will fetch data from Airtable and present a web-based interface for pairwise comparisons, calculating Elo ratings in real-time.

## System Architecture

### 1. Data Fetching Module

- **Live Data**: Query Airtable API directly each time (no caching)
- **Multi-Branch Detection**: Fetch tweets with multiple note attempts from different branches
- **Time Filtering**: Adjustable date range picker in UI
- **Grouping Logic**: Group tweets by URL where multiple bot branches have attempted notes

### 2. HTML Interface

Single-page web application with modern UI featuring:

#### Comparison Interface

- Tweet text displayed prominently at the top, with image, quote tweet etc
- Two proposednotes shown side-by-side (randomized left/right placement)
- Action buttons: "Left Better", "Right Better", "Equal", "Skip"
- No branch names shown during comparison (blind testing)

#### Real-time Updates

- Elo rating updates calculated immediately after each vote
- Live leaderboard sidebar showing current rankings

### 3. Elo Rating Implementation

- **Algorithm**: Client-side Elo calculations matching llm-eval formula
- **Base Rating**: 1200 for all branches initially
- **K-factor**: 15 (moderate sensitivity)
- **Session-based**: Ratings reset on page reload
- **Value mapping**:
  - Win: 1.0
  - Draw: 0.5
  - Loss: 0.0

### 4. UI Features

#### Controls

- Date range selector (past week, month, custom range)
- Progress indicator (X of Y comparisons completed)
- Branch filter checkboxes
- Minimum comparisons threshold

#### Data Export

- Export results as CSV
- Include: timestamp, branches compared, result, ratings after

#### Responsive Design

- Mobile-friendly interface
- Desktop optimized for side-by-side comparisons

### 5. File Structure

```
src/elo-rating-web/
├── index.html              # Main HTML page
├── app.ts                  # Main TypeScript application
├── airtableClient.ts       # Airtable API integration
├── eloCalculator.ts        # Elo rating logic
├── types.ts                # TypeScript interfaces
└── styles.css              # Tailwind CSS styling
```

### 6. Technical Implementation

#### Frontend Stack

- **Framework**: Vanilla TypeScript or lightweight (Alpine.js)
- **Styling**: Tailwind CSS
- **Build**: Vite for development and bundling
- **Storage**: LocalStorage for comparison history

#### Airtable Integration

- Use existing environment variables for credentials
- Fetch records with fields: URL, Bot name, Final note, Initial tweet body
- Filter by date and "Would be posted" status

#### No Backend Required

- All logic runs client-side
- Direct Airtable API calls from browser
- Optional: Proxy through Vercel function for API key security

## Implementation Steps

### Phase 1: Core Functionality

1. Set up project structure and build system
2. Create Airtable client for fetching data
3. Implement Elo rating calculator
4. Build basic comparison interface

### Phase 2: UI Enhancement

1. Add date range picker
2. Implement leaderboard display
3. Add progress tracking
4. Style with Tailwind CSS

### Phase 3: Additional Features

1. Export functionality
2. Comparison history
3. Statistical analysis (win rates, confidence intervals)
4. Branch performance over time chart

## Example User Flow

1. User opens web interface
2. Selects date range (e.g., "Last 7 days")
3. System fetches tweets with multiple branch attempts
4. User sees first comparison:
   - Tweet: "The mayor announced new policy..."
   - Left note: "This claim needs context. The policy..."
   - Right note: "According to official sources..."
5. User clicks "Left Better"
6. Ratings update instantly in leaderboard
7. Next comparison loads automatically
8. After all comparisons, user can export results

## Success Metrics

- Number of comparisons completed per session
- Consistency of ratings across multiple sessions
- Clear differentiation between branch performances
- User engagement time

## Future Enhancements

- Update back to airtable (perhaps after the first vote can score each entry)
- Performance tracking dashboard
