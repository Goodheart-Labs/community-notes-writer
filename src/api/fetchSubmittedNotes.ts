import axios from "axios";
import { getOAuth1Headers } from "./getOAuthToken";

export type NoteStatus = 
  | "currently_rated_helpful"
  | "currently_rated_not_helpful"
  | "needs_more_ratings"
  | "";

export type EvaluationOutcome = {
  evaluator_score_bucket: "High" | "Medium" | "Low";
  evaluator_type: "HarassmentAbuse" | "UrlValidity" | "ClaimOpinion";
};

export type SubmittedNote = {
  id: string;
  status: NoteStatus;
  info?: {
    post_id: string;
    classification?: string;
    misleading_tags?: string[];
    text?: string;
    trustworthy_sources?: boolean;
  };
  test_result?: {
    evaluation_outcome?: EvaluationOutcome[];
    helpful_count?: number;
    not_helpful_count?: number;
  };
  created_at?: string;
};

export type ApiError = {
  message: string;
  code?: string;
};

export type FetchNotesResponse = {
  data?: SubmittedNote[];
  meta?: {
    result_count: number;
    next_token?: string;
  };
  errors?: ApiError[];
};

/**
 * Fetches Community Notes written by the authenticated user
 * @param testMode Whether to fetch test notes or production notes (default true)
 * @param maxResults Number of results to return (1-100, default 10)
 * @param paginationToken Token for retrieving next page of results
 * @returns The API response with submitted notes and evaluator information
 */
export async function fetchSubmittedNotes(
  testMode: boolean = true,
  maxResults: number = 10,
  paginationToken?: string
) {
  const url = "https://api.x.com/2/notes/search/notes_written";
  
  // Build query parameters
  const params = new URLSearchParams({
    test_mode: testMode.toString(),
    max_results: maxResults.toString(),
  });
  
  if (paginationToken) {
    params.append("pagination_token", paginationToken);
  }
  
  const fullUrl = `${url}?${params.toString()}`;
  
  const oauthHeaders = getOAuth1Headers(fullUrl, "GET");
  
  console.log("Request URL:", fullUrl);
  console.log("OAuth Headers:", oauthHeaders);
  
  const headers = {
    ...oauthHeaders,
    "User-Agent": "Community Notes Bot v1.0",
  };

  try {
    const response = await axios.get(fullUrl, {
      headers,
      timeout: 30000, // 30 second timeout
    });
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Error fetching submitted notes:", error.response?.data || error.message);
      return { 
        errors: error.response?.data?.errors || [{ message: error.message }] 
      };
    }
    throw error;
  }
}

/**
 * Fetches all submitted notes with pagination
 * @param testMode Whether to fetch test notes or production notes
 * @returns Array of all submitted notes
 */
export async function fetchAllSubmittedNotes(
  testMode: boolean = true
) {
  const allNotes: SubmittedNote[] = [];
  let paginationToken: string | undefined;
  
  do {
    const response = await fetchSubmittedNotes(testMode, 100, paginationToken);
    
    if (response.errors) {
      console.error("Error fetching notes:", response.errors);
      break;
    }
    
    if (response.data) {
      allNotes.push(...response.data);
    }
    
    paginationToken = response.meta?.next_token;
  } while (paginationToken);
  
  return allNotes;
}

/**
 * Displays a summary of submitted notes with their evaluator information
 * @param notes Array of submitted notes
 */
export function displayNotesSummary(notes: SubmittedNote[]) {
  console.log(`\n📊 Total notes submitted: ${notes.length}`);
  
  // Group by status
  const statusCounts = notes.reduce((acc, note) => {
    acc[note.status] = (acc[note.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log("\n📈 Notes by status:");
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });
  
  // Show notes with evaluation outcomes
  const notesWithEvaluations = notes.filter(note => 
    note.test_result?.evaluation_outcome && note.test_result.evaluation_outcome.length > 0
  );
  
  if (notesWithEvaluations.length > 0) {
    console.log(`\n👥 Notes with evaluation outcomes: ${notesWithEvaluations.length}`);
    
    notesWithEvaluations.forEach(note => {
      console.log(`\n  Note ID: ${note.id}`);
      console.log(`  Post ID: ${note.info?.post_id || 'N/A'}`);
      console.log(`  Status: ${note.status || 'empty'}`);
      
      if (note.test_result) {
        console.log(`  Helpful: ${note.test_result.helpful_count || 0}`);
        console.log(`  Not Helpful: ${note.test_result.not_helpful_count || 0}`);
        
        if (note.test_result.evaluation_outcome) {
          console.log(`  Evaluation outcomes: ${note.test_result.evaluation_outcome.length}`);
          note.test_result.evaluation_outcome.forEach(outcome => {
            console.log(`    ${outcome.evaluator_type}: ${outcome.evaluator_score_bucket}`);
          });
        }
      }
    });
  } else {
    console.log("\n👥 No notes with evaluation outcomes yet");
  }
}