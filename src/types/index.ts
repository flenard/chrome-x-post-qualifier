export type PostCategory = 'outstanding' | 'good' | 'engagement_bait' | 'ai_slop' | 'spam';

export interface PostMetadata {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  permalink?: string;
  quotedText?: string;   // text of a quoted post, if this post quotes one
  quotedHandle?: string; // @handle of the quoted post's author
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
  autoCollapseSlop: boolean;
  minBaitThreshold: number; // 0.0 to 1.0: confidence needed to hide bait, AI slop or spam
  focusMode: boolean;       // hide every scored post below focusMinDepth
  focusMinDepth: number;    // 1 to 5, same scale as substanceDepthNormalized
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
