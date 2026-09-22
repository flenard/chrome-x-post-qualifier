import { parseTweetElement, detectIsAd } from '../services/tweet-parser';
import {
  getSettings,
  getCachedQualification
} from '../services/storage';
import { injectPillBadge, setupTweetCollapse } from './badge';
import type { ExtensionSettings, QualificationResult } from '../types';

let currentSettings: ExtensionSettings | null = null;
const processingTweets = new Set<string>();
const dwellTimers = new Map<HTMLElement, NodeJS.Timeout>();

// IntersectionObserver to analyze tweets when they appear in viewport
const intersectionObserver = new IntersectionObserver(
  (entries) => {
    if (!currentSettings?.autoQualify) return;

    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.15) {
        if (!dwellTimers.has(el)) {
          const timer = setTimeout(() => {
            dwellTimers.delete(el);
            handleQualifyTweet(el, false);
          }, 450);
          dwellTimers.set(el, timer);
        }
      } else {
        const timer = dwellTimers.get(el);
        if (timer) {
          clearTimeout(timer);
          dwellTimers.delete(el);
        }
      }
    }
  },
  { threshold: [0.15] }
);

async function init() {
  currentSettings = await getSettings();

  // Listen for settings changes from popup
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.typesafe_settings) {
        currentSettings = { ...currentSettings, ...changes.typesafe_settings.newValue };
        scanTweets();
      }
    });
  }

  // Initial scan
  scanTweets();

  // MutationObserver to detect newly loaded tweets dynamically
  const observer = new MutationObserver(() => {
    scanTweets();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('[X-Ray] Content script loaded and active on timeline.');
}

function scanTweets() {
  if (!currentSettings) return;

  const articles = document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]');
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    processTweetArticle(article);
  }
}

async function processTweetArticle(article: HTMLElement) {
  if (!currentSettings) return;

  // 1. Handle Sponsored / Ads
  if (detectIsAd(article)) {
    if (currentSettings.autoCollapseAds && article.dataset.tsAdHandled !== 'true') {
      article.dataset.tsAdHandled = 'true';
      setupTweetCollapse(article, 'ad');
      chrome.runtime.sendMessage({ type: 'RECORD_AD' }).catch(() => {});
    }
    return;
  }

  // 2. Locate Tweet Header for badge placement
  const userNameContainer = article.querySelector<HTMLElement>('[data-testid="User-Name"]');
  if (!userNameContainer) return;

  // If already processed or processing, skip
  if (article.dataset.tsProcessed === 'true') return;

  const metadata = parseTweetElement(article);
  if (!metadata || !metadata.text) return;

  article.dataset.tsProcessed = 'true';
  article.dataset.tsTweetId = metadata.id;

  // Check cache first
  const cached = await getCachedQualification(metadata.id);
  if (cached) {
    applyQualification(article, userNameContainer, cached);
    return;
  }

  // If not cached:
  if (currentSettings.autoQualify) {
    injectPillBadge(userNameContainer, null, () => handleQualifyTweet(article, true));
    intersectionObserver.observe(article);
  } else {
    injectPillBadge(userNameContainer, null, () => handleQualifyTweet(article, true));
  }
}

async function handleQualifyTweet(article: HTMLElement, force: boolean) {
  if (!currentSettings) return;

  const tweetId = article.dataset.tsTweetId;
  if (!tweetId || processingTweets.has(tweetId)) return;

  const userNameContainer = article.querySelector<HTMLElement>('[data-testid="User-Name"]');
  if (!userNameContainer) return;

  // Check cache again
  const cached = await getCachedQualification(tweetId);
  if (cached) {
    applyQualification(article, userNameContainer, cached);
    return;
  }

  const metadata = parseTweetElement(article);
  if (!metadata || !metadata.text) return;

  processingTweets.add(tweetId);

  try {
    // Send to background service worker (avoids page CSP restrictions)
    chrome.runtime.sendMessage({ type: 'QUALIFY_POST', metadata }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[X-Ray] Runtime message error:', chrome.runtime.lastError.message);
        injectPillBadge(userNameContainer, null, () => handleQualifyTweet(article, true));
        return;
      }

      if (response && response.success && response.result) {
        applyQualification(article, userNameContainer, response.result);
      } else {
        console.error('[X-Ray] Qualification failed:', response?.error);
        injectPillBadge(userNameContainer, null, () => handleQualifyTweet(article, true));
      }
    });
  } catch (err) {
    console.error(`[X-Ray] Error dispatching tweet ${tweetId}:`, err);
    injectPillBadge(userNameContainer, null, () => handleQualifyTweet(article, true));
  } finally {
    processingTweets.delete(tweetId);
  }
}

function applyQualification(
  article: HTMLElement,
  headerContainer: HTMLElement,
  result: QualificationResult
) {
  if (!currentSettings) return;

  // 1. Render Badge
  if (currentSettings.showInFeedBadge) {
    injectPillBadge(headerContainer, result);
  }

  // 2. Check Auto-Collapse for Engagement Bait
  if (
    currentSettings.autoCollapseBait &&
    result.category === 'engagement_bait' &&
    result.categoryConfidence >= (currentSettings.minBaitThreshold || 0.7)
  ) {
    setupTweetCollapse(article, 'bait', result);
  }

  // 3. Check Auto-Collapse for Spam
  if (
    currentSettings.autoCollapseSpam &&
    result.category === 'spam' &&
    result.categoryConfidence >= 0.75
  ) {
    setupTweetCollapse(article, 'spam', result);
  }
}

// Start content script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
