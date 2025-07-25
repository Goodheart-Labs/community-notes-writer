import { submitNote, NoteInfo } from "./submitNote";

// Uses environment variable for Bearer token. Ensure X_BEARER_TOKEN is set before running.
const bearerToken = process.env.X_BEARER_TOKEN!;

const postId = "1948597213380395494";
const info: NoteInfo = {
  classification: "misinformed_or_potentially_misleading",
  misleading_tags: ["disputed_claim_as_fact"],
  text: "This was not a Tesla vehicle exploding while charging. A Tesla Supercharger cabinet was bombed by a suspect in Lacey, WA on April 8, 2025. The FBI is investigating this as an arson/bombing case, not a vehicle safety incident. https://electrek.co/2025/04/08/tesla-supercharger-explodes-washington-bomb-suspected/",
  trustworthy_sources: true,
};

async function testSubmitNote() {
  try {
    const response = await submitNote(bearerToken, postId, info, true);
    console.log("Note submitted successfully:", response);
  } catch (error) {
    console.error("Failed to submit note:", error.response?.data || error);
  }
}

testSubmitNote();
