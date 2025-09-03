import { ResearchData } from './fetchAirtableData';
import { llm } from '../pipeline/llm';
import { parseStatusNoteUrl } from '../pipeline/parseStatusNoteUrl';
import { PromptLabError } from './errors';

export interface TestResult {
  id: string;
  url: string;
  tweetText: string;
  originalNote: string;
  originalStatus: string;
  generatedNote: string;
  generatedReasoning: string;
  generatedUrl: string;
  status: string;
  characterCount: number;
  error?: string;
}

export async function testPromptOnSample(
  samples: ResearchData[],
  promptTemplate: string
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const model = process.env.LLM_MODEL || 'anthropic/claude-sonnet-4';
  
  console.log(`Testing prompt on ${samples.length} samples using model: ${model}`);
  
  for (const sample of samples) {
    try {
      // Replace placeholders in prompt template
      const prompt = replacePlaceholders(promptTemplate, sample);
      
      // Generate new note using the custom prompt
      const response = await llm.create({
        model: model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });
      
      const content = response.choices?.[0]?.message?.content ?? "";
      
      // Log the full LLM response for debugging
      console.log(`\n=== LLM Response for sample ${results.length + 1} ===`);
      console.log(content);
      console.log(`=== End of response ===\n`);
      
      // Custom parsing for "Note:" format
      let status = "";
      let noteText = "";
      let url = "";
      let reasoning = "";
      
      // Find status (first line that matches known statuses)
      const statusPatterns = [
        "CORRECTION WITH TRUSTWORTHY CITATION",
        "CORRECTION WITHOUT TRUSTWORTHY CITATION", 
        "TWEET NOT SIGNIFICANTLY INCORRECT",
        "NO MISSING CONTEXT"
      ];
      
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        for (const pattern of statusPatterns) {
          if (trimmed.includes(pattern)) {
            status = pattern;
            break;
          }
        }
        if (status) break;
      }
      
      // Find note text (everything after "Note:" until URL or end)
      const noteMatch = content.match(/Note:\s*([\s\S]+?)(?:https?:\/\/|$)/i);
      if (noteMatch && noteMatch[1]) {
        // Remove any URLs from the note text itself (they'll be added separately)
        noteText = noteMatch[1].replace(/https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+/g, '').trim();
      }
      
      // Find URL
      const urlMatch = content.match(/https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+/);
      if (urlMatch && urlMatch[0]) {
        url = urlMatch[0];
      }
      
      // Extract reasoning (everything before "Note:")
      const noteIndex = content.toLowerCase().indexOf('note:');
      if (noteIndex > 0) {
        reasoning = content.substring(0, noteIndex)
          .split('\n')
          .filter(line => {
            const trimmed = line.trim();
            return trimmed && !statusPatterns.some(p => trimmed.includes(p));
          })
          .join(' ')
          .trim();
      }
      
      // Log what was parsed
      console.log(`Parsed status: "${status}"`);
      console.log(`Parsed note: "${noteText}"`);
      console.log(`Parsed URL: "${url}"`);
      console.log(`Parsed reasoning: "${reasoning.substring(0, 100)}..."`);
      
      // The note for display should just be note + URL
      const finalNote = url ? `${noteText} ${url}` : noteText;
      
      // Calculate character count (URLs count as 1 character in Community Notes)
      let characterCount = noteText.length;
      if (url) {
        // Add 1 for the space before URL and 1 for the URL itself
        characterCount += 2;
      }
      
      results.push({
        id: sample.id,
        url: sample.url,
        tweetText: sample.tweetText,
        originalNote: sample.originalNote,
        originalStatus: sample.status,
        generatedNote: finalNote,
        generatedReasoning: reasoning,
        generatedUrl: url,
        status: status,
        characterCount: characterCount
      });
      
      console.log(`✓ Processed sample ${results.length}/${samples.length}`);
    } catch (error) {
      console.error(`Error processing sample ${sample.id}:`, error);
      const promptError = PromptLabError.fromUnknown(error, 'Failed to process sample');
      results.push({
        id: sample.id,
        url: sample.url,
        tweetText: sample.tweetText,
        originalNote: sample.originalNote,
        originalStatus: sample.status,
        generatedNote: '',
        generatedReasoning: '',
        generatedUrl: '',
        status: 'ERROR',
        characterCount: 0,
        error: promptError.message
      });
    }
  }
  
  return results;
}

function replacePlaceholders(template: string, data: ResearchData): string {
  let result = template;
  
  // Replace main placeholders
  result = result.replace(/{tweetText}/g, data.tweetText);
  result = result.replace(/{searchResults}/g, data.searchResults);
  result = result.replace(/{citations}/g, data.citations.join('\n'));
  
  // Replace alternative formats
  result = result.replace(/\${tweetText}/g, data.tweetText);
  result = result.replace(/\${searchResults}/g, data.searchResults);
  result = result.replace(/\${citations}/g, data.citations.join('\n'));
  
  // Replace wrapped formats
  result = result.replace(/{{tweetText}}/g, data.tweetText);
  result = result.replace(/{{searchResults}}/g, data.searchResults);
  result = result.replace(/{{citations}}/g, data.citations.join('\n'));
  
  return result;
}

// Export for testing individual prompts
export async function testSinglePrompt(
  data: ResearchData,
  promptTemplate: string
) {
  const results = await testPromptOnSample([data], promptTemplate);
  const result = results[0];
  if (!result) {
    throw new PromptLabError('No result returned from prompt test', 'NO_RESULT');
  }
  return result;
}