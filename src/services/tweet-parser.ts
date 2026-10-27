import type { PostMetadata } from '../types';

export function parseTweetElement(article: HTMLElement): PostMetadata | null {
  try {
    // 1. Check for Promoted / Ad indicators
    const isAd = detectIsAd(article);

    // 2. Extract Tweet ID and permalink
    const statusLink = findOwnStatusLink(article);
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

/**
 * The post's own permalink: the link around its timestamp. On a post page the
 * timestamp sits at the bottom, so the first /status/ link in the article is
 * often another post's (a "From @user" video credit, a quoted post). Taking
 * that one gives the post the wrong id, and a post the user chose to show
 * gets hidden again when they click its video.
 */
function findOwnStatusLink(article: HTMLElement): HTMLAnchorElement | null {
  for (const time of Array.from(article.querySelectorAll('time'))) {
    const link = time.closest<HTMLAnchorElement>('a[href*="/status/"]');
    const quoteBox = time.closest('[role="link"]');
    if (link && !(quoteBox && article.contains(quoteBox))) return link;
  }
  return article.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
}

/** The post id for a tweet article, as used for the cache and "Show post". */
export function getTweetId(article: HTMLElement): string | null {
  const match = findOwnStatusLink(article)?.href.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * The author's @handle (original case), without "@". Read from the profile
 * link, not the visible text: a display name is free text, so a spammer named
 * "Giveaway @naval" would otherwise pass as the trusted @naval.
 */
export function getAuthorHandle(header: HTMLElement): string | null {
  for (const link of Array.from(header.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))) {
    const m = link.getAttribute('href')?.match(/^\/(\w+)$/);
    if (m) return m[1];
  }
  return null;
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

/**
 * Media players carry ad-like markers on ordinary posts: X wraps videos in
 * placementTracking, and a pre-roll ad shows its own "Ad" label inside the
 * player. Reading those hid a normal post as "Promoted" the moment its video
 * was played. Only the post's own chrome counts.
 */
const PLAYER_SELECTOR = '[data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="placementTracking"]';

export function detectIsAd(article: HTMLElement): boolean {
  // 1. The "Ad" / "Promoted" label: a leaf element holding just that word
  const labels = article.querySelectorAll('span, div');
  for (let i = 0; i < labels.length; i++) {
    const el = labels[i];
    if (el.children.length > 0) continue;
    const text = el.textContent?.trim();
    if ((text === 'Ad' || text === 'Promoted' || text === 'Sponsored') && !el.closest(PLAYER_SELECTOR)) {
      return true;
    }
  }

  // 2. Labels X sets on promoted posts
  return Boolean(
    article.querySelector('[aria-label="Sponsored"]') ||
    article.querySelector('[aria-label="Promoted"]')
  );
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
