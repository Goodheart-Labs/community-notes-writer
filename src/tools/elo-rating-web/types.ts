export interface AirtableRecord {
  id: string;
  fields: {
    URL: string;
    "Bot name": string;
    "Initial tweet body": string;
    "Full Result": string;
    "Final note": string;
    "Would be posted": number;
    "Would Nathan have posted?": number;
    "Created": string;
    "Not sarcasm filter"?: number;
    "URL filter"?: number;
    "Character count filter"?: number;
    "Positive claims only filter"?: number;
    "Significant correction filter"?: number;
  };
}

export interface Tweet {
  id: string;
  url: string;
  text: string;
  notes: Note[];
}

export interface Note {
  recordId: string;
  botName: string;
  text: string;
  status: string;
  wouldBePosted: boolean;
  wouldNathanPost?: number;
  fullResult?: string;
  notSarcasmFilter?: number;
  urlFilter?: number;
  characterCountFilter?: number;
  positiveClaimsFilter?: number;
  significantCorrectionFilter?: number;
}

export interface Comparison {
  tweetId: string;
  leftBot: string;
  rightBot: string;
  winner: string | null;
  leftRating?: number;
  rightRating?: number;
  timestamp: Date;
}

export interface BranchRating {
  name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
}

export interface ComparisonPair {
  tweet: Tweet;
  leftNote: Note;
  rightNote: Note;
  leftIndex: number;
  rightIndex: number;
}