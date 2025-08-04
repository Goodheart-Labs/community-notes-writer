import axios from "axios";
import { getOAuth1AuthHeaders } from "./authHelpers";

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
 * Submits a Community Note for a given Tweet using OAuth 1.0a authentication.
 * @param postId The ID of the tweet to annotate
 * @param info The info object for the note
 * @param testMode Whether to use test mode (default true)
 * @returns The API response
 */
export async function submitNoteOAuth1(
  postId: string,
  info: NoteInfo,
  testMode: boolean = true
): Promise<SubmitNoteResponse> {
  const url = "https://api.x.com/2/notes";
  const data = {
    info,
    post_id: postId,
    test_mode: testMode,
  };

  const body = JSON.stringify(data);
  const headers = {
    ...getOAuth1AuthHeaders(url, "POST", body),
    "Content-Type": "application/json",
  };

  const response = await axios.post(url, data, { headers });
  return response.data;
}
