import type { QualificationResult, PostCategory } from '../types';

export interface CategoryTheme {
  label: string;
  emoji: string;
  bg: string;
  border: string;
  text: string;
  bannerBg: string;
}

export const CATEGORY_THEMES: Record<PostCategory, CategoryTheme> = {
  outstanding: {
    label: 'High Signal',
    emoji: '🌟',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(52, 211, 153, 0.4)',
    text: '#34d399',
    bannerBg: 'rgba(6, 78, 59, 0.3)'
  },
  good: {
    label: 'Good Post',
    emoji: '💡',
    bg: 'rgba(14, 165, 233, 0.15)',
    border: 'rgba(56, 189, 248, 0.4)',
    text: '#38bdf8',
    bannerBg: 'rgba(12, 74, 110, 0.3)'
  },
  engagement_bait: {
    label: 'Engagement Bait',
    emoji: '🪤',
    bg: 'rgba(245, 158, 11, 0.18)',
    border: 'rgba(251, 191, 36, 0.45)',
    text: '#fbbf24',
    bannerBg: 'rgba(120, 53, 15, 0.3)'
  },
  ai_slop: {
    label: 'AI-Generated',
    emoji: '🤖',
    bg: 'rgba(168, 85, 247, 0.18)',
    border: 'rgba(192, 132, 252, 0.4)',
    text: '#c084fc',
    bannerBg: 'rgba(88, 28, 135, 0.3)'
  },
  spam: {
    label: 'Spam / Scam',
    emoji: '🚫',
    bg: 'rgba(239, 68, 68, 0.18)',
    border: 'rgba(248, 113, 113, 0.45)',
    text: '#f87171',
    bannerBg: 'rgba(127, 29, 29, 0.35)'
  }
};

/**
 * Creates or updates the Shadow DOM badge inside a tweet
 */
export function injectPillBadge(
  headerContainer: HTMLElement,
  result: QualificationResult | null,
  onManualTrigger?: () => void
): HTMLElement {
  let badgeHost = headerContainer.querySelector<HTMLElement>('.ts-qualifier-badge-host');
  if (!badgeHost) {
    badgeHost = document.createElement('div');
    badgeHost.className = 'ts-qualifier-badge-host';
    badgeHost.style.display = 'inline-flex';
    badgeHost.style.alignItems = 'center';
    badgeHost.style.marginLeft = '8px';
    badgeHost.style.verticalAlign = 'middle';
    badgeHost.style.position = 'relative';
    headerContainer.appendChild(badgeHost);
  }

  // Use shadow root to isolate styles
  const shadow = badgeHost.shadowRoot || badgeHost.attachShadow({ mode: 'open' });

  if (!result) {
    // Loading or manual trigger state
    shadow.innerHTML = `
      <style>${getBadgeStyles()}</style>
      <button class="ts-badge ts-badge-manual" title="Click to qualify this post">
        <span class="ts-sparkle">⚡</span>
        <span>Qualify</span>
      </button>
    `;

    const btn = shadow.querySelector('button');
    if (btn && onManualTrigger) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        btn.classList.add('ts-loading');
        btn.innerHTML = `<span class="ts-spinner"></span><span>Analyzing...</span>`;
        onManualTrigger();
      });
    }
    return badgeHost;
  }

  const theme = CATEGORY_THEMES[result.category] || CATEGORY_THEMES.good;
  const depth = result.substanceDepthNormalized.toFixed(1);

  shadow.innerHTML = `
    <style>${getBadgeStyles()}</style>
    <div class="ts-badge-container">
      <button class="ts-badge" style="background:${theme.bg}; border-color:${theme.border}; color:${theme.text};">
        <span class="ts-emoji">${theme.emoji}</span>
        <span class="ts-title">${theme.label}</span>
        <span class="ts-sub">${depth}/5</span>
      </button>
    </div>
  `;

  const triggerBtn = shadow.querySelector<HTMLButtonElement>('.ts-badge');
  if (triggerBtn) {
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      openPortalPopover(triggerBtn, result);
    });
  }

  return badgeHost;
}

let activePopoverCleanup: (() => void) | null = null;

function openPortalPopover(anchorEl: HTMLElement, result: QualificationResult) {
  if (activePopoverCleanup) {
    activePopoverCleanup();
    activePopoverCleanup = null;
  }

  const theme = CATEGORY_THEMES[result.category] || CATEGORY_THEMES.good;
  const confidencePct = Math.round(result.categoryConfidence * 100);
  const depth = result.substanceDepthNormalized.toFixed(1);

  const portalHost = document.createElement('div');
  portalHost.className = 'ts-portal-popover-host';
  portalHost.style.position = 'fixed';
  portalHost.style.zIndex = '2147483647';
  portalHost.style.pointerEvents = 'auto';

  // Calculate coordinates relative to viewport
  const rect = anchorEl.getBoundingClientRect();
  const width = 280;
  let left = rect.right - width;
  if (left < 12) left = 12;
  if (left + width > window.innerWidth - 12) {
    left = window.innerWidth - width - 12;
  }

  let top = rect.bottom + 8;
  if (top + 240 > window.innerHeight) {
    top = Math.max(12, rect.top - 240 - 8);
  }

  portalHost.style.top = `${top}px`;
  portalHost.style.left = `${left}px`;

  const shadow = portalHost.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .ts-popover-card {
        width: 280px;
        background: #0f172a !important; /* 100% opaque slate-900 */
        border: 1px solid #334155;
        border-radius: 12px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.05);
        padding: 14px;
        color: #f8fafc;
        animation: ts-pop-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes ts-pop-in {
        from { opacity: 0; transform: translateY(-4px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .ts-popover-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-bottom: 10px;
        margin-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .ts-popover-title {
        font-size: 13.5px;
        font-weight: 700;
        line-height: 1.2;
      }
      .ts-popover-subtitle {
        font-size: 11px;
        color: #94a3b8;
        margin-top: 2px;
      }
      .ts-close-btn {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 18px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        line-height: 1;
      }
      .ts-close-btn:hover {
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.1);
      }
      .ts-meter-group {
        margin-bottom: 10px;
      }
      .ts-meter-label {
        display: flex;
        justify-content: space-between;
        font-size: 11.5px;
        color: #cbd5e1;
        margin-bottom: 4px;
      }
      .ts-progress-bar {
        height: 6px;
        background: #1e293b;
        border-radius: 9999px;
        overflow: hidden;
      }
      .ts-progress-fill {
        height: 100%;
        border-radius: 9999px;
      }
      .ts-cost-info {
        font-size: 10px;
        color: #64748b;
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        justify-content: space-between;
      }
    </style>
    <div class="ts-popover-card">
      <div class="ts-popover-header">
        <span style="font-size: 20px;">${theme.emoji}</span>
        <div style="flex:1;">
          <div class="ts-popover-title" style="color: ${theme.text};">${theme.label}</div>
          <div class="ts-popover-subtitle">${confidencePct}% confidence by TypeSafe AI</div>
        </div>
        <button class="ts-close-btn">&times;</button>
      </div>

      <div class="ts-meter-group">
        <div class="ts-meter-label">
          <span>Substance & Depth</span>
          <strong style="color:${theme.text};">${depth} / 5.0</strong>
        </div>
        <div class="ts-progress-bar">
          <div class="ts-progress-fill" style="width: ${(result.substanceDepthNormalized / 5) * 100}%; background: ${theme.text};"></div>
        </div>
      </div>

      <div class="ts-meter-group">
        <div class="ts-meter-label">
          <span>Bait / Noise Likelihood</span>
          <strong>${Math.round(result.isBaitOrSpamProbability * 100)}%</strong>
        </div>
        <div class="ts-progress-bar">
          <div class="ts-progress-fill" style="width: ${result.isBaitOrSpamProbability * 100}%; background: ${result.isBaitOrSpamProbability > 0.6 ? '#f87171' : '#34d399'};"></div>
        </div>
      </div>

      <div class="ts-cost-info">
        <span>⚡ 1 pass evaluation</span>
        <span>${(result.costUsd * 1000).toFixed(4)}¢ (${result.inputTokens} tok)</span>
      </div>
    </div>
  `;

  document.body.appendChild(portalHost);

  const closePopover = () => {
    if (portalHost.parentNode) {
      portalHost.parentNode.removeChild(portalHost);
    }
    document.removeEventListener('click', onDocClick);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('keydown', onKey);
    activePopoverCleanup = null;
  };

  const onDocClick = (e: MouseEvent) => {
    if (!portalHost.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) {
      closePopover();
    }
  };

  const onScroll = () => {
    closePopover();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePopover();
  };

  shadow.querySelector('.ts-close-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closePopover();
  });

  setTimeout(() => {
    document.addEventListener('click', onDocClick);
    window.addEventListener('scroll', onScroll, { capture: true, once: true });
    window.addEventListener('keydown', onKey);
  }, 50);

  activePopoverCleanup = closePopover;
}

/**
 * Collapses a tweet element and injects a sleek, native-feeling reveal banner
 */
export function setupTweetCollapse(
  article: HTMLElement,
  type: 'ad' | 'bait' | 'spam',
  result?: QualificationResult | null
): void {
  if (article.dataset.tsCollapsed === 'true') return;
  article.dataset.tsCollapsed = 'true';

  let title = 'Engagement Bait hidden';
  let subtitle = 'Attention-grabbing hook with minimal substance';
  let emoji = '🪤';
  let accentColor = '#f59e0b';
  let bannerBg = 'rgba(245, 158, 11, 0.08)';
  let borderColor = 'rgba(245, 158, 11, 0.25)';

  if (type === 'ad') {
    title = 'Promoted Post hidden';
    subtitle = 'Sponsored advertising content';
    emoji = '📢';
    accentColor = '#64748b';
    bannerBg = 'rgba(100, 116, 139, 0.08)';
    borderColor = 'rgba(100, 116, 139, 0.25)';
  } else if (type === 'spam') {
    title = 'Spam / Scam hidden';
    const conf = result ? Math.round(result.categoryConfidence * 100) : 95;
    subtitle = `Suspicious promotional content (${conf}% confidence)`;
    emoji = '🚫';
    accentColor = '#ef4444';
    bannerBg = 'rgba(239, 68, 68, 0.08)';
    borderColor = 'rgba(239, 68, 68, 0.25)';
  } else {
    const conf = result ? Math.round(result.categoryConfidence * 100) : 90;
    const depth = result ? result.substanceDepthNormalized.toFixed(1) : '1.0';
    subtitle = `${conf}% bait likelihood · ${depth}/5 substance depth`;
  }

  // Create banner container
  const bannerHost = document.createElement('div');
  bannerHost.className = 'ts-collapse-banner-host';
  bannerHost.style.display = 'block';
  bannerHost.style.width = '100%';
  bannerHost.style.boxSizing = 'border-box';
  bannerHost.style.margin = '0';
  bannerHost.style.padding = '0';

  const shadow = bannerHost.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }

      /* Collapsed Card (Clean, Dark, Native to X) */
      .ts-collapsed-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        margin: 8px 12px;
        background: #16181c;
        border: 1px solid #2f3336;
        border-left: 3px solid ${accentColor};
        border-radius: 12px;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
        user-select: none;
      }
      .ts-collapsed-card:hover {
        background: #1d2127;
        border-color: #3e444a;
      }
      .ts-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .ts-icon-circle {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: ${bannerBg};
        border: 1px solid ${borderColor};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
      }
      .ts-texts {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .ts-title {
        font-size: 13.5px;
        font-weight: 700;
        color: #e7e9ea;
      }
      .ts-subtitle {
        font-size: 12px;
        color: #71767b;
      }
      .ts-reveal-btn {
        background: #eff3f4;
        color: #0f1419;
        font-size: 12.5px;
        font-weight: 700;
        padding: 6px 14px;
        border-radius: 9999px;
        border: none;
        cursor: pointer;
        transition: opacity 0.15s ease;
        flex-shrink: 0;
      }
      .ts-reveal-btn:hover {
        opacity: 0.9;
      }

      /* Revealed State: Sleek, Ultra-Slim Top Ribbon */
      .ts-revealed-bar {
        display: none;
        align-items: center;
        justify-content: space-between;
        padding: 6px 14px;
        margin: 0 0 6px 0;
        background: ${bannerBg};
        border-bottom: 1px solid ${borderColor};
        font-size: 12px;
        color: #e7e9ea;
        user-select: none;
      }
      .ts-revealed-left {
        display: flex;
        align-items: center;
        gap: 7px;
        font-weight: 500;
      }
      .ts-revealed-emoji {
        font-size: 13px;
      }
      .ts-hide-btn {
        background: none;
        border: none;
        color: #71767b;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        transition: all 0.15s ease;
      }
      .ts-hide-btn:hover {
        color: #e7e9ea;
        background: rgba(255, 255, 255, 0.08);
      }
    </style>

    <!-- Collapsed View -->
    <div class="ts-collapsed-card">
      <div class="ts-left">
        <div class="ts-icon-circle">${emoji}</div>
        <div class="ts-texts">
          <div class="ts-title">${title}</div>
          <div class="ts-subtitle">${subtitle}</div>
        </div>
      </div>
      <button class="ts-reveal-btn">Show post</button>
    </div>

    <!-- Revealed View: Slim Top Accent -->
    <div class="ts-revealed-bar">
      <div class="ts-revealed-left">
        <span class="ts-revealed-emoji">${emoji}</span>
        <span style="color: ${accentColor}; font-weight: 600;">Flagged:</span>
        <span style="color: #94a3b8;">${subtitle}</span>
      </div>
      <button class="ts-hide-btn">Hide post ✕</button>
    </div>
  `;

  // Find inner tweet content wrapper to hide
  const mainContent = article.firstElementChild as HTMLElement;
  if (mainContent) {
    mainContent.style.display = 'none';
    article.insertBefore(bannerHost, mainContent);

    const collapsedCard = shadow.querySelector<HTMLElement>('.ts-collapsed-card');
    const revealedBar = shadow.querySelector<HTMLElement>('.ts-revealed-bar');
    const revealBtn = shadow.querySelector<HTMLButtonElement>('.ts-reveal-btn');
    const hideBtn = shadow.querySelector<HTMLButtonElement>('.ts-hide-btn');

    const showTweet = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      mainContent.style.display = '';
      if (collapsedCard) collapsedCard.style.display = 'none';
      if (revealedBar) revealedBar.style.display = 'flex';
    };

    const hideTweet = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      mainContent.style.display = 'none';
      if (collapsedCard) collapsedCard.style.display = 'flex';
      if (revealedBar) revealedBar.style.display = 'none';
    };

    collapsedCard?.addEventListener('click', showTweet);
    revealBtn?.addEventListener('click', showTweet);
    hideBtn?.addEventListener('click', hideTweet);
  }
}

function getBadgeStyles(): string {
  return `
    .ts-badge-container {
      position: relative;
      display: inline-flex;
    }
    .ts-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.4;
      cursor: pointer;
      border: 1px solid transparent;
      outline: none;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .ts-badge:hover {
      transform: translateY(-1px);
      filter: brightness(1.2);
    }
    .ts-badge-manual {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
      color: #94a3b8;
    }
    .ts-badge-manual:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #f1f5f9;
    }
    .ts-sub {
      opacity: 0.8;
      font-size: 10px;
      padding-left: 2px;
      border-left: 1px solid rgba(255,255,255,0.2);
    }
    .ts-spinner {
      width: 10px;
      height: 10px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: ts-spin 0.6s linear infinite;
      display: inline-block;
    }
    @keyframes ts-spin {
      to { transform: rotate(360deg); }
    }
  `;
}
