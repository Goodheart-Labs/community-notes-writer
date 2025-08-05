/**
 * Parses a string to extract status, note, and url.
 * @param {string} content - The string to parse.
 * @returns {{ status: string, note: string, url: string }}
 */
export function parseStatusNoteUrl(content: string): {
  status: string;
  note: string;
  url: string;
} {
  // Split by lines and trim whitespace
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
