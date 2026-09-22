import { getSettings, saveSettings, setCachedQualification, getCachedQualification, recordAnalysis, recordAdBlocked } from '../services/storage';
import { qualifyTweet } from '../api/typesafe';
import type { PostMetadata, QualificationResult } from '../types';

// Initialize default storage on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[X-Ray Background] Extension installed.');
  const settings = await getSettings();
  if (settings.apiKey) {
    await saveSettings(settings);
  }
  // Keep toolbar icon clean without badge numbers
  chrome.action.setBadgeText({ text: '' });
});

// Clear any existing badge text on startup
chrome.action.setBadgeText({ text: '' });

// Handle messages from content scripts (bypasses page CSP)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'QUALIFY_POST') {
    handleQualifyPost(request.metadata)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (request.type === 'RECORD_AD') {
    recordAdBlocked()
      .then((stats) => sendResponse({ success: true, stats }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// One API call per tweet, even when two tabs or two triggers ask at once.
// Every caller waits on the same promise, so a tweet is billed once.
const inFlight = new Map<string, Promise<QualificationResult>>();

function handleQualifyPost(metadata: PostMetadata): Promise<QualificationResult> {
  if (!metadata || !metadata.id) {
    return Promise.reject(new Error('Invalid metadata'));
  }

  const pending = inFlight.get(metadata.id);
  if (pending) return pending;

  const request = qualifyUncached(metadata).finally(() => inFlight.delete(metadata.id));
  inFlight.set(metadata.id, request);
  return request;
}

async function qualifyUncached(metadata: PostMetadata): Promise<QualificationResult> {
  // 1. Check cache first
  const cached = await getCachedQualification(metadata.id);
  if (cached) {
    return cached;
  }

  // 2. Fetch settings
  const settings = await getSettings();
  if (!settings.apiKey) {
    throw new Error('TypeSafe AI API key is not configured.');
  }

  // 3. Make API call from privileged background context (immune to X.com CSP)
  const result = await qualifyTweet(metadata, settings.apiKey);

  // 4. Cache result & record stats (each write is serialized in storage.ts)
  await setCachedQualification(metadata.id, result);
  await recordAnalysis(result);

  return result;
}
