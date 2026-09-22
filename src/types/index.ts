export type PostCategory = 'outstanding' | 'good' | 'engagement_bait' | 'ai_slop' | 'spam';

export interface PostMetadata {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  permalink?: string;
  hasLinks: boolean;
  hasMedia: boolean;
  isThread: boolean;
  isAd: boolean;
}

export interface QualificationResult {
  id: string;
  category: PostCategory;
  categoryConfidence: number;
  categoryProbabilities: Record<PostCategory, number>;
  substanceDepthScore: number; // 0 to 4 (as returned by Jev rubric)
  substanceDepthNormalized: number; // 1 to 5 scale
  substanceDepthConfidence: number;
  isBaitOrSpamProbability: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: number;
}

export interface ExtensionSettings {
  apiKey: string;
  autoQualify: boolean;
  autoCollapseBait: boolean;
  autoCollapseSpam: boolean;
  autoCollapseAds: boolean;
  minBaitThreshold: number; // 0.0 to 1.0 (e.g. 0.75)
  showInFeedBadge: boolean;
}

export interface ExtensionStats {
  totalPostsAnalyzed: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalBaitCollapsed: number;
  totalSpamCollapsed: number;
  totalAdsBlocked: number;
}
