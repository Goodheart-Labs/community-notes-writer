#!/usr/bin/env bun

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'All Tweets 3 months';

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('Missing required environment variables');
  process.exit(1);
}

async function testStatusExtraction() {
  console.log('Testing status extraction from Full Result field...\n');

  // Fetch 10 records with Full Result field
  const encodedTableName = encodeURIComponent(AIRTABLE_TABLE_NAME);
  const filterFormula = `AND({Final note} != '', {Full Result} != '')`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodedTableName}?` +
    `filterByFormula=${encodeURIComponent(filterFormula)}` +
    `&maxRecords=10` +
    `&sort[0][field]=Created&sort[0][direction]=desc`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Airtable API error: ${response.status} ${response.statusText}`, errorText);
      return;
    }

    const data = await response.json();
    console.log(`Fetched ${data.records.length} records\n`);

    // Test status extraction on each record
    data.records.forEach((record: any, index: number) => {
      const fields = record.fields;
      const fullResult = fields["Full Result"] || '';

      console.log(`\n===== Record ${index + 1} =====`);
      console.log(`URL: ${fields.URL}`);
      console.log(`Bot: ${fields["Bot name"]}`);

      // Show first 200 chars of Full Result
      console.log(`Full Result preview: ${fullResult.substring(0, 200)}...`);

      // Try to extract status
      let status = 'Unknown';
      const statusMatch = fullResult.match(/NOTE STATUS:\s*([^\n]+)/i);
      if (statusMatch) {
        status = statusMatch[1].trim();
      }

      console.log(`\nExtracted Status: "${status}"`);

      // Also show if there's a Status field
      if (fields["Status"]) {
        console.log(`Status field (if exists): "${fields["Status"]}"`);
      }

      // Show the actual NOTE STATUS line if found
      const noteStatusLine = fullResult.match(/.*NOTE STATUS:.*$/im);
      if (noteStatusLine) {
        console.log(`Found line: "${noteStatusLine[0].trim()}"`);
      } else {
        console.log('No "NOTE STATUS:" line found');
      }
    });

  } catch (error) {
    console.error('Error fetching from Airtable:', error);
  }
}

testStatusExtraction();