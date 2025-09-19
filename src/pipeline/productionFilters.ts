import OpenAI from 'openai';

interface FilterResult {
  name: string;
  passed: boolean;
  error?: string;
}

// Initialize OpenRouter client
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY?.trim(),
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/Goodheart-Labs/community-notes-writer',
    'X-Title': 'Community Notes Production Filters',
  }
});

// Hardcoded production filters
const PRODUCTION_FILTERS = [
  {
    name: "Fact filter",
    prompt: `Consider:
Is the original post making a factual claim?
Or is it expressing a subjective opinion, prediction, or interpretation?
If it is a famous public figure then we can be a bit more loose in what a factual claim is.
Community Notes should primarily address factual inaccuracies
A rhetorical question makes it more likely to be an opinion

Respond with only "PASS" if the note is a factual claim or "FAIL" if it is an opinion or sarcasm.

Note to evaluate:
{post}`
  },
  {
    name: "Positive claims filter",
    prompt: `Determine if this Community Note claims at any point that someone *didn't* do something.

Consider:
Does it say that someone didn't say something?
Does it say that someone didn't do something?
If the source referenced is a specific factcheck that backs up the negative claim, you may "PASS" it, but otherwise "FAIL"
Even if the note is mostly positive claims, if it contains a single negative claim, it should "FAIL"

Note to evaluate:
{note}

Respond with only "PASS" if it is solely comprised of positive claims (or the single additional caveat above), or "FAIL" in all other cases.`
  },
  {
    name: "Substantive disagreement filter",
    prompt: `Consider:
Do the original post and community note actually disagree?
It isn't enough to be providing some context, the context and original post must substantively conflict.

Original post:
{post}

Note to evaluate:
{note}

Respond with "PASS" if the two substantially disagree or "FAIL" otherwise.`
  }
];

// Run a single filter
async function runFilter(
  filterPrompt: string,
  filterName: string,
  note: string,
  post: string
): Promise<FilterResult> {
  try {
    // Replace placeholders
    let prompt = filterPrompt.replace(/\{note\}/g, note);
    prompt = prompt.replace(/\{post\}/g, post);
    
    // Create a timeout promise
    const timeoutMs = 30000; // 30 seconds per filter (very generous)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Filter timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    
    // Race between API call and timeout
    const response = await Promise.race([
      openrouter.chat.completions.create({
        model: 'anthropic/claude-sonnet-4',
        messages: [
          {
            role: 'system',
            content: 'You are a Community Notes filter evaluator. Respond with ONLY the single word "PASS" or "FAIL" based on the criteria given. Do not include any other text, punctuation, or explanation.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      }),
      timeoutPromise
    ]) as any;
    
    const rawResult = response.choices[0]?.message?.content || '';
    const trimmed = rawResult.trim().toUpperCase();
    
    // Check for valid responses
    if (trimmed === 'PASS') {
      console.log(`[Filter: ${filterName}] PASS`);
      return { name: filterName, passed: true };
    }
    
    if (trimmed === 'FAIL') {
      console.log(`[Filter: ${filterName}] FAIL`);
      return { name: filterName, passed: false };
    }
    
    // Check variations
    if (trimmed.startsWith('PASS') || trimmed.includes('PASS')) {
      console.log(`[Filter: ${filterName}] PASS (from "${rawResult}")`);
      return { name: filterName, passed: true };
    }
    
    if (trimmed.startsWith('FAIL') || trimmed.includes('FAIL')) {
      console.log(`[Filter: ${filterName}] FAIL (from "${rawResult}")`);
      return { name: filterName, passed: false };
    }
    
    // Unexpected response
    console.warn(`[Filter: ${filterName}] Unexpected response: "${rawResult}"`);
    return {
      name: filterName,
      passed: false,
      error: `LLM responded: "${rawResult}"`
    };
  } catch (error: any) {
    console.error(`[Filter: ${filterName}] Error:`, error.message || error);
    return {
      name: filterName,
      passed: false,
      error: error.message || String(error)
    };
  }
}

// Run all production filters
export async function runProductionFilters(
  noteText: string,
  postText: string
): Promise<{ passed: boolean; results: FilterResult[] }> {
  console.log(`[ProductionFilters] Running ${PRODUCTION_FILTERS.length} filters`);
  
  // Set overall timeout for all filters (45 seconds total)
  const overallTimeoutMs = 45000;
  const overallTimeoutPromise = new Promise<FilterResult[]>((_, reject) => {
    setTimeout(() => reject(new Error(`All filters timed out after ${overallTimeoutMs}ms`)), overallTimeoutMs);
  });
  
  // Run all filters in parallel with overall timeout
  let results: FilterResult[];
  try {
    results = await Promise.race([
      Promise.all(
        PRODUCTION_FILTERS.map(filter => 
          runFilter(filter.prompt, filter.name, noteText, postText)
        )
      ),
      overallTimeoutPromise
    ]) as FilterResult[];
  } catch (error: any) {
    console.error('[ProductionFilters] Timeout or error running filters:', error.message);
    // Return all failed if timeout
    results = PRODUCTION_FILTERS.map(f => ({
      name: f.name,
      passed: false,
      error: `Overall timeout exceeded (${overallTimeoutMs}ms)`
    }));
  }
  
  // Log summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`[ProductionFilters] Results: ${passed} passed, ${failed} failed`);
  
  // All filters must pass
  const allPassed = results.every(r => r.passed);
  
  if (!allPassed) {
    const failedFilters = results.filter(r => !r.passed).map(r => r.name);
    console.log(`[ProductionFilters] Failed filters: ${failedFilters.join(', ')}`);
  }
  
  return {
    passed: allPassed,
    results
  };
}

// Format results for logging
export function formatFilterResults(results: FilterResult[]): string {
  return results.map(r => {
    const status = r.passed ? 'PASS' : 'FAIL';
    const error = r.error ? ` (${r.error})` : '';
    return `${r.name}: ${status}${error}`;
  }).join('\n');
}