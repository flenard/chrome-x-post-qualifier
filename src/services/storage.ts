import type { ExtensionSettings, ExtensionStats, QualificationResult } from '../types';
import { DEFAULT_SETTINGS, DEFAULT_STATS, calculateCostUsd } from '../config/default';

const SETTINGS_KEY = 'typesafe_settings';
const STATS_KEY = 'typesafe_stats';
const CACHE_PREFIX = 'ts_cache_';
const MAX_CACHE_ITEMS = 1000;

export async function getSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(DEFAULT_SETTINGS);
      return;
    }
    chrome.storage.local.get([SETTINGS_KEY], (res) => {
      const saved = res[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
      resolve({ ...DEFAULT_SETTINGS, ...(saved || {}) });
    });
  });
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve();
      return;
    }
    chrome.storage.local.set({ [SETTINGS_KEY]: updated }, () => {
      resolve();
    });
  });
}

export async function getStats(): Promise<ExtensionStats> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(DEFAULT_STATS);
      return;
    }
    chrome.storage.local.get([STATS_KEY], (res) => {
      const saved = res[STATS_KEY] as Partial<ExtensionStats> | undefined;
      resolve({ ...DEFAULT_STATS, ...(saved || {}) });
    });
  });
}

export async function recordAnalysis(result: QualificationResult): Promise<ExtensionStats> {
  const current = await getStats();
  const cost = result.costUsd || calculateCostUsd(result.inputTokens, result.outputTokens);

  const updated: ExtensionStats = {
    totalPostsAnalyzed: current.totalPostsAnalyzed + 1,
    totalInputTokens: current.totalInputTokens + (result.inputTokens || 0),
    totalOutputTokens: current.totalOutputTokens + (result.outputTokens || 0),
    totalCostUsd: current.totalCostUsd + cost,
    totalBaitCollapsed: current.totalBaitCollapsed + (result.category === 'engagement_bait' ? 1 : 0),
    totalSpamCollapsed: current.totalSpamCollapsed + (result.category === 'spam' ? 1 : 0),
    totalAdsBlocked: current.totalAdsBlocked
  };

  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(updated);
      return;
    }
    chrome.storage.local.set({ [STATS_KEY]: updated }, () => {
      resolve(updated);
    });
  });
}

export async function recordAdBlocked(): Promise<ExtensionStats> {
  const current = await getStats();
  const updated: ExtensionStats = {
    ...current,
    totalAdsBlocked: current.totalAdsBlocked + 1
  };
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(updated);
      return;
    }
    chrome.storage.local.set({ [STATS_KEY]: updated }, () => {
      resolve(updated);
    });
  });
}

export async function resetStats(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve();
      return;
    }
    chrome.storage.local.set({ [STATS_KEY]: DEFAULT_STATS }, () => {
      resolve();
    });
  });
}

export async function getCachedQualification(tweetId: string): Promise<QualificationResult | null> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(null);
      return;
    }
    const key = `${CACHE_PREFIX}${tweetId}`;
    chrome.storage.local.get([key], (res) => {
      resolve((res[key] as QualificationResult) || null);
    });
  });
}

export async function setCachedQualification(tweetId: string, result: QualificationResult): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve();
      return;
    }
    const key = `${CACHE_PREFIX}${tweetId}`;
    chrome.storage.local.set({ [key]: result }, () => {
      resolve();
    });
  });
}

export async function clearCache(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve();
      return;
    }
    chrome.storage.local.get(null, (items) => {
      const keysToRemove = Object.keys(items).filter((k) => k.startsWith(CACHE_PREFIX));
      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove, () => resolve());
      } else {
        resolve();
      }
    });
  });
}
