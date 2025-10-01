export interface CharacterLimitResult {
  valid: boolean;
  characterCount: number;
  limit: number;
  reasoning: string;
}

/**
 * Check if a Community Note meets Twitter's character limit
 * URLs count as 23 characters (Twitter's t.co shortened URL length)
 * All other text counts normally
 */
export function checkCharacterLimit(noteText: string): CharacterLimitResult {
  const CHAR_LIMIT = 280;
  const URL_LENGTH = 1; // Twitter's t.co shortened URL length
  
  // Regex to match URLs
  const urlRegex = /https?:\/\/[^\s]+/g;
  
  // Find all URLs in the text
  const urls = noteText.match(urlRegex) || [];
  
  // Replace each URL with 23 characters worth of placeholders for counting
  let textForCounting = noteText;
  urls.forEach(url => {
    // Replace the URL with exactly 23 characters
    const placeholder = 'X'.repeat(URL_LENGTH);
    textForCounting = textForCounting.replace(url, placeholder);
  });
  
  // Count the characters
  const characterCount = textForCounting.length;
  const isValid = characterCount <= CHAR_LIMIT;
  
  return {
    valid: isValid,
    characterCount,
    limit: CHAR_LIMIT,
    reasoning: isValid 
      ? `Note is ${characterCount} characters (within ${CHAR_LIMIT} limit)`
      : `Note is ${characterCount} characters (exceeds ${CHAR_LIMIT} limit by ${characterCount - CHAR_LIMIT})`,
  };
}