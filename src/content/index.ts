import { parseTweetElement, detectIsAd } from '../services/tweet-parser';
import {
  getSettings,
  getCachedQualification,
  getTrustedHandles,
  trustHandle,
  untrustHandle,
  normalizeHandle,
  TRUSTED_KEY
} from '../services/storage';
import { injectPillBadge, injectTrustedBadge, setupTweetCollapse, clearTweetCollapse, isUnsure } from './badge';
import type { CollapseReason } from './badge';
import type { ExtensionSettings, QualificationResult } from '../types';

const DWELL_MS = 450;        // how long a tweet must stay in view before we pay to score it
const SCAN_DEBOUNCE_MS = 100; // coalesce DOM mutation bursts into one scan

let currentSettings: ExtensionSettings | null = null;
let trustedHandles = new Set<string>();
const processingTweets = new Set<string>();
type TimerId = ReturnType<typeof setTimeout>;

const dwellTimers = new Map<HTMLElement, TimerId>();

// IntersectionObserver to analyze tweets when they appear in viewport
const intersectionObserver = new IntersectionObserver(
  (entries) => {
    if (!currentSettings?.autoQualify) return;

    for (const entry of entries) {
      const el = entry.target as HTMLElement;

      // X removes tweets from the DOM as you scroll. The observer holds a strong
      // reference to every target, so drop the ones that are gone.
      if (!el.isConnected) {
        stopWatching(el);
        continue;
      }

      if (entry.isIntersecting && entry.intersectionRatio >= 0.15) {
        if (!dwellTimers.has(el)) {
          const timer = setTimeout(() => {
            dwellTimers.delete(el);
            handleQualifyTweet(el, false);
          }, DWELL_MS);
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

/** Stops the viewport watch on a tweet that is scored, or no longer on the page. */
function stopWatching(article: HTMLElement) {
  intersectionObserver.unobserve(article);
  const timer = dwellTimers.get(article);
  if (timer) {
    clearTimeout(timer);
    dwellTimers.delete(article);
  }
}

async function init() {
  currentSettings = await getSettings();
  trustedHandles = new Set(await getTrustedHandles().catch((err) => {
    console.warn('[X-Ray] Could not read trusted accounts:', err);
    return [];
  }));

  // Listen for settings changes from popup, and trust changes from any tab
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.typesafe_settings) {
        currentSettings = { ...currentSettings, ...changes.typesafe_settings.newValue };
        scanTweets();
        rejudgeTweets();
      }
      if (area === 'sync' && changes[TRUSTED_KEY]) {
        trustedHandles = new Set(changes[TRUSTED_KEY].newValue || []);
        rejudgeTweets();
      }
    });
  }

  // Initial scan
  scanTweets();

  // X mutates the DOM constantly. Without a debounce, every mutation triggers a
  // full-document querySelectorAll, hundreds of times a second.
  let scanTimer: TimerId | null = null;
  const observer = new MutationObserver(() => {
    if (scanTimer !== null) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanTweets();
    }, SCAN_DEBOUNCE_MS);
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
  if (!metadata || !(metadata.text || metadata.quotedText)) return;

  article.dataset.tsProcessed = 'true';
  article.dataset.tsTweetId = metadata.id;

  // Trusted accounts are never sent to the API.
  if (showIfTrusted(article, userNameContainer)) return;

  // Check cache first
  const cached = await getCachedQualification(metadata.id);
  if (cached) {
    applyQualification(article, userNameContainer, cached);
    return;
  }

  showUnscored(article, userNameContainer);
}

/** Not cached yet: a "Qualify" pill, plus the viewport watch in auto mode. */
function showUnscored(article: HTMLElement, header: HTMLElement) {
  injectPillBadge(header, null, () => handleQualifyTweet(article, true));
  if (currentSettings?.autoQualify) intersectionObserver.observe(article);
}

/** The author's @handle as shown (original case), without "@". */
function authorHandle(header: HTMLElement): string | null {
  const m = header.innerText.match(/@(\w+)/);
  return m ? m[1] : null;
}

/**
 * If the author is trusted: show the "Trusted" badge, undo any collapse, stop
 * scoring. Returns true when it handled the tweet.
 */
function showIfTrusted(article: HTMLElement, header: HTMLElement): boolean {
  const handle = authorHandle(header);
  if (!handle || !trustedHandles.has(normalizeHandle(handle))) return false;

  stopWatching(article);
  clearTweetCollapse(article);
  injectTrustedBadge(header, handle, () => {
    untrustHandle(handle).catch((err) => console.warn('[X-Ray] Could not remove trust:', err));
  });
  return true;
}

async function handleQualifyTweet(article: HTMLElement, force: boolean) {
  if (!currentSettings) return;

  const tweetId = article.dataset.tsTweetId;
  if (!tweetId || processingTweets.has(tweetId)) return;

  const userNameContainer = article.querySelector<HTMLElement>('[data-testid="User-Name"]');
  if (!userNameContainer) return;
  if (showIfTrusted(article, userNameContainer)) return;

  // Taken before the first await, so the dwell timer and a click that land
  // together cannot both get past the check above. Held until the reply
  // arrives: sendMessage returns immediately, so releasing this in a finally
  // block would free the lock before the API has answered and let the same
  // tweet be sent — and billed — more than once.
  processingTweets.add(tweetId);

  const cached = await getCachedQualification(tweetId).catch(() => null);
  if (cached) {
    processingTweets.delete(tweetId);
    stopWatching(article);
    applyQualification(article, userNameContainer, cached);
    return;
  }

  const metadata = parseTweetElement(article);
  if (!metadata || !(metadata.text || metadata.quotedText)) {
    processingTweets.delete(tweetId);
    return;
  }

  const failed = (reason: string) => {
    console.warn(`[X-Ray] Qualification failed for ${tweetId}:`, reason);
    processingTweets.delete(tweetId);
    injectPillBadge(userNameContainer, null, () => handleQualifyTweet(article, true));
  };

  try {
    // Send to background service worker (avoids page CSP restrictions)
    chrome.runtime.sendMessage({ type: 'QUALIFY_POST', metadata }, (response) => {
      if (chrome.runtime.lastError) {
        failed(chrome.runtime.lastError.message ?? 'runtime message error');
        return;
      }

      if (response && response.success && response.result) {
        processingTweets.delete(tweetId);
        stopWatching(article);
        applyQualification(article, userNameContainer, response.result);
        return;
      }

      failed(response?.error ?? 'no result returned');
    });
  } catch (err) {
    failed(err instanceof Error ? err.message : String(err));
  }
}

function applyQualification(
  article: HTMLElement,
  headerContainer: HTMLElement,
  result: QualificationResult
) {
  if (!currentSettings) return;
  if (showIfTrusted(article, headerContainer)) return;

  // 1. Render Badge
  if (currentSettings.showInFeedBadge) {
    const handle = authorHandle(headerContainer);
    const trust = handle
      ? {
          handle,
          onTrust: () => {
            trustHandle(handle).catch((err) => console.warn('[X-Ray] Could not save trust:', err));
          }
        }
      : undefined;
    injectPillBadge(headerContainer, result, undefined, trust);
  }

  // 2. Collapse for the first reason that applies
  // Never hide the post the user opened on purpose (its own /status/ page).
  const isOpenedPost = location.pathname.includes(`/status/${article.dataset.tsTweetId}`);
  const reason = collapseReason(result, currentSettings);
  if (reason && !isOpenedPost) {
    setupTweetCollapse(article, reason, result, currentSettings.focusMinDepth);
  }
}

/** Why a scored post should be hidden, or null to show it. Order is priority. */
function collapseReason(result: QualificationResult, settings: ExtensionSettings): CollapseReason | null {
  // An "Unsure" badge must never come with a "Spam hidden" banner.
  const confident = !isUnsure(result) && result.categoryConfidence >= (settings.minBaitThreshold || 0.7);

  if (settings.autoCollapseSpam && result.category === 'spam' && confident) return 'spam';
  if (settings.autoCollapseBait && result.category === 'engagement_bait' && confident) return 'bait';
  if (settings.autoCollapseSlop && result.category === 'ai_slop' && confident) return 'slop';
  if (settings.focusMode && result.substanceDepthNormalized < settings.focusMinDepth) return 'focus';
  return null;
}

/**
 * Settings or the trusted list changed: re-judge every tweet already on the
 * page, so a toggle, the focus bar or a "Not spam" click takes effect without
 * a reload. Scores come from the local cache, so this costs no API calls.
 */
async function rejudgeTweets() {
  const articles = document.querySelectorAll<HTMLElement>('article[data-testid="tweet"][data-ts-tweet-id]');
  for (const article of Array.from(articles)) {
    const tweetId = article.dataset.tsTweetId;
    const header = article.querySelector<HTMLElement>('[data-testid="User-Name"]');
    if (!tweetId || !header || processingTweets.has(tweetId)) continue;

    if (showIfTrusted(article, header)) continue;

    const cached = await getCachedQualification(tweetId).catch(() => null);
    clearTweetCollapse(article);
    if (cached) applyQualification(article, header, cached);
    else showUnscored(article, header);
  }
}

// Start content script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
