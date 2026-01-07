/**
 * Bot Configuration System
 *
 * This file defines the configuration interface for different bots
 * and provides weighted random selection for A/B testing in production.
 */

export interface BotConfig {
  /** Unique identifier for the bot */
  id: string;

  /** Human-readable name for display */
  name: string;

  /** Description of what makes this bot different */
  description: string;

  /** Model to use for note writing */
  noteModel: string;

  /** Model to use for scoring filters (optional, defaults to claude-3.5-sonnet) */
  filterModel?: string;

  /** Score thresholds (optional, uses defaults if not specified) */
  thresholds?: {
    verifiableFact?: number; // default: 0.5
    url?: number; // default: 0.5
    positive?: number; // default: 0.5
    disagreement?: number; // default: 0.5
    partisan?: number; // default: 0.5 (only used if usePartisanFilter is true)
    helpfulness?: number; // default: 0.5
    xApiScore?: number; // default: -0.25
  };

  /** Whether this bot is enabled */
  enabled: boolean;

  /** Weight for random selection (higher = more likely to be selected) */
  weight: number;

  /**
   * Search strategy for this bot
   * - "default": Use Perplexity search only (current behavior)
   * - "multi-source": Extract topic first, then search Perplexity + Google + Exa + X
   */
  searchStrategy: "default" | "multi-source";

  /**
   * Enable partisan filter - filters out posts discussing both US political parties
   * Posts that mention both Democrats and Republicans rarely get approved on Community Notes
   */
  usePartisanFilter?: boolean;

  /**
   * Enable early X API evaluation with note regeneration
   * If X API score is below -0.5, regenerate the note once
   */
  useEarlyXApiCheck?: boolean;
}

/**
 * Default thresholds used when not specified in bot config
 */
export const DEFAULT_THRESHOLDS = {
  verifiableFact: 0.5,
  url: 0.5,
  positive: 0.5,
  disagreement: 0.5,
  partisan: 0.5,
  helpfulness: 0.5,
  xApiScore: -0.25,
};

/**
 * Get thresholds for a bot, merging with defaults
 */
export function getBotThresholds(bot: BotConfig): typeof DEFAULT_THRESHOLDS {
  return {
    ...DEFAULT_THRESHOLDS,
    ...bot.thresholds,
  };
}

/**
 * Bot configurations for A/B testing
 *
 * Weights determine probability of selection:
 * - Total weight = sum of all enabled bot weights
 * - Probability = bot.weight / totalWeight
 */
export const BOT_CONFIGS: BotConfig[] = [
  {
    id: "opus-main",
    name: "Opus 4.5 (Main)",
    description: "Primary bot using Claude Opus 4.5 for highest quality notes",
    noteModel: "anthropic/claude-opus-4-5-20251101",
    enabled: true,
    weight: 78, // ~78% of traffic
    searchStrategy: "default",
  },
  {
    id: "gemini-flash",
    name: "Gemini Flash (Cheap)",
    description: "Cost-effective bot using Gemini 2.0 Flash - fast and cheap",
    noteModel: "google/gemini-2.0-flash-001",
    enabled: true,
    weight: 10, // ~10% of traffic
    searchStrategy: "default",
  },
  {
    id: "multi-search",
    name: "Multi-Source Search",
    description:
      "Extracts topic first, then searches Perplexity + Google + Exa + X for comprehensive context",
    noteModel: "anthropic/claude-opus-4-5-20251101",
    enabled: true,
    weight: 10, // ~10% of traffic
    searchStrategy: "multi-source",
  },
  {
    id: "partisan-filter",
    name: "Partisan Filter",
    description:
      "Filters out posts that discuss both US political parties (rarely approved on Community Notes)",
    noteModel: "anthropic/claude-opus-4-5-20251101",
    enabled: true,
    weight: 1, // ~1% of traffic
    searchStrategy: "default",
    usePartisanFilter: true,
  },
  {
    id: "early-x-api",
    name: "Early X API Check",
    description:
      "Runs X API evaluation earlier and regenerates note if score is too low",
    noteModel: "anthropic/claude-opus-4-5-20251101",
    enabled: true,
    weight: 1, // ~1% of traffic
    searchStrategy: "default",
    useEarlyXApiCheck: true,
    thresholds: {
      xApiScore: -0.5, // Stricter threshold for this bot
    },
  },
];

/**
 * Get all enabled bots
 */
export function getEnabledBots(): BotConfig[] {
  return BOT_CONFIGS.filter((bot) => bot.enabled);
}

/**
 * Get a bot by ID
 */
export function getBotById(id: string): BotConfig | undefined {
  return BOT_CONFIGS.find((bot) => bot.id === id);
}

/**
 * Select a random bot based on weights
 * Uses weighted random selection where higher weight = higher probability
 */
export function selectRandomBot(): BotConfig {
  const enabledBots = getEnabledBots();

  if (enabledBots.length === 0) {
    throw new Error("No enabled bots configured");
  }

  if (enabledBots.length === 1) {
    return enabledBots[0]!;
  }

  // Calculate total weight
  const totalWeight = enabledBots.reduce((sum, bot) => sum + bot.weight, 0);

  // Generate random number between 0 and totalWeight
  const random = Math.random() * totalWeight;

  // Select bot based on weight
  let cumulative = 0;
  for (const bot of enabledBots) {
    cumulative += bot.weight;
    if (random < cumulative) {
      return bot;
    }
  }

  // Fallback (shouldn't happen)
  return enabledBots[enabledBots.length - 1]!;
}

/**
 * Get selection probabilities for display/logging
 */
export function getBotProbabilities(): { id: string; probability: number }[] {
  const enabledBots = getEnabledBots();
  const totalWeight = enabledBots.reduce((sum, bot) => sum + bot.weight, 0);

  return enabledBots.map((bot) => ({
    id: bot.id,
    probability: (bot.weight / totalWeight) * 100,
  }));
}
