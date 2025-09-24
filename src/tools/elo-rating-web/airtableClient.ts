import { AirtableRecord, Tweet, Note } from './types';

// Helper function to escape strings for Airtable formulas
function escapeAirtableString(str: string): string {
  // In Airtable formulas, single quotes are escaped by doubling them
  return str.replace(/'/g, "''");
}

export class AirtableClient {
  private apiKey: string;
  private baseId: string;
  private tableName: string;
  public onProgress?: (message: string) => void;

  constructor(apiKey: string, baseId: string, tableName: string) {
    this.apiKey = apiKey;
    this.baseId = baseId;
    this.tableName = tableName;
  }

  async fetchRecords(daysBack: number) {
    const tweets = new Map<string, Tweet>();
    const startDate = new Date();
    // Handle fractional days (e.g., 0.33 for 8 hours)
    const hoursBack = daysBack * 24;
    startDate.setHours(startDate.getHours() - hoursBack);
    
    console.log(`Fetching records from ${startDate.toISOString()} to now`);
    console.log(`Days back: ${daysBack} (${hoursBack} hours)`);
    
    // Format progress message based on time period
    let progressMsg = '';
    if (daysBack < 1) {
      progressMsg = `Fetching main branch posted notes from the last ${Math.round(hoursBack)} hours...`;
    } else if (daysBack === 1) {
      progressMsg = `Fetching main branch posted notes from the last 24 hours...`;
    } else {
      progressMsg = `Fetching main branch posted notes from the last ${daysBack} days...`;
    }
    this.onProgress?.(progressMsg);
    
    let offset = '';
    let pageCount = 0;
    let totalRecords = 0;
    
    do {
      // Use encodeURIComponent for table name
      const encodedTableName = encodeURIComponent(this.tableName);
      // Filter by date, final note, and main branch posted posts only
      const dateStr = startDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
      const filterFormula = `AND({Final note} != '', IS_AFTER({Created}, '${dateStr}'), {Bot name} = 'main', {Would be posted} = 1)`;
      const url = `https://api.airtable.com/v0/${this.baseId}/${encodedTableName}?` + 
        `filterByFormula=${encodeURIComponent(filterFormula)}` +
        `&pageSize=100` +
        `&sort[0][field]=Created&sort[0][direction]=desc` +
        (offset ? `&offset=${offset}` : '');
      
      console.log(`Fetching page ${++pageCount}...`);
      this.onProgress?.(`Fetching page ${pageCount}... (${totalRecords} records so far)`);
      
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Airtable API error: ${response.status} ${response.statusText}`, errorText);
          throw new Error(`Airtable API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        console.log(`Received ${data.records.length} records`);
        
        // Debug: log first record to see available fields
        if (pageCount === 1 && data.records.length > 0) {
          console.log('First record fields:', Object.keys(data.records[0].fields));
          console.log('First record Created value:', data.records[0].fields.Created);
        }
        
        totalRecords += data.records.length;
        this.onProgress?.(`Processing ${totalRecords} records...`);
        
        // Process records
        data.records.forEach((record: AirtableRecord) => {
          const fields = record.fields;
          const tweetUrl = fields.URL;
          const tweetId = this.extractTweetId(tweetUrl);
          
          if (!tweetId) {
            console.log('Skipping record with invalid URL:', tweetUrl);
            return;
          }
          
          // Parse tweet text from Initial tweet body (JSON)
          let tweetText = '';
          try {
            const tweetData = JSON.parse(fields["Initial tweet body"]);
            tweetText = tweetData.text || tweetData.full_text || '';
          } catch (e) {
            tweetText = fields["Initial tweet body"];
          }
          
          // Get or create tweet
          if (!tweets.has(tweetId)) {
            tweets.set(tweetId, {
              id: tweetId,
              url: tweetUrl,
              text: tweetText,
              notes: []
            });
          }
          
          // Extract status from Full Result
          let status = 'Unknown';
          try {
            const fullResult = fields["Full Result"] || '';
            const statusMatch = fullResult.match(/Final status:\s*([^\n]+)/);
            if (statusMatch) {
              status = statusMatch[1].trim();
            }
          } catch (e) {
            console.log('Could not extract status from Full Result');
          }
          
          // Add note with record ID
          const tweet = tweets.get(tweetId)!;
          tweet.notes.push({
            recordId: record.id,
            botName: fields["Bot name"],
            text: fields["Final note"],
            status: status,
            wouldBePosted: fields["Would be posted"] === 1,
            wouldNathanPost: fields["Would Nathan have posted?"]
          });
        });
        
        offset = data.offset || '';
      } catch (error) {
        console.error('Error fetching from Airtable:', error);
        throw error;
      }
    } while (offset);
    
    // Now fetch other branch attempts for these tweets
    this.onProgress?.('Fetching other branch attempts for comparison...');
    const tweetUrls = Array.from(tweets.keys()).map(id => tweets.get(id)!.url);
    
    if (tweetUrls.length > 0) {
      // Fetch other branches for the same URLs
      for (const url of tweetUrls) {
        const filterFormula = `AND({URL} = '${escapeAirtableString(url)}', {Bot name} != 'main', {Final note} != '')`;
        const otherBranchUrl = `https://api.airtable.com/v0/${this.baseId}/${encodeURIComponent(this.tableName)}?` + 
          `filterByFormula=${encodeURIComponent(filterFormula)}` +
          `&pageSize=100`;
        
        try {
          const response = await fetch(otherBranchUrl, {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            const tweetId = this.extractTweetId(url);
            
            if (tweetId && tweets.has(tweetId)) {
              const tweet = tweets.get(tweetId)!;
              
              data.records.forEach((record: AirtableRecord) => {
                const fields = record.fields;
                
                // Extract status from Full Result
                let status = 'Unknown';
                try {
                  const fullResult = fields["Full Result"] || '';
                  const statusMatch = fullResult.match(/Final status:\s*([^\n]+)/);
                  if (statusMatch) {
                    status = statusMatch[1].trim();
                  }
                } catch (e) {
                  // Ignore
                }
                
                // Add other branch notes
                tweet.notes.push({
                  recordId: record.id,
                  botName: fields["Bot name"],
                  text: fields["Final note"],
                  status: status,
                  wouldBePosted: fields["Would be posted"] === 1,
                  wouldNathanPost: fields["Would Nathan have posted?"]
                });
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching other branches for ${url}:`, error);
        }
      }
    }
    
    // Filter tweets with multiple notes from different bots
    this.onProgress?.('Filtering tweets with multiple bot attempts...');
    const tweetsArray = Array.from(tweets.values());
    const filteredTweets = tweetsArray.filter(tweet => {
      const uniqueBots = new Set(tweet.notes.map(n => n.botName));
      return uniqueBots.size >= 2;
    });
    
    console.log(`Found ${tweetsArray.length} main branch posted tweets, ${filteredTweets.length} with other branch attempts`);
    this.onProgress?.(`Found ${filteredTweets.length} tweets with multiple branch attempts out of ${tweetsArray.length} main branch posts`);
    return filteredTweets;
  }

  private extractTweetId(url: string) {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : null;
  }

  async updateNathanPostRating(recordId: string, rating: number) {
    const encodedTableName = encodeURIComponent(this.tableName);
    const url = `https://api.airtable.com/v0/${this.baseId}/${encodedTableName}/${recordId}`;
    
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            "Would Nathan have posted?": rating
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to update record ${recordId}:`, errorText);
        throw new Error(`Failed to update Airtable record: ${response.status}`);
      }

      console.log(`Updated record ${recordId} with rating ${rating}`);
    } catch (error) {
      console.error('Error updating Airtable:', error);
      throw error;
    }
  }
}