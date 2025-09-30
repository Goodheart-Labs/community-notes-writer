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

    console.log(`[evaluateNoteXAPI] Making request to: ${url}`);
    console.log(`[evaluateNoteXAPI] Post ID: ${postId}`);
    console.log(`[evaluateNoteXAPI] Note text length: ${noteText.length}`);

    // Get OAuth 1.0a headers
    const oauthHeaders = getOAuth1Headers(url, "POST", body);
    console.log(`[evaluateNoteXAPI] OAuth headers generated successfully`);

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

    console.log(`[evaluateNoteXAPI] Response status: ${response.status}`);
    console.log(`[evaluateNoteXAPI] Response data:`, JSON.stringify(response.data, null, 2));

    // According to X API docs, claim_opinion_score is nested under data.data
    const claimOpinionScore = response.data.data?.claim_opinion_score;

    console.log(`[evaluateNoteXAPI] Extracted claim_opinion_score: ${claimOpinionScore}`);
    console.log(`[evaluateNoteXAPI] Type of score: ${typeof claimOpinionScore}`);

    if (claimOpinionScore === undefined || claimOpinionScore === null) {
      console.warn(`[evaluateNoteXAPI] WARNING: claim_opinion_score is ${claimOpinionScore}`);
      console.warn(`[evaluateNoteXAPI] Full response structure:`, {
        hasData: !!response.data.data,
        dataKeys: response.data.data ? Object.keys(response.data.data) : "no data field",
        errors: response.data.errors || "no errors field"
      });
    }

    return {
      claimOpinionScore: claimOpinionScore !== undefined ? claimOpinionScore : 0,
      success: true
    };
  } catch (error: any) {
    console.error("[evaluateNoteXAPI] Error evaluating note:");
    console.error("[evaluateNoteXAPI] Error message:", error.message);
    console.error("[evaluateNoteXAPI] Response status:", error.response?.status);
    console.error("[evaluateNoteXAPI] Response data:", JSON.stringify(error.response?.data, null, 2));
    console.error("[evaluateNoteXAPI] Request config:", {
      url: error.config?.url,
      method: error.config?.method,
      headers: error.config?.headers
    });

    // Return a neutral score if API fails (don't block the pipeline)
    return {
      claimOpinionScore: 0,
      success: false,
      error: error.response?.data?.detail || error.response?.data?.message || error.message
    };
  }
}