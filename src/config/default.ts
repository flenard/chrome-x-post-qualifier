import type { ExtensionSettings, ExtensionStats } from '../types';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiKey: '',                 // set in the popup; never bundled into the build
  autoQualify: true,           // Auto mode as requested by user
  autoCollapseBait: true,      // Auto collapse engagement bait with click to reveal
  autoCollapseSpam: true,      // Auto collapse spam
  autoCollapseAds: true,       // Auto hide/collapse sponsored ads
  autoCollapseSlop: true,      // Auto collapse generic AI-generated posts
  minBaitThreshold: 0.70,      // Minimum confidence to auto-collapse bait, slop or spam
  focusMode: false,            // Show only posts at or above focusMinDepth
  focusMinDepth: 3.0,
  showInFeedBadge: true
};

export const DEFAULT_STATS: ExtensionStats = {
  totalPostsAnalyzed: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCostUsd: 0,
  totalBaitCollapsed: 0,
  totalSpamCollapsed: 0,
  totalAdsBlocked: 0
};

// TypeSafe AI pricing for System One / Jev:
// $0.042 per 1,000,000 input tokens. Output tokens are free ($0.00).
export const INPUT_TOKEN_COST_PER_MILLION = 0.042;
export const OUTPUT_TOKEN_COST_PER_MILLION = 0.00;

export function calculateCostUsd(inputTokens: number, outputTokens: number = 0): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_TOKEN_COST_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_TOKEN_COST_PER_MILLION;
  return inputCost + outputCost;
}

export const TYPESAFE_API_URL = 'https://api.typesafe.ai/v1/systemone';
export const TYPESAFE_MODEL = 'jev-latest';
