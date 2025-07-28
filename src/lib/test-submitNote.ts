import { submitNote, type NoteInfo } from "./submitNote";

// Uses environment variable for Bearer token. Ensure X_BEARER_TOKEN is set before running.
const bearerToken = process.env.X_BEARER_TOKEN!;

const postId = "1949517747383054433";
const info: NoteInfo = {
  classification: "misinformed_or_potentially_misleading",
  misleading_tags: ["disputed_claim_as_fact"],
  text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  trustworthy_sources: true,
};

async function testSubmitNote() {
  try {
    const response = await submitNote(bearerToken, postId, info, true);
    console.log("Note submitted successfully:", response);
  } catch (error: any) {
    console.error("Failed to submit note:", error.response?.data || error);
  }
}

testSubmitNote();
