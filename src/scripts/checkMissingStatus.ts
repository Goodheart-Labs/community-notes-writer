import dotenv from "dotenv";

dotenv.config();

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME!;

interface AirtableRecord {
  id: string;
  fields: {
    URL?: string;
    "Final note"?: string;
    "Full Result"?: string;
    Created?: string;
    "Bot name"?: string;
  };
}

function extractNoteStatus(fullResult: string | undefined): string | undefined {
  if (!fullResult) return undefined;
  const match = fullResult.match(/NOTE STATUS:\s*([^\n]+)/i);
  return match ? match[1]!.trim() : undefined;
}

async function checkMissingStatus() {
  console.log("Checking for notes with Final note but no status...\n");

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;

  // Filter for notes that have a Final note
  const filterFormula = `AND({Final note} != '', LEN({Final note}) > 0)`;

  let allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({
      filterByFormula: filterFormula,
      fields: "URL,Final note,Full Result,Created,Bot name",
      ...(offset && { offset }),
    });

    const response = await fetch(`${url}?${params}`, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    const data = await response.json();
    allRecords = allRecords.concat(data.records);
    offset = data.offset;
  } while (offset);

  console.log(`Total notes with Final note: ${allRecords.length}`);

  // Check which ones don't have a status
  const missingStatus = allRecords.filter((record) => {
    if (!record || !record.fields) return false;
    const fullResult = record.fields["Full Result"];
    const status = extractNoteStatus(fullResult);
    return !status;
  });

  console.log(`Notes missing status: ${missingStatus.length}\n`);

  if (missingStatus.length > 0) {
    console.log("Examples of notes missing status:");
    missingStatus.slice(0, 10).forEach((record, idx) => {
      console.log(
        `\n${idx + 1}. ${record.fields["Bot name"]} - ${new Date(
          record.fields["Created"]!
        ).toISOString()}`
      );
      console.log(`   URL: ${record.fields["URL"]}`);
      console.log(
        `   Note: ${record.fields["Final note"]?.substring(0, 100)}...`
      );
      console.log(`   Has Full Result: ${!!record.fields["Full Result"]}`);
      if (record.fields["Full Result"]) {
        console.log(
          `   Full Result preview: ${record.fields["Full Result"].substring(
            0,
            200
          )}...`
        );
      }
    });
  }
}

checkMissingStatus().catch(console.error);
