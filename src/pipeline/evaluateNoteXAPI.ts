import axios from "axios";
import { getOAuth1Headers } from "../api/getOAuthToken";

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
  // Check for OAuth 1.0a credentials
  const consumer_key = process.env.X_API_KEY;
  const consumer_secret = process.env.X_API_KEY_SECRET;
  const access_token = process.env.X_ACCESS_TOKEN;
  const access_token_secret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!consumer_key || !consumer_secret || !access_token || !access_token_secret) {
    console.warn("[evaluateNoteXAPI] Missing OAuth 1.0a credentials, skipping X API evaluation");
    return {
      claimOpinionScore: 0,
      success: false,
      error: "Missing OAuth 1.0a credentials"
    };
  }

  try {
    const url = "https://api.x.com/2/evaluate_note";
    const body = JSON.stringify({
      note_text: noteText,
      post_id: postId
    });

    // Get OAuth 1.0a headers
    const oauthHeaders = getOAuth1Headers(url, "POST", body);

    const response = await axios.post(
      url,
      {
        note_text: noteText,
        post_id: postId
      },
      {
        headers: {
          ...oauthHeaders,
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