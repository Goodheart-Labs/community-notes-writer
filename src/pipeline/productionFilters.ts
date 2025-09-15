import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

interface FilterConfig {
  name: string;
  required: boolean;
  prompt: string;
}

interface BranchConfig {
  enabled: boolean;
  filters: FilterConfig[];
}

interface FilterResult {
  name: string;
  required: boolean;
  result: 'PASS' | 'FAIL' | 'ERROR';
  error?: string;
  rawResponse?: string;
}

interface FilterRunResult {
  shouldPost: boolean;
  results: FilterResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    requiredFailed: string[];
  };
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

// Load filter configuration for a branch
function loadFilterConfig(branch: string): BranchConfig {
  try {
    const configPath = path.join(process.cwd(), 'src/config/productionFilters.json');
    const configData = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    // Check for branch-specific config, fall back to default
    if (config[branch]) {
      return config[branch];
    } else if (branch.startsWith('staging/') && config['staging']) {
      return config['staging'];
    } else {
      return config['default'] || { enabled: false, filters: [] };
    }
  } catch (error) {
    console.error('[ProductionFilters] Error loading config:', error);
    return { enabled: false, filters: [] };
  }
}

// Run a single filter
async function runFilter(
  filter: FilterConfig, 
  note: string, 
  post: string
): Promise<FilterResult> {
  try {
    // Replace placeholders
    let prompt = filter.prompt.replace(/\{note\}/g, note);
    prompt = prompt.replace(/\{post\}/g, post);
    
    console.log(`[Filter: ${filter.name}] Running production filter`);
    
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
    if (trimmed === 'PASS' || trimmed === 'FAIL') {
      console.log(`[Filter: ${filter.name}] Result: ${trimmed}`);
      return {
        name: filter.name,
        required: filter.required,
        result: trimmed as 'PASS' | 'FAIL'
      };
    }
    
    // Check variations
    if (trimmed === 'PASS.' || trimmed === 'PASS!' || trimmed.startsWith('PASS')) {
      console.log(`[Filter: ${filter.name}] Result: PASS (from "${rawResult}")`);
      return {
        name: filter.name,
        required: filter.required,
        result: 'PASS'
      };
    }
    
    if (trimmed === 'FAIL.' || trimmed === 'FAIL!' || trimmed.startsWith('FAIL')) {
      console.log(`[Filter: ${filter.name}] Result: FAIL (from "${rawResult}")`);
      return {
        name: filter.name,
        required: filter.required,
        result: 'FAIL'
      };
    }
    
    // Unexpected response
    console.warn(`[Filter: ${filter.name}] Unexpected response: "${rawResult}"`);
    return {
      name: filter.name,
      required: filter.required,
      result: 'ERROR',
      error: `Unexpected response: "${rawResult}"`,
      rawResponse: rawResult
    };
  } catch (error: any) {
    console.error(`[Filter: ${filter.name}] Error:`, error.message || error);
    return {
      name: filter.name,
      required: filter.required,
      result: 'ERROR',
      error: error.message || String(error)
    };
  }
}

// Run all production filters for a note
export async function runProductionFilters(
  noteText: string,
  postText: string,
  branch: string = 'main'
): Promise<FilterRunResult> {
  const config = loadFilterConfig(branch);
  
  // If filters are disabled for this branch, allow posting
  if (!config.enabled || config.filters.length === 0) {
    console.log(`[ProductionFilters] Filters disabled for branch: ${branch}`);
    return {
      shouldPost: true,
      results: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        errors: 0,
        requiredFailed: []
      }
    };
  }
  
  console.log(`[ProductionFilters] Running ${config.filters.length} filters for branch: ${branch}`);
  
  // Run all filters in parallel
  const results = await Promise.all(
    config.filters.map(filter => runFilter(filter, noteText, postText))
  );
  
  // Calculate summary
  const summary = {
    total: results.length,
    passed: results.filter(r => r.result === 'PASS').length,
    failed: results.filter(r => r.result === 'FAIL').length,
    errors: results.filter(r => r.result === 'ERROR').length,
    requiredFailed: results
      .filter(r => r.required && r.result !== 'PASS')
      .map(r => r.name)
  };
  
  // Determine if note should be posted
  // Post only if all required filters pass
  const shouldPost = summary.requiredFailed.length === 0;
  
  console.log(`[ProductionFilters] Summary: ${summary.passed}/${summary.total} passed, ${summary.failed} failed, ${summary.errors} errors`);
  if (!shouldPost) {
    console.log(`[ProductionFilters] Blocking post due to failed required filters: ${summary.requiredFailed.join(', ')}`);
  }
  
  return {
    shouldPost,
    results,
    summary
  };
}

// Export individual filter results for Airtable logging
export function formatFilterResultsForAirtable(results: FilterResult[]): string {
  if (results.length === 0) return 'No filters run';
  
  const lines = results.map(r => {
    const status = r.result;
    const required = r.required ? '[REQUIRED]' : '[ADVISORY]';
    const error = r.error ? ` (${r.error})` : '';
    return `${r.name} ${required}: ${status}${error}`;
  });
  
  return lines.join('\n');
}