import type { PostMetadata } from '../types';

export function parseTweetElement(article: HTMLElement): PostMetadata | null {
  try {
    // 1. Check for Promoted / Ad indicators
    const isAd = detectIsAd(article);

    // 2. Extract Tweet ID and permalink
    const statusLink = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
    let tweetId = '';
    let permalink = '';

    if (statusLink) {
      const match = statusLink.href.match(/\/status\/(\d+)/);
      if (match && match[1]) {
        tweetId = match[1];
        permalink = statusLink.href;
      }
    }

    // 3. Extract Tweet Text, and the quoted post's text separately.
    // A quoted post renders inside a [role="link"] box in the same article, with
    // its own tweetText. Without it, "42% cheaper, give it a spin 👇" quoting an
    // official launch reads like an ad and gets scored as spam.
    const { text, quotedText, quotedHandle } = extractTexts(article);

    // If there's no text at all, and it's not an ad, we cannot qualify it
    if (!text && !quotedText && !isAd) {
      return null;
    }

    // Generate fallback pseudo-ID if tweetId is missing (e.g. some ads don't have public status links)
    if (!tweetId) {
      tweetId = `pseudo_${hashString(text || quotedText || article.innerText.slice(0, 100))}`;
    }

    // 4. Extract Author and Handle
    const userNameEl = article.querySelector<HTMLElement>('[data-testid="User-Name"]');
    let authorName = 'Unknown';
    let authorHandle = '@unknown';

    if (userNameEl) {
      const textContent = userNameEl.innerText.split('\n');
      if (textContent[0]) authorName = textContent[0].trim();
      const handleMatch = userNameEl.innerText.match(/@[\w_]+/);
      if (handleMatch) authorHandle = handleMatch[0];
    }

    // 5. Detect Media and Links
    const hasMedia = Boolean(
      article.querySelector('[data-testid="tweetPhoto"]') ||
      article.querySelector('video') ||
      article.querySelector('[data-testid="videoPlayer"]')
    );

    const hasLinks = Boolean(
      article.querySelector('a[target="_blank"]') ||
      article.querySelector('a[href*="t.co"]') ||
      article.querySelector('[data-testid="card.wrapper"]')
    );

    // 6. Detect Threads
    const isThread = Boolean(
      article.innerText.includes('Show this thread') ||
      article.innerText.includes('1/') ||
      text.includes('🧵') ||
      text.toLowerCase().includes('thread')
    );

    return {
      id: tweetId,
      text,
      authorName,
      authorHandle,
      permalink,
      quotedText: quotedText || undefined,
      quotedHandle: quotedHandle || undefined,
      hasLinks,
      hasMedia,
      isThread,
      isAd
    };
  } catch (err) {
    console.warn('[X-Post-Qualifier] Failed to parse tweet:', err);
    return null;
  }
}

function extractTexts(article: HTMLElement): { text: string; quotedText: string; quotedHandle: string } {
  let text = '';
  let quotedText = '';
  let quotedHandle = '';

  for (const el of Array.from(article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'))) {
    const quoteBox = el.closest<HTMLElement>('[role="link"]');
    const isQuote = quoteBox !== null && article.contains(quoteBox);

    if (!isQuote && !text) {
      text = el.innerText.trim();
    } else if (isQuote && !quotedText) {
      quotedText = el.innerText.trim();
      const handle = quoteBox.querySelector<HTMLElement>('[data-testid="User-Name"]')?.innerText.match(/@\w+/);
      quotedHandle = handle ? handle[0] : '';
    }
  }

  return { text, quotedText, quotedHandle };
}

export function detectIsAd(article: HTMLElement): boolean {
  // Check common X / Twitter Ad selectors and text patterns
  // 1. Direct "Ad" badge in the header or footer
  const spans = article.querySelectorAll('span, div');
  for (let i = 0; i < spans.length; i++) {
    const el = spans[i];
    const text = el.textContent?.trim();
    if (text === 'Ad' || text === 'Promoted' || text === 'Sponsored') {
      // Ensure it's not just a word inside a longer sentence
      if (el.children.length === 0 && el.textContent?.trim() === text) {
        return true;
      }
    }
  }

  // 2. Data attributes or test IDs used for ads
  if (
    article.querySelector('[data-testid="placementTracking"]') ||
    article.querySelector('[aria-label="Sponsored"]') ||
    article.querySelector('[aria-label="Promoted"]')
  ) {
    return true;
  }

  // 3. Check for dynamic SVG or tracking tokens
  const fullText = article.innerText;
  if (fullText.includes('\nAd\n') || fullText.endsWith('\nAd') || fullText.startsWith('Ad\n')) {
    return true;
  }

  return false;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
