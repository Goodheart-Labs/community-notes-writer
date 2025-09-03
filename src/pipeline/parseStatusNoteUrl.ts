/**
 * Parses a string to extract status, note, url, and reasoning.
 * @param {string} content - The string to parse.
 * @returns {{ status: string, note: string, url: string, reasoning: string }}
 */
export function parseStatusNoteUrl(content: string): {
  status: string;
  note: string;
  url: string;
  reasoning?: string;
} {
  // Look for the new format with "Status:" and "Note:" labels
  const statusMatch = content.match(/Status:\s*(.+?)(?:\n|$)/i);
  const noteMatch = content.match(/Note:\s*([\s\S]+?)(?:$)/i);
  
  if (statusMatch && statusMatch[1] && noteMatch && noteMatch[1]) {
    // New format detected
    let status = statusMatch[1].trim();
    let noteContent = noteMatch[1].trim();
    
    // Extract URL from the note content
    const urlMatch = noteContent.match(/https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+/);
    let url = urlMatch ? urlMatch[0] : "";
    
    // Remove URL from note text (it will be added back later if needed)
    let note = noteContent.replace(/https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+/g, '').trim();
    
    // Extract reasoning (everything before "Status:")
    let reasoning = "";
    const statusIndex = content.indexOf("Status:");
    if (statusIndex > 0) {
      reasoning = content.substring(0, statusIndex).trim();
      // Remove any [Reasoning] label if present
      reasoning = reasoning.replace(/^\[?Reasoning\]?:?\s*/i, '').trim();
    }
    
    return { status, note, url, reasoning };
  }
  
  // Fall back to old format for backward compatibility
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error("Empty content");
  }
  // Status is the first non-empty line
  const status: string = lines[0] ?? "";
  // Find a URL in any line
  let url = "";
  let urlLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]?.match(/https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+/);
    if (match && match[0]) {
      url = match[0];
      urlLineIdx = i;
      break;
    }
  }
  // Note is everything except the status and url line
  const noteLines = lines.filter((_, idx) => idx !== 0 && idx !== urlLineIdx);
  const note: string = noteLines.join(" ").trim();
  return { status, note, url };
}
