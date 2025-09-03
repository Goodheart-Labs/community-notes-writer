import { config } from "dotenv";
import Airtable from "airtable";

// Load environment variables
config();

async function checkAirtableFields() {
  console.log("🔍 Checking Airtable fields...\n");

  // Initialize Airtable
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || "Table 1";

  if (!apiKey || !baseId) {
    throw new Error("Missing required environment variables: AIRTABLE_API_KEY, AIRTABLE_BASE_ID");
  }

  const base = new Airtable({ apiKey }).base(baseId);

  try {
    // Fetch one record to see what fields exist
    const records = await base(tableName)
      .select({
        maxRecords: 1,
      })
      .firstPage();

    if (records.length > 0) {
      const record = records[0];
      if (record && record.fields) {
        const fields = Object.keys(record.fields);
        console.log("Available fields in Airtable:");
        fields.forEach(field => {
          console.log(`  - "${field}"`);
        });
      }
    } else {
      console.log("No records found in Airtable");
    }

  } catch (error) {
    console.error("Error checking Airtable fields:", error);
  }
}

// Run the script
checkAirtableFields().catch(console.error);