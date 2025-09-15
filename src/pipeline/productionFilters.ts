import OpenAI from 'openai';

interface FilterResult {
  name: string;
  passed: boolean;
  error?: string;
}

// Initialize OpenRouter client
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/Goodheart-Labs/community-notes-writer',
    'X-Title': 'Community Notes Production Filters',
  }
});

// Hardcoded production filters
const PRODUCTION_FILTERS = [
  {
    name: "Opinion vs Fact",
    prompt: `Is the original post making a factual claim?
Or is it expressing a subjective opinion, prediction, or interpretation?
Community Notes should primarily address factual inaccuracies
A rhetorical question makes it more likely to be an opinion

Original post:
{post}

Respond with only "PASS" if the post makes a factual claim that can be fact-checked, or "FAIL" if it's primarily opinion/prediction/interpretation.`
  },
  {
    name: "No Harassment",
    prompt: `Check if the Community Note contains harassment, abuse, or unnecessarily hostile language.

Note to evaluate:
{note}

Respond with only "PASS" if the note is appropriate and professional, or "FAIL" if it contains harassment/abuse.`
  },
  {
    name: "Avoid Negative Claims",
    prompt: `Determine if this Community Note claims at any point that someone *didn't* do something.

Consider:
Does it say that someone didn't say something?
Does it say that someone didn't do something?
If the source referenced is a specific factcheck that backs up the negative claim, you may "PASS" it, but otherwise "FAIL"

Note to evaluate:
{note}

Respond with only "PASS" if it is solely comprised of positive claims (or the single additional claim above), or "FAIL" in all other cases.`
  },
  {
    name: "Substantive Disagreement",
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
    
    const response = await openrouter.chat.completions.create({
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
    });
    
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
  
  // Run all filters in parallel
  const results = await Promise.all(
    PRODUCTION_FILTERS.map(filter => 
      runFilter(filter.prompt, filter.name, noteText, postText)
    )
  );
  
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