export class AirtableClient {
    constructor(apiKey, baseId, tableName) {
        this.apiKey = apiKey;
        this.baseId = baseId;
        this.tableName = tableName;
    }
    async fetchRecords(daysBack) {
        const tweets = new Map();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        console.log(`Fetching records from ${startDate.toISOString()} to now`);
        console.log(`Days back: ${daysBack}`);
        this.onProgress?.(`Fetching records from the last ${daysBack} day${daysBack > 1 ? 's' : ''}...`);
        let offset = '';
        let pageCount = 0;
        let totalRecords = 0;
        do {
            // Use encodeURIComponent for table name
            const encodedTableName = encodeURIComponent(this.tableName);
            // Filter by date and final note
            const dateStr = startDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
            const filterFormula = `AND({Final note} != '', IS_AFTER({Created}, '${dateStr}'))`;
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
                data.records.forEach((record) => {
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
                    }
                    catch (e) {
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
                    }
                    catch (e) {
                        console.log('Could not extract status from Full Result');
                    }
                    // Add note with record ID
                    const tweet = tweets.get(tweetId);
                    tweet.notes.push({
                        recordId: record.id,
                        botName: fields["Bot name"],
                        text: fields["Final note"],
                        status: status,
                        wouldBePosted: fields["Would be posted"] === 1,
                        wouldNathanPost: fields["Would Nathan post"]
                    });
                });
                offset = data.offset || '';
            }
            catch (error) {
                console.error('Error fetching from Airtable:', error);
                throw error;
            }
        } while (offset);
        // Filter tweets with multiple notes from different bots
        this.onProgress?.('Filtering tweets with multiple bot attempts...');
        const tweetsArray = Array.from(tweets.values());
        const filteredTweets = tweetsArray.filter(tweet => {
            const uniqueBots = new Set(tweet.notes.map(n => n.botName));
            return uniqueBots.size >= 2;
        });
        console.log(`Found ${tweetsArray.length} total tweets, ${filteredTweets.length} with multiple bot attempts`);
        this.onProgress?.(`Found ${filteredTweets.length} tweets with multiple bot attempts out of ${tweetsArray.length} total tweets`);
        return filteredTweets;
    }
    extractTweetId(url) {
        const match = url.match(/status\/(\d+)/);
        return match ? match[1] : null;
    }
    async updateNathanPostRating(recordId, rating) {
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
                        "Would Nathan post": rating
                    }
                })
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to update record ${recordId}:`, errorText);
                throw new Error(`Failed to update Airtable record: ${response.status}`);
            }
            console.log(`Updated record ${recordId} with rating ${rating}`);
        }
        catch (error) {
            console.error('Error updating Airtable:', error);
            throw error;
        }
    }
}
