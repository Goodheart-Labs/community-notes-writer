/**
 * Bot Elo Tracker
 *
 * Tracks Elo ratings for bots based on automated comparisons.
 * Persists ratings to a JSON file for continuity across runs.
 */

import fs from "fs";
import path from "path";

export interface BotRating {
  botId: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  totalComparisons: number;
  lastUpdated: string;
}

export interface ComparisonRecord {
  timestamp: string;
  tweetId: string;
  winnerId: string | null; // null for draws
  loserId: string | null; // null for draws
  isDraw: boolean;
  winnerScore: number;
  loserScore: number;
  reason: string;
}

interface EloData {
  ratings: Record<string, BotRating>;
  comparisons: ComparisonRecord[];
  lastUpdated: string;
}

const ELO_FILE_PATH = path.join(
  process.cwd(),
  "data",
  "bot-elo-ratings.json"
);

const K_FACTOR = 32; // Higher K for faster rating changes
const BASE_RATING = 1200;

export class BotEloTracker {
  private data: EloData;

  constructor() {
    this.data = this.loadData();
  }

  private loadData(): EloData {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(ELO_FILE_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(ELO_FILE_PATH)) {
        const content = fs.readFileSync(ELO_FILE_PATH, "utf-8");
        return JSON.parse(content);
      }
    } catch (error) {
      console.error("[BotEloTracker] Error loading data:", error);
    }

    return {
      ratings: {},
      comparisons: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  private saveData(): void {
    try {
      const dataDir = path.dirname(ELO_FILE_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.data.lastUpdated = new Date().toISOString();
      fs.writeFileSync(ELO_FILE_PATH, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error("[BotEloTracker] Error saving data:", error);
    }
  }

  private ensureBotExists(botId: string): void {
    if (!this.data.ratings[botId]) {
      this.data.ratings[botId] = {
        botId,
        rating: BASE_RATING,
        wins: 0,
        losses: 0,
        draws: 0,
        totalComparisons: 0,
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  private getExpectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  private updateRating(
    expected: number,
    actual: number,
    currentRating: number
  ): number {
    return currentRating + K_FACTOR * (actual - expected);
  }

  /**
   * Record a comparison between two bots
   */
  recordComparison(
    tweetId: string,
    winnerId: string,
    loserId: string,
    winnerScore: number,
    loserScore: number,
    reason: string
  ): void {
    this.ensureBotExists(winnerId);
    this.ensureBotExists(loserId);

    const winner = this.data.ratings[winnerId]!;
    const loser = this.data.ratings[loserId]!;

    const isDraw = winnerScore === loserScore;

    // Calculate expected scores
    const expectedWinner = this.getExpectedScore(winner.rating, loser.rating);
    const expectedLoser = this.getExpectedScore(loser.rating, winner.rating);

    // Actual scores (1 for win, 0.5 for draw, 0 for loss)
    const actualWinner = isDraw ? 0.5 : 1;
    const actualLoser = isDraw ? 0.5 : 0;

    // Update ratings
    winner.rating = this.updateRating(
      expectedWinner,
      actualWinner,
      winner.rating
    );
    loser.rating = this.updateRating(expectedLoser, actualLoser, loser.rating);

    // Update stats
    winner.totalComparisons++;
    loser.totalComparisons++;

    if (isDraw) {
      winner.draws++;
      loser.draws++;
    } else {
      winner.wins++;
      loser.losses++;
    }

    winner.lastUpdated = new Date().toISOString();
    loser.lastUpdated = new Date().toISOString();

    // Record the comparison
    this.data.comparisons.push({
      timestamp: new Date().toISOString(),
      tweetId,
      winnerId: isDraw ? null : winnerId,
      loserId: isDraw ? null : loserId,
      isDraw,
      winnerScore,
      loserScore,
      reason,
    });

    this.saveData();
  }

  /**
   * Get the rating for a bot
   */
  getRating(botId: string): number {
    this.ensureBotExists(botId);
    return this.data.ratings[botId]!.rating;
  }

  /**
   * Get all ratings sorted by rating (highest first)
   */
  getAllRatings(): BotRating[] {
    return Object.values(this.data.ratings).sort(
      (a, b) => b.rating - a.rating
    );
  }

  /**
   * Get recent comparisons
   */
  getRecentComparisons(limit: number = 50): ComparisonRecord[] {
    return this.data.comparisons.slice(-limit).reverse();
  }

  /**
   * Get a summary string for logging
   */
  getSummary(): string {
    const ratings = this.getAllRatings();
    if (ratings.length === 0) {
      return "No bot ratings yet";
    }

    let summary = "Bot Elo Rankings:\n";
    summary += "─".repeat(60) + "\n";

    ratings.forEach((bot, idx) => {
      const winRate =
        bot.totalComparisons > 0
          ? (
              ((bot.wins + bot.draws * 0.5) / bot.totalComparisons) *
              100
            ).toFixed(1)
          : "N/A";

      summary += `${idx + 1}. ${bot.botId.padEnd(25)} `;
      summary += `Rating: ${Math.round(bot.rating).toString().padStart(4)} `;
      summary += `(W: ${bot.wins} L: ${bot.losses} D: ${bot.draws}) `;
      summary += `Win Rate: ${winRate}%\n`;
    });

    return summary;
  }

  /**
   * Reset all ratings (use with caution)
   */
  reset(): void {
    this.data = {
      ratings: {},
      comparisons: [],
      lastUpdated: new Date().toISOString(),
    };
    this.saveData();
  }
}

// Singleton instance
let trackerInstance: BotEloTracker | null = null;

export function getBotEloTracker(): BotEloTracker {
  if (!trackerInstance) {
    trackerInstance = new BotEloTracker();
  }
  return trackerInstance;
}
