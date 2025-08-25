import { BranchRating, Comparison } from './types';

export class EloCalculator {
  private k: number;
  private baseRating: number;
  private ratings: Map<string, BranchRating>;

  constructor(k: number = 15, baseRating: number = 1200) {
    this.k = k;
    this.baseRating = baseRating;
    this.ratings = new Map();
  }

  private getExpected(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  private updateRating(expected: number, actual: number, currentRating: number): number {
    return currentRating + this.k * (actual - expected);
  }

  private ensureBranchExists(branchName: string): void {
    if (!this.ratings.has(branchName)) {
      this.ratings.set(branchName, {
        name: branchName,
        rating: this.baseRating,
        wins: 0,
        losses: 0,
        draws: 0,
        totalGames: 0
      });
    }
  }

  processComparison(winner: string, loser: string, isDraw: boolean = false): void {
    this.ensureBranchExists(winner);
    this.ensureBranchExists(loser);

    const winnerData = this.ratings.get(winner)!;
    const loserData = this.ratings.get(loser)!;

    // Calculate expected scores
    const expectedWinner = this.getExpected(winnerData.rating, loserData.rating);
    const expectedLoser = this.getExpected(loserData.rating, winnerData.rating);

    // Actual scores
    const actualWinner = isDraw ? 0.5 : 1;
    const actualLoser = isDraw ? 0.5 : 0;

    // Update ratings
    winnerData.rating = this.updateRating(expectedWinner, actualWinner, winnerData.rating);
    loserData.rating = this.updateRating(expectedLoser, actualLoser, loserData.rating);

    // Update stats
    winnerData.totalGames++;
    loserData.totalGames++;

    if (isDraw) {
      winnerData.draws++;
      loserData.draws++;
    } else {
      winnerData.wins++;
      loserData.losses++;
    }
  }

  getRatings(): BranchRating[] {
    return Array.from(this.ratings.values())
      .sort((a, b) => b.rating - a.rating);
  }

  getRating(branchName: string): number {
    return this.ratings.get(branchName)?.rating || this.baseRating;
  }

  reset(): void {
    this.ratings.clear();
  }

  exportData(): string {
    const data = this.getRatings();
    const headers = ['Branch', 'Rating', 'Wins', 'Losses', 'Draws', 'Total Games', 'Win Rate'];
    
    const rows = data.map(branch => {
      const winRate = branch.totalGames > 0 
        ? ((branch.wins + branch.draws * 0.5) / branch.totalGames * 100).toFixed(1) + '%'
        : 'N/A';
      
      return [
        branch.name,
        Math.round(branch.rating),
        branch.wins,
        branch.losses,
        branch.draws,
        branch.totalGames,
        winRate
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}