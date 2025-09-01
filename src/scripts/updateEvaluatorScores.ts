import { config } from "dotenv";
import { fetchAllSubmittedNotes } from "../api/fetchSubmittedNotes";
import Airtable from "airtable";

// Load environment variables
config();

interface AirtableRecord {
  id: string;
  fields: {
    URL: string;
    "Bot name"?: string;
    "HarassmentAbuse score"?: string;
    "UrlValidity score"?: string;
    "ClaimOpinion score"?: string;
  };
}

async function updateEvaluatorScores() {
  console.log("🔍 Fetching submitted Community Notes to update evaluator scores...\n");

  // Initialize Airtable
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || "Table 1";

  if (!apiKey || !baseId) {
    throw new Error("Missing required environment variables: AIRTABLE_API_KEY, AIRTABLE_BASE_ID");
  }

  const base = new Airtable({ apiKey }).base(baseId);

  try {
    // Fetch all test notes with evaluator information
    const notes = await fetchAllSubmittedNotes(true);
    console.log(`Found ${notes.length} test notes\n`);

    // Create a map of post_id to evaluator scores
    const evaluatorScoresMap = new Map<string, {
      HarassmentAbuse?: string;
      UrlValidity?: string;
      ClaimOpinion?: string;
    }>();

    notes.forEach(note => {
      if (note.test_result?.evaluation_outcome && Array.isArray(note.test_result.evaluation_outcome)) {
        const scores: any = {};
        
        note.test_result.evaluation_outcome.forEach((evaluation: any) => {
          if (evaluation.evaluator_type === "HarassmentAbuse") {
            scores.HarassmentAbuse = evaluation.evaluator_score_bucket;
          } else if (evaluation.evaluator_type === "UrlValidity") {
            scores.UrlValidity = evaluation.evaluator_score_bucket;
          } else if (evaluation.evaluator_type === "ClaimOpinion") {
            scores.ClaimOpinion = evaluation.evaluator_score_bucket;
          }
        });

        if (Object.keys(scores).length > 0 && note.info?.post_id) {
          evaluatorScoresMap.set(note.info.post_id, scores);
        }
      }
    });

    console.log(`Found evaluator scores for ${evaluatorScoresMap.size} posts\n`);
    
    // Show sample of evaluator scores found
    if (evaluatorScoresMap.size > 0) {
      console.log("Sample evaluator scores found:");
      let count = 0;
      evaluatorScoresMap.forEach((scores, postId) => {
        if (count < 3) {
          console.log(`  Post ${postId}:`, scores);
          count++;
        }
      });
      console.log("");
    }

    // Fetch Airtable records that need updating
    const recordsToUpdate: AirtableRecord[] = [];
    
    await base(tableName)
      .select({
        fields: ["URL", "Bot name", "HarassmentAbuse score", "UrlValidity score", "ClaimOpinion score"],
        pageSize: 100,
      })
      .eachPage((records, fetchNextPage) => {
        records.forEach((record) => {
          const url = record.get("URL") as string;
          
          // Extract post ID from URL (format: https://twitter.com/i/status/POST_ID)
          const postIdMatch = url?.match(/status\/(\d+)/);
          if (postIdMatch) {
            const postId = postIdMatch[1];
            const scores = evaluatorScoresMap.get(postId);
            
            if (scores) {
              // Check if any scores are missing in Airtable
              const needsUpdate = 
                (!record.get("HarassmentAbuse score") && scores.HarassmentAbuse) ||
                (!record.get("UrlValidity score") && scores.UrlValidity) ||
                (!record.get("ClaimOpinion score") && scores.ClaimOpinion);
              
              if (needsUpdate) {
                recordsToUpdate.push({
                  id: record.id,
                  fields: {
                    URL: url,
                    ...(scores.HarassmentAbuse && !record.get("HarassmentAbuse score") 
                      ? { "HarassmentAbuse score": scores.HarassmentAbuse } 
                      : {}),
                    ...(scores.UrlValidity && !record.get("UrlValidity score") 
                      ? { "UrlValidity score": scores.UrlValidity } 
                      : {}),
                    ...(scores.ClaimOpinion && !record.get("ClaimOpinion score") 
                      ? { "ClaimOpinion score": scores.ClaimOpinion } 
                      : {}),
                  }
                });
              }
            }
          }
        });
        fetchNextPage();
      });

    console.log(`Found ${recordsToUpdate.length} Airtable records that need evaluator scores\n`);

    // Update records in batches of 10 (Airtable's limit)
    for (let i = 0; i < recordsToUpdate.length; i += 10) {
      const batch = recordsToUpdate.slice(i, i + 10);
      
      const updates = batch.map(record => ({
        id: record.id,
        fields: {
          ...(record.fields["HarassmentAbuse score"] ? { "HarassmentAbuse score": record.fields["HarassmentAbuse score"] } : {}),
          ...(record.fields["UrlValidity score"] ? { "UrlValidity score": record.fields["UrlValidity score"] } : {}),
          ...(record.fields["ClaimOpinion score"] ? { "ClaimOpinion score": record.fields["ClaimOpinion score"] } : {}),
        }
      }));

      await base(tableName).update(updates);
      console.log(`Updated batch ${Math.floor(i / 10) + 1} of ${Math.ceil(recordsToUpdate.length / 10)}`);
    }

    console.log("\n✅ Successfully updated evaluator scores in Airtable!");

    // Show summary
    const summary = recordsToUpdate.reduce((acc, record) => {
      if (record.fields["HarassmentAbuse score"]) acc.harassmentAbuse++;
      if (record.fields["UrlValidity score"]) acc.urlValidity++;
      if (record.fields["ClaimOpinion score"]) acc.claimOpinion++;
      return acc;
    }, { harassmentAbuse: 0, urlValidity: 0, claimOpinion: 0 });

    console.log("\n📊 Update Summary:");
    console.log(`  HarassmentAbuse scores added: ${summary.harassmentAbuse}`);
    console.log(`  UrlValidity scores added: ${summary.urlValidity}`);
    console.log(`  ClaimOpinion scores added: ${summary.claimOpinion}`);

  } catch (error) {
    console.error("Error updating evaluator scores:", error);
  }
}

// Run the script
updateEvaluatorScores().catch(console.error);