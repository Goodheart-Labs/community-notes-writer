# Community Notes Writer Pipeline Refactor Plan

## Overview
Refactor the note writer pipeline to use percentage-based scoring system and reorganize filter ordering for improved efficiency and accuracy.

## Key Changes
- **Percentage Scoring**: All filters return 0-1 decimal scores instead of binary PASS/FAIL then if it's > .5 it passes otherwise it fails
- **Early Sarcasm Detection**: Filter sarcastic, rhetorical, non-public figure opinion posts before expensive API calls
- **Keyword-Based Search**: Extract key terms instead of passing full tweet text
- **Positive Framing**: Notes should say what people *did* not what they didn't do or so
- **Score Tracking**: Record all scores to Airtable for analysis, if the relevant columns exist

## New Pipeline Flow

### Current Flow
```
1. Fetch posts
2. Filter videos (in pipeline after fetch)
3. Search with full tweet
4. Write note
5. Check source
6. Run filters (binary PASS/FAIL)
7. Post to Twitter/Airtable
```

### Refactored Flow
```
1. Fetch posts → Filter videos immediately ✅ (already done)
2. Sarcasm Filter (0-1 score, ≤0.5 fails) → Early exit if sarcastic
3. Extract Keywords → Get 3-5 key terms/claims from the tweet + retweet context (-> now call this "quote tweet context" )
4. Research/Search (keywords + today's date + retweet context)
5. Write Note (emphasize positive(about things which did happen)/corrective framing)
6. Run Scoring Filters (all return 0-1 decimal scores):
   - URL validity check → score
   - Positive statement check → score  
   - Substantive disagreement check → score
7. Post if all scores pass thresholds
8. Record all scores to Airtable and generally log
```

## Detailed Implementation

### 1. Sarcasm Filter (NEW)
**File**: `src/pipeline/sarcasmFilter.ts`

**Purpose**: Detect sarcastic/satirical posts early to avoid wasting API calls

**Implementation**:
```typescript
interface SarcasmResult {
  score: number;        // 0 = definitely sarcastic, 1 = definitely sincere, this should be a decimal right?
  reasoning: string;    // Brief explanation
}

async function checkSarcasm(tweetText: string): Promise<SarcasmResult>
```

**Threshold**: Score ≤ 0.5 = FAIL (skip post)

**Prompt Elements**:
- Check for irony, satire, jokes, memes
- Look for exaggeration, impossible claims
- Consider context and tone
- Return confidence that tweet is sincere

### 2. Keyword Extraction (NEW)
**File**: `src/pipeline/extractKeywords.ts`

**Purpose**: Extract searchable terms instead of using full tweet and quote tweet context

**Implementation**:
```typescript
interface KeywordResult {
  keywords: string[];      // 3-5 key terms
  claims: string[];        // Main factual claims
  entities: string[];      // People, places, organizations
}

async function extractKeywords(tweetText: string): Promise<KeywordResult>
```

**Output Format**: "Keywords: term1, term2, term3"

### 3. Enhanced Search Context
**Modify**: `src/implementations/search.ts`

**Changes**:
- Accept keywords instead of tweet text
- Include today's date in search query
- Format: `"Keywords: ${keywords} Date: ${today} Context: ${retweetContext}"`

**Benefits**:
- Less biased search results
- Better handling of time-sensitive claims

### 4. Positive Note Writing
**Modify**: `src/implementations/writeNote.ts`

**Prompt Updates**:
- Use current prompt, Nathan will edit it later

### 5. URL checker

Roughly keep as is in it's own file.

Make it's output be decimal.

6. Other Scoring Filters
**File**: `src/pipeline/scoringFilters.ts`

**Replace Binary Filters With**:

#### Positive Statement Score (0-1)
Use current filter.

0 if sure there is a negative claim, 1 if sure there are only positive claims, decimal in between.

#### Substantive Disagreement Score (0-1)

Use current filter.

0 if sure there is no disagreement, 1 if sure there is substantive disagreement, decimal in between.

**Configurable Thresholds**:
```typescript
const THRESHOLDS = {
  url: 0.5,        // Must have decent source
  positive: 0.5,   // Must be mostly positive
  disagreement: 0.5 // Must have real disagreement
};
```

### 6. Airtable Schema Updates

**New Columns to Add**:
- `Sarcasm Score` (Number, 0-1)
- `URL Score` (Number, 0-1)
- `Positive Score` (Number, 0-1)
- `Disagreement Score` (Number, 0-1)
- `Keywords Extracted` (Long text)
- `Overall Score` (Number, average of all scores)

**Existing Columns to Keep**:
- All current columns remain unchanged
- Scores are additional data points

### 7. Main Pipeline Updates
**File**: `src/scripts/createNotesRoutine.ts`

**Key Changes**:
```typescript
// Early sarcasm check
const sarcasmResult = await checkSarcasm(post.text);
if (sarcasmResult.score <= 0.5) {
  log("Skipped - sarcastic", sarcasmResult);
  continue;
}

// Extract keywords for search
const keywords = await extractKeywords(post.text);

// Search with keywords + date
const searchResults = await search({
  keywords: keywords.keywords,
  date: new Date().toISOString().split('T')[0],
  retweetContext: getRetweetContext(post)
});

// Run scoring filters
const scores = {
  url: await checkUrlValidity(note),
  positive: await checkPositiveFraming(note),
  disagreement: await checkSubstantiveDisagreement(note, post)
};

// Check all thresholds
const passesAll = Object.entries(scores)
  .every(([key, score]) => score > THRESHOLDS[key]);
```

## Migration Strategy

### Phase 1: Add Scoring Alongside Binary (Week 1)
- Implement scoring functions
- Run both scoring and binary filters
- Log scores but use binary for decisions
- Collect data on score distributions

### Phase 2: Test Thresholds (Week 2)
- Analyze collected scores
- Identify optimal thresholds
- Test on known good/bad examples
- Adjust thresholds based on results

### Phase 3: Switch to Scoring (Week 3)
- Replace binary decisions with score thresholds
- Monitor note acceptance rates
- Fine-tune based on performance

## Success Metrics

### Efficiency Metrics
- **Sarcasm Filter Rate**: % of posts filtered for sarcasm (target: 10-15%)
- **API Cost Reduction**: Less tokens used via keyword search (target: 30% reduction)
- **Processing Time**: Faster per-post processing (target: 20% faster)

### Quality Metrics  
- **Note Acceptance Rate**: % of submitted notes approved by community
- **Score Distributions**: Track average scores per filter
- **Threshold Effectiveness**: % of posts passing each threshold

## Testing Plan

### Test Cases Needed
1. **Sarcastic Posts**: Known satirical accounts, obvious jokes
2. **Edge Cases**: Posts that are borderline on each metric
3. **High-Quality Posts**: Known good corrections that should pass
4. **Poor Quality Posts**: Known bad notes that should fail

### Test Data Sources
- Historical successful notes (high scores expected)
- Historical failed notes (low scores expected)  
- Known satirical accounts (low sarcasm scores)
- Verified fact-checks (high disagreement scores)

## Rollback Plan

If issues arise:
1. Keep binary filter code in place
2. Add feature flag to toggle scoring vs binary
3. Can revert to binary decisions instantly
4. Scores continue to be collected for analysis

## Timeline

### Week 1: Core Implementation
- [ ] Day 1-2: Implement sarcasm filter and keyword extraction
- [ ] Day 3-4: Update search and note writing
- [ ] Day 5: Implement scoring filters

### Week 2: Integration & Testing
- [ ] Day 1-2: Update main pipeline
- [ ] Day 3-4: Add Airtable columns and logging
- [ ] Day 5: Test with sample data

### Week 3: Deployment
- [ ] Day 1: Deploy to staging branch
- [ ] Day 2-3: Monitor and adjust thresholds
- [ ] Day 4-5: Deploy to main branch

## Questions to Resolve

1. **Sarcasm Model**: Use GPT-4 or Claude Sonnet for sarcasm detection?
2. **Score Aggregation**: Average all scores or weighted average?
3. **Threshold Tuning**: Fixed thresholds or dynamic based on daily performance?
4. **Airtable Limits**: Will additional columns hit any limits?
5. **Backwards Compatibility**: Keep old filter code or remove after migration?

## Next Steps

1. Review and approve this plan
2. Create feature branch for development
3. Set up Airtable test environment
4. Begin implementation with sarcasm filter
5. Daily progress reviews and adjustments

---

*Document created: 2025-01-18*
*Target completion: 3 weeks from approval*