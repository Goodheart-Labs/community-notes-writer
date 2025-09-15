export class EloCalculator {
    constructor(k = 15, baseRating = 1200) {
        this.k = k;
        this.baseRating = baseRating;
        this.ratings = new Map();
    }
    getExpected(ratingA, ratingB) {
        return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    }
    updateRating(expected, actual, currentRating) {
        return currentRating + this.k * (actual - expected);
    }
    ensureBranchExists(branchName) {
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
    processComparison(winner, loser, isDraw = false) {
        this.ensureBranchExists(winner);
        this.ensureBranchExists(loser);
        const winnerData = this.ratings.get(winner);
        const loserData = this.ratings.get(loser);
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
        }
        else {
            winnerData.wins++;
            loserData.losses++;
        }
    }
    getRatings() {
        return Array.from(this.ratings.values())
            .sort((a, b) => b.rating - a.rating);
    }
    getRating(branchName) {
        return this.ratings.get(branchName)?.rating || this.baseRating;
    }
    reset() {
        this.ratings.clear();
    }
    exportData() {
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
