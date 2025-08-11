# Community Notes Writer

An automated system for creating and submitting Community Notes on Twitter/X using AI-powered analysis and OAuth 1.0a authentication.

## Overview

This project automatically:
1. **Fetches eligible posts** from Twitter's Community Notes API
2. **Analyzes posts** using AI to identify misinformation
3. **Generates fact-checking notes** with citations
4. **Submits notes** to Twitter's Community Notes system
5. **Tracks submissions** in Airtable to avoid duplicates

## Architecture

### Core Components

- **`createNotesRoutine.ts`**: Main orchestration script that runs hourly
- **`fetchEligiblePosts.ts`**: Fetches posts eligible for Community Notes (with pagination)
- **`submitNote.ts`**: Submits notes to Twitter API using OAuth 1.0a
- **`airtableLogger.ts`**: Tracks processed posts to avoid duplicates
- **AI Pipeline**: Search context → Note writing → Fact checking

### Workflow

1. **Hourly Execution**: GitHub Actions runs every hour at the top of the hour
2. **Post Discovery**: Fetches up to 3 pages of eligible posts (max 10 posts per run)
3. **Duplicate Prevention**: Checks Airtable for already-processed posts
4. **Concurrent Processing**: Processes 3 posts simultaneously to avoid rate limiting
5. **AI Analysis**: Each post goes through:
   - **Search Context**: AI searches for relevant information
   - **Note Writing**: AI generates fact-checking notes with citations
   - **Fact Checking**: AI verifies the note's accuracy
6. **Submission**: Submits notes for posts with "CORRECTION WITH TRUSTWORTHY CITATION" status
7. **Logging**: Records all activity in Airtable for tracking

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Environment Variables

Create `.env.local` with your credentials:

```env
# Twitter/X API OAuth 1.0a
X_API_KEY=your_api_key_here
X_API_KEY_SECRET=your_api_key_secret_here
X_ACCESS_TOKEN=your_access_token_here
X_ACCESS_TOKEN_SECRET=your_access_token_secret_here

# Airtable (for tracking)
AIRTABLE_API_KEY=your_airtable_api_key
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_TABLE_NAME=your_table_name

# AI Services
OPENROUTER_API_KEY=your_openrouter_key
```

### 3. Airtable Setup

See `AIRTABLE_SETUP.md` for detailed Airtable configuration.

## Usage

### Manual Execution

```bash
# Run the routine manually
bun run routine

# Type check
bun run typecheck

# Test
bun run test
```

### Automated Execution

The system runs automatically via GitHub Actions:
- **Schedule**: Every hour at minute 0 (UTC)
- **Manual Trigger**: Available via GitHub Actions UI
- **Workflow**: `.github/workflows/create-notes-routine.yml`

### Testing Alternative Bot Configurations

To test changes without submitting actual Community Notes to X.com:

1. **Create a staging branch** with the prefix `staging/`:
   ```bash
   git checkout -b staging/experiment-name
   # Example: staging/satire, staging/test-prompt, staging/new-model
   ```

2. **Make your changes** to the bot configuration, prompts, or logic

3. **Push the branch**:
   ```bash
   git push origin staging/experiment-name
   ```

4. **GitHub Actions will run automatically** on the staging branch with these behaviors:
   - ✅ **Full pipeline execution**: Posts are fetched, analyzed, and notes generated
   - ✅ **Airtable logging**: All results are logged with the branch name as the bot name
   - ✅ **Accurate "Would be posted" field**: Still reflects whether notes would be submitted based on your rules
   - ❌ **No actual submission**: Notes are NOT submitted to X.com (simulation mode)

5. **Review results** in Airtable to see how your changes perform without affecting live Community Notes

This allows you to safely test different bot personalities, prompts, models, or logic changes in a production-like environment.

## Key Features

### Rate Limiting Protection
- **Concurrency Control**: Processes 3 posts simultaneously using `p-queue`
- **Pagination**: Fetches up to 3 pages to get sufficient posts
- **Duplicate Prevention**: Uses Airtable to track processed posts

### AI-Powered Analysis
- **Multi-Model Pipeline**: Uses different AI models for different tasks
- **Citation Tracking**: Maintains source citations throughout the process
- **Quality Control**: Fact-checking step ensures note accuracy

### Robust Error Handling
- **Individual Post Failures**: Don't stop the entire pipeline
- **API Error Recovery**: Graceful handling of Twitter API errors
- **Comprehensive Logging**: Detailed logs for debugging

## Security

- **OAuth 1.0a**: Secure API authentication
- **Environment Variables**: All credentials stored securely
- **No Hardcoded Secrets**: All sensitive data in `.env.local`

## Monitoring

- **Airtable Logging**: Tracks all processed posts and outcomes
- **Console Logging**: Detailed runtime logs with queue status
- **GitHub Actions**: Execution history and error reporting

---

**Summary:**

- **Automated Community Notes**: Runs hourly to identify and fact-check misinformation
- **AI-Powered**: Uses multiple AI models for search, writing, and verification
- **Rate-Limited**: Processes 10 posts per run with concurrency control
- **Duplicate-Safe**: Tracks processed posts to avoid re-processing
- **Production-Ready**: Robust error handling and comprehensive logging
