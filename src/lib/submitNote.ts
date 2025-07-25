import axios from "axios";
import { getBearerAuthHeader } from "./authHelpers";

export type SubmitNoteResponse = {
  data?: any;
  errors?: any;
};

export type NoteInfo = {
  classification: string;
  misleading_tags: string[];
  text: string;
  trustworthy_sources: boolean;
};

/**
 * Submits a Community Note for a given Tweet using Bearer token auth (OAuth 2.0, user context).
 * @param bearerToken OAuth 2.0 Bearer token (user context)
 * @param postId The ID of the tweet to annotate
 * @param info The info object for the note
 * @param testMode Whether to use test mode (default true)
 * @returns The API response
 */
export async function submitNote(
  bearerToken: string,
  postId: string,
  info: NoteInfo,
  testMode: boolean = true
): Promise<SubmitNoteResponse> {
  const url = "https://api.twitter.com/2/notes";
  const data = {
    info,
    post_id: postId,
    test_mode: testMode,
  };

  const headers = {
    ...getBearerAuthHeader(bearerToken),
    "Content-Type": "application/json",
  };

  const response = await axios.post(url, data, { headers });
  return response.data;
}
