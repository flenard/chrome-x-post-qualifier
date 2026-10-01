import type { ExtensionSettings, ExtensionStats, QualificationResult } from '../types';
import { DEFAULT_SETTINGS, DEFAULT_STATS, calculateCostUsd } from '../config/default';

const SETTINGS_KEY = 'typesafe_settings';
const STATS_KEY = 'typesafe_stats';
const CACHE_PREFIX = 'ts_cache_';
const CACHE_INDEX_KEY = 'ts_qualification_index';
const MAX_CACHE_ITEMS = 1000;

const hasStorage = () => typeof chrome !== 'undefined' && !!chrome.storage;

/**
 * chrome.storage callbacks never reject. A failed write reports through
 * chrome.runtime.lastError, which is trivial to miss, so every read and write
 * goes through these two helpers and surfaces the error instead of swallowing it.
 */
function storageGet<T = Record<string, unknown>>(keys: string[] | null): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(`storage.get failed: ${err.message}`));
        return;
      }
      resolve(res as T);
    });
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(`storage.set failed: ${err.message}`));
        return;
      }
      resolve();
    });
  });
}

function storageRemove(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(`storage.remove failed: ${err.message}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * Every read-modify-write below runs through this queue. Without it, two
 * results finishing together both read the same stats or cache index, and the
 * second write erases the first: stats undercount and evicted ids go missing,
 * so the cache grows without bound again. The queue is per JS context; the
 * service worker does nearly all the writes.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => undefined);
  return run;
}

export async function getSettings(): Promise<ExtensionSettings> {
  if (!hasStorage()) return DEFAULT_SETTINGS;
  const res = await storageGet<Record<string, Partial<ExtensionSettings>>>([SETTINGS_KEY]);
  return { ...DEFAULT_SETTINGS, ...(res[SETTINGS_KEY] || {}) };
}

export function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  if (!hasStorage()) return Promise.resolve();
  return serialized(async () => {
    const current = await getSettings();
    await storageSet({ [SETTINGS_KEY]: { ...current, ...settings } });
  });
}

export async function getStats(): Promise<ExtensionStats> {
  if (!hasStorage()) return DEFAULT_STATS;
  const res = await storageGet<Record<string, Partial<ExtensionStats>>>([STATS_KEY]);
  return { ...DEFAULT_STATS, ...(res[STATS_KEY] || {}) };
}

export function recordAnalysis(result: QualificationResult): Promise<ExtensionStats> {
  return serialized(async () => {
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

    if (hasStorage()) await storageSet({ [STATS_KEY]: updated });
    return updated;
  });
}

export function recordAdBlocked(): Promise<ExtensionStats> {
  return serialized(async () => {
    const current = await getStats();
    const updated: ExtensionStats = { ...current, totalAdsBlocked: current.totalAdsBlocked + 1 };
    if (hasStorage()) await storageSet({ [STATS_KEY]: updated });
    return updated;
  });
}

export function resetStats(): Promise<void> {
  if (!hasStorage()) return Promise.resolve();
  return serialized(() => storageSet({ [STATS_KEY]: DEFAULT_STATS }));
}

export async function getCachedQualification(tweetId: string): Promise<QualificationResult | null> {
  if (!hasStorage()) return null;
  const key = `${CACHE_PREFIX}${tweetId}`;
  const res = await storageGet<Record<string, QualificationResult>>([key]);
  return res[key] || null;
}

/**
 * Stores a result and keeps the cache bounded at MAX_CACHE_ITEMS.
 *
 * CACHE_INDEX_KEY holds the tweet ids in insertion order. Trimming reads and
 * writes only that small array, so a write never has to enumerate the whole
 * storage area. Without this the cache grows until it hits the 10MB quota and
 * every later write fails.
 */
export function setCachedQualification(tweetId: string, result: QualificationResult): Promise<void> {
  if (!hasStorage()) return Promise.resolve();
  return serialized(async () => {
    const key = `${CACHE_PREFIX}${tweetId}`;
    await storageSet({ [key]: result });

    const res = await storageGet<Record<string, string[]>>([CACHE_INDEX_KEY]);
    const index = (res[CACHE_INDEX_KEY] || []).filter((id) => id !== tweetId);
    index.push(tweetId);

    if (index.length > MAX_CACHE_ITEMS) {
      const evicted = index.splice(0, index.length - MAX_CACHE_ITEMS);
      await storageRemove(evicted.map((id) => `${CACHE_PREFIX}${id}`));
    }

    await storageSet({ [CACHE_INDEX_KEY]: index });
  });
}

export function clearCache(): Promise<void> {
  if (!hasStorage()) return Promise.resolve();
  return serialized(async () => {
    const items = await storageGet<Record<string, unknown>>(null);
    const keysToRemove = Object.keys(items).filter(
      (k) => k.startsWith(CACHE_PREFIX) || k === CACHE_INDEX_KEY
    );
    if (keysToRemove.length > 0) await storageRemove(keysToRemove);
  });
}

/**
 * Accounts the user marked "not spam". Kept in storage.sync, not local:
 * local is wiped when the extension is removed, and this list is the one
 * thing the user built by hand. Handles are stored lowercase, without "@".
 */
export const TRUSTED_KEY = 'ts_trusted_handles';

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

export function getTrustedHandles(): Promise<string[]> {
  if (!hasStorage()) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get([TRUSTED_KEY], (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(`storage.sync.get failed: ${err.message}`));
        return;
      }
      resolve(Array.isArray(res[TRUSTED_KEY]) ? res[TRUSTED_KEY] : []);
    });
  });
}

function setTrustedHandles(handles: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [TRUSTED_KEY]: handles }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(`storage.sync.set failed: ${err.message}`));
        return;
      }
      resolve();
    });
  });
}

export function trustHandle(handle: string): Promise<void> {
  if (!hasStorage()) return Promise.resolve();
  const h = normalizeHandle(handle);
  return serialized(async () => {
    const current = await getTrustedHandles();
    if (!h || current.includes(h)) return;
    await setTrustedHandles([...current, h].sort());
  });
}

export function untrustHandle(handle: string): Promise<void> {
  if (!hasStorage()) return Promise.resolve();
  const h = normalizeHandle(handle);
  return serialized(async () => {
    const current = await getTrustedHandles();
    await setTrustedHandles(current.filter((x) => x !== h));
  });
}
