/**
 * Show current bot Elo rankings
 *
 * Usage: bun run elo-rankings
 */

import { getBotEloTracker } from "../lib/botEloTracker";
import { getEnabledBots, BOT_CONFIGS } from "../lib/botConfig";

function main() {
  console.log("═".repeat(60));
  console.log("BOT ELO RANKINGS");
  console.log("═".repeat(60));

  const eloTracker = getBotEloTracker();

  console.log("\n📊 Current Rankings:\n");
  console.log(eloTracker.getSummary());

  console.log("\n📋 Available Bot Configurations:\n");
  BOT_CONFIGS.forEach((bot) => {
    const status = bot.enabled ? "✓ enabled" : "✗ disabled";
    const rating = eloTracker.getRating(bot.id);
    console.log(`  ${bot.id.padEnd(25)} ${status.padEnd(12)} Elo: ${Math.round(rating)}`);
    console.log(`    Model: ${bot.noteModel}`);
    if (bot.thresholds) {
      console.log(`    Custom thresholds: ${JSON.stringify(bot.thresholds)}`);
    }
    console.log();
  });

  console.log("\n📈 Recent Comparisons:\n");
  const recentComparisons = eloTracker.getRecentComparisons(20);
  if (recentComparisons.length === 0) {
    console.log("  No comparisons yet. Run 'bun run multi-bot' to start comparing bots.");
  } else {
    recentComparisons.forEach((c) => {
      const date = new Date(c.timestamp).toLocaleString();
      const outcome = c.isDraw ? "Draw" : `${c.winnerId} won`;
      console.log(`  [${date}] Tweet ${c.tweetId}`);
      console.log(`    ${outcome} - ${c.reason}`);
      console.log();
    });
  }

  console.log("\n💡 Tips:");
  console.log("  - Run 'bun run multi-bot' to evaluate bots against new tweets");
  console.log("  - Edit src/lib/botConfig.ts to add/modify bot configurations");
  console.log("  - Elo ratings are stored in data/bot-elo-ratings.json");
}

main();
