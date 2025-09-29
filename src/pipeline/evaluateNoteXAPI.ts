import axios from "axios";

export interface XAPIEvaluationResult {
  claimOpinionScore: number;
  success: boolean;
  error?: string;
}

/**
 * Evaluates a Community Note using X's official API
 * @param noteText The text of the community note
 * @param postId The ID of the post being annotated
 * @returns The claim_opinion_score from X API
 */
export async function evaluateNoteWithXAPI(
  noteText: string,
  postId: string
): Promise<XAPIEvaluationResult> {
  // Check for bearer token
  const bearerToken = process.env.X_BEARER_TOKEN;

  if (!bearerToken) {
    console.warn("[evaluateNoteXAPI] No X_BEARER_TOKEN found, skipping X API evaluation");
    return {
      claimOpinionScore: 0,
      success: false,
      error: "No bearer token configured"
    };
  }

  try {
    const response = await axios.post(
      "https://api.x.com/2/evaluate_note",
      {
        note_text: noteText,
        post_id: postId
      },
      {
        headers: {
          "Authorization": `Bearer ${bearerToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    const claimOpinionScore = response.data.claim_opinion_score;

    console.log(`[evaluateNoteXAPI] Score for post ${postId}: ${claimOpinionScore}`);

    return {
      claimOpinionScore,
      success: true
    };
  } catch (error: any) {
    console.error("[evaluateNoteXAPI] Error evaluating note:", error.response?.data || error.message);

    // Return a neutral score if API fails (don't block the pipeline)
    return {
      claimOpinionScore: 0,
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}