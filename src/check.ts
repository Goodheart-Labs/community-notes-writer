// @ts-nocheck

SCRAPE URL
PASS IT AND CONFIRM 

async function check() {}




Given this source content and a piece of missing context, determine if the source contains information that addresses the missing context.
Missing context needed:
\`\`\`
${missingContext}
\`\`\`
Source URL: ${sourceUrl}
Source content:
\`\`\`
${sourceContent.substring(0, 30000)} // Limit to avoid token issues
\`\`\`
Analyze the source carefully and respond with ONLY:
- “YES” if the source justifies the claim, such that a person could read it and agree with the correction
- “NO” if the source is not very clear on the claim given, in any way.
Do not provide any other text, quotes, or explanations. Just respond with YES or NO.

