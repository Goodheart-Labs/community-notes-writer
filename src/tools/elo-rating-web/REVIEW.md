# Elo Rating System - Pre-Push Review Checklist

## 🔴 Critical Issues to Address

### 1. **API Key Security**
- **Issue**: Airtable API key is exposed in client-side JavaScript
- **Risk**: Anyone can view source and steal your API key
- **Solutions**:
  - Move to a server-side proxy endpoint
  - Use Vercel serverless functions
  - Implement API key rotation
  - Add CORS restrictions on Airtable

### 2. **Date Filtering Not Working**
- **Issue**: Getting 5000+ records even for "Last 24 hours"
- **Possible Causes**:
  - `Created` field might not exist or be named differently
  - Date format mismatch
  - Airtable formula syntax issue
- **Debug Steps**:
  1. Check console for "First record fields" output
  2. Verify actual field name (might be `createdTime` or custom)
  3. Test filter formula in Airtable UI directly

## 🟡 Important Considerations

### 3. **Data Validation**
- **Missing Checks**:
  - No validation if `Full Result` field exists
  - Status extraction could fail silently
  - Tweet text parsing assumes JSON format
- **Recommendations**:
  - Add try-catch blocks around field access
  - Provide fallback values
  - Validate data structure before processing

### 4. **Performance Issues**
- **Current Problems**:
  - Loading ALL records before filtering for multi-bot tweets
  - No pagination in UI (could have thousands of comparisons)
  - Cache doesn't expire based on new data
- **Solutions**:
  - Filter at Airtable level if possible
  - Add pagination or limit comparisons per session
  - Implement smarter cache invalidation

### 5. **User Experience**
- **Issues**:
  - No way to go back to previous comparison
  - Can't see which bots are being compared (after voting)
  - No undo functionality
  - Progress resets on page reload
- **Improvements Needed**:
  - Add comparison history
  - Show bot names after voting
  - Save progress to localStorage
  - Add back/undo buttons

## 🟢 Code Quality Checks

### 6. **TypeScript Issues**
```bash
# Run these checks:
bun run typecheck
```

**Potential Type Issues Found**:
- `any` type used for window.AIRTABLE_CONFIG
- `any` type in parseTweetData
- Missing null checks in several places

### 7. **Error Handling**
**Missing Error Handling**:
- Network failures during fetch
- Invalid JSON in tweet data
- Missing required fields
- Airtable rate limits (5 requests/second)

### 8. **Browser Compatibility**
- Uses modern JavaScript features:
  - `matchAll()` - not supported in older browsers
  - Optional chaining (`?.`)
  - Nullish coalescing (`??`)
- Consider adding polyfills or transpilation

## 📋 Pre-Push Checklist

- [ ] **Security**: Move API key to server-side
- [ ] **Fix Date Filter**: Verify Created field name and format
- [ ] **Add Error Boundaries**: Wrap all field access in try-catch
- [ ] **Test Edge Cases**:
  - [ ] No internet connection
  - [ ] Empty results
  - [ ] Malformed data
  - [ ] Very long notes
  - [ ] Special characters in URLs
- [ ] **Performance Testing**:
  - [ ] Load with 1000+ comparisons
  - [ ] Test on mobile devices
  - [ ] Check memory usage
- [ ] **Cross-browser Testing**:
  - [ ] Chrome
  - [ ] Firefox
  - [ ] Safari
  - [ ] Edge

## 🐛 Known Bugs

1. **Character Count**: May be inaccurate for:
   - Multiple URLs in one note
   - URLs with special characters
   - Unicode characters

2. **Status Parsing**: Assumes specific format in Full Result field
   - Will show "Unknown" if format changes
   - No handling for multiple statuses

3. **Cache Issues**:
   - Cache key doesn't include table name
   - Could mix data if switching between tables

## 🚀 Deployment Considerations

1. **Environment Variables**:
   ```env
   AIRTABLE_API_KEY=xxx
   AIRTABLE_BASE_ID=xxx
   AIRTABLE_TABLE_NAME="Table 1"
   ```

2. **Build Process**:
   ```bash
   bun run build-elo
   ```

3. **Hosting Options**:
   - **Current**: Local server (insecure)
   - **Recommended**: Vercel/Netlify with serverless functions
   - **Alternative**: Docker container with Node.js server

## 📊 Testing Recommendations

1. **Unit Tests Needed**:
   - Character counting function
   - Elo calculation
   - Status parsing
   - URL extraction

2. **Integration Tests**:
   - Airtable API connection
   - Cache behavior
   - Export functionality

3. **Manual Testing Script**:
   - Select "Last 24 hours"
   - Compare 10 notes
   - Change date range
   - Export results
   - Refresh page
   - Verify cache works

## 🔧 Quick Fixes Before Push

```typescript
// Add to airtableClient.ts
const DEFAULT_CREATED_FIELD = 'Created';
const FALLBACK_CREATED_FIELD = 'createdTime';

// Add retry logic for rate limits
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Add to app.ts
window.addEventListener('beforeunload', (e) => {
  if (this.comparisons.length > 0) {
    e.preventDefault();
    e.returnValue = 'You have unsaved comparisons. Are you sure you want to leave?';
  }
});
```

## 📝 Documentation Needs

- Add API documentation
- Document expected Airtable schema
- Add troubleshooting guide
- Create user guide with screenshots

## Summary

**Must Fix Before Production**:
1. API key security
2. Date filtering issue
3. Basic error handling

**Should Fix Soon**:
1. Progress persistence
2. Better status parsing
3. Performance optimization

**Nice to Have**:
1. Comparison history
2. Advanced analytics
3. Multi-user support