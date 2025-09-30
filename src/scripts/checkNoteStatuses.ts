import dotenv from 'dotenv';

dotenv.config();

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME!;

interface AirtableRecord {
  id: string;
  fields: {
    'Full Result'?: string;
    'Final note'?: string;
    'Would be posted'?: number;
  };
}

function extractNoteStatus(fullResult: string | undefined): string | undefined {
  if (!fullResult) return undefined;
  const match = fullResult.match(/NOTE STATUS:\s*([^\n]+)/i);
  return match ? match[1].trim() : undefined;
}

async function checkNoteStatuses() {
  console.log('Checking all unique note statuses...\n');

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;

  // Filter for notes with Final note and not posted
  const filterFormula = `{Would be posted} = 0`;

  let allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({
      filterByFormula: filterFormula,
      fields: 'Full Result,Final note,Would be posted',
      ...(offset && { offset }),
    });

    const response = await fetch(`${url}?${params}`, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    const data = await response.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset;
  } while (offset);

  console.log(`Total notes analyzed: ${allRecords.length}`);

  // Count statuses
  const statusCounts = new Map<string, number>();

  allRecords.forEach(record => {
    if (!record?.fields) return;
    const status = extractNoteStatus(record.fields['Full Result']);
    const statusKey = status || 'NO_STATUS';
    statusCounts.set(statusKey, (statusCounts.get(statusKey) || 0) + 1);
  });

  console.log('\nUnique statuses and counts:');
  Array.from(statusCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
}

checkNoteStatuses().catch(console.error);
