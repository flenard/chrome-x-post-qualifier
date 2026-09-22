import type { ExtensionSettings, ExtensionStats } from '../types';
import { INITIAL_API_KEY } from './secret';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiKey: INITIAL_API_KEY,
  autoQualify: true,           // Auto mode as requested by user
  autoCollapseBait: true,      // Auto collapse engagement bait with click to reveal
  autoCollapseSpam: true,      // Auto collapse spam
  autoCollapseAds: true,       // Auto hide/collapse sponsored ads
  minBaitThreshold: 0.70,      // Minimum confidence to auto-collapse
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
