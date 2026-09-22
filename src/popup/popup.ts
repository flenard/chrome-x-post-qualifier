import { getSettings, saveSettings, getStats, resetStats, clearCache } from '../services/storage';

document.addEventListener('DOMContentLoaded', async () => {
  const apiStatus = document.getElementById('apiStatus') as HTMLElement;
  const costVal = document.getElementById('costVal') as HTMLElement;
  const postsVal = document.getElementById('postsVal') as HTMLElement;
  const tokensVal = document.getElementById('tokensVal') as HTMLElement;
  const baitVal = document.getElementById('baitVal') as HTMLElement;
  const adsVal = document.getElementById('adsVal') as HTMLElement;

  const toggleAuto = document.getElementById('toggleAuto') as HTMLInputElement;
  const toggleBait = document.getElementById('toggleBait') as HTMLInputElement;
  const toggleSpam = document.getElementById('toggleSpam') as HTMLInputElement;
  const toggleAds = document.getElementById('toggleAds') as HTMLInputElement;
  const toggleSlop = document.getElementById('toggleSlop') as HTMLInputElement;
  const toggleFocus = document.getElementById('toggleFocus') as HTMLInputElement;
  const focusDepthRow = document.getElementById('focusDepthRow') as HTMLElement;
  const focusDepthRange = document.getElementById('focusDepthRange') as HTMLInputElement;
  const focusDepthVal = document.getElementById('focusDepthVal') as HTMLElement;
  const thresholdRange = document.getElementById('thresholdRange') as HTMLInputElement;
  const thresholdVal = document.getElementById('thresholdVal') as HTMLElement;

  const versionTag = document.getElementById('versionTag') as HTMLElement;
  const keyTitle = document.getElementById('keyTitle') as HTMLElement;
  const keyHint = document.getElementById('keyHint') as HTMLElement;
  const toggleEditKeyBtn = document.getElementById('toggleEditKeyBtn') as HTMLButtonElement;
  const keyInputGroup = document.getElementById('keyInputGroup') as HTMLElement;
  const apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
  const saveKeyBtn = document.getElementById('saveKeyBtn') as HTMLButtonElement;

  const resetStatsBtn = document.getElementById('resetStatsBtn') as HTMLButtonElement;
  const clearCacheBtn = document.getElementById('clearCacheBtn') as HTMLButtonElement;

  // Set version from Chrome manifest
  if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
    const manifest = chrome.runtime.getManifest();
    if (manifest.version && versionTag) {
      versionTag.textContent = `v${manifest.version}`;
    }
  }

  // 1. Load initial data
  const [settings, stats] = await Promise.all([getSettings(), getStats()]);

  // Update UI with stats
  updateStatsDisplay(stats);

  // Update UI with settings
  toggleAuto.checked = settings.autoQualify;
  toggleBait.checked = settings.autoCollapseBait;
  toggleSpam.checked = settings.autoCollapseSpam;
  toggleAds.checked = settings.autoCollapseAds;
  toggleSlop.checked = settings.autoCollapseSlop;
  toggleFocus.checked = settings.focusMode;
  focusDepthRange.value = String(settings.focusMinDepth);
  thresholdRange.value = String(settings.minBaitThreshold);

  const showFocusDepth = () => {
    focusDepthVal.textContent = `${Number(focusDepthRange.value).toFixed(1)} / 5`;
    focusDepthRow.classList.toggle('disabled', !toggleFocus.checked);
  };
  const showThreshold = () => {
    thresholdVal.textContent = `${Math.round(Number(thresholdRange.value) * 100)}% sure`;
  };
  showFocusDepth();
  showThreshold();

  function refreshKeyDisplay(key?: string) {
    if (key && key.trim()) {
      apiKeyInput.value = '';
      apiStatus.textContent = 'Active';
      apiStatus.className = 'status-badge';
      keyTitle.textContent = 'TypeSafe AI Connected';
      keyHint.textContent = `Key ending …${key.slice(-4)}`;
      keyInputGroup.classList.add('hidden');
      toggleEditKeyBtn.textContent = 'Change';
    } else {
      apiStatus.textContent = 'No Key';
      apiStatus.className = 'status-badge error';
      keyTitle.textContent = 'API Key Required';
      keyHint.textContent = 'Paste your TypeSafe AI API key below';
      keyInputGroup.classList.remove('hidden');
      toggleEditKeyBtn.textContent = 'Cancel';
    }
  }

  refreshKeyDisplay(settings.apiKey);

  toggleEditKeyBtn.addEventListener('click', () => {
    keyInputGroup.classList.toggle('hidden');
    toggleEditKeyBtn.textContent = keyInputGroup.classList.contains('hidden') ? 'Change' : 'Hide';
  });

  // 2. Settings Listeners
  toggleAuto.addEventListener('change', () => {
    saveSettings({ autoQualify: toggleAuto.checked });
  });

  toggleBait.addEventListener('change', () => {
    saveSettings({ autoCollapseBait: toggleBait.checked });
  });

  toggleSpam.addEventListener('change', () => {
    saveSettings({ autoCollapseSpam: toggleSpam.checked });
  });

  toggleAds.addEventListener('change', () => {
    saveSettings({ autoCollapseAds: toggleAds.checked });
  });

  toggleSlop.addEventListener('change', () => {
    saveSettings({ autoCollapseSlop: toggleSlop.checked });
  });

  toggleFocus.addEventListener('change', () => {
    showFocusDepth();
    saveSettings({ focusMode: toggleFocus.checked });
  });

  // 'input' updates the label while dragging; 'change' saves once on release,
  // because every save makes open X tabs re-judge all scored tweets.
  focusDepthRange.addEventListener('input', showFocusDepth);
  focusDepthRange.addEventListener('change', () => {
    saveSettings({ focusMinDepth: Number(focusDepthRange.value) });
  });

  thresholdRange.addEventListener('input', showThreshold);
  thresholdRange.addEventListener('change', () => {
    saveSettings({ minBaitThreshold: Number(thresholdRange.value) });
  });

  // 3. API Key Save
  saveKeyBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) return;

    await saveSettings({ apiKey: key });
    saveKeyBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveKeyBtn.textContent = 'Save';
      refreshKeyDisplay(key);
    }, 800);
  });

  // 4. Reset & Clear Actions
  resetStatsBtn.addEventListener('click', async () => {
    if (confirm('Reset usage and cost counters?')) {
      await resetStats();
      const newStats = await getStats();
      updateStatsDisplay(newStats);
    }
  });

  clearCacheBtn.addEventListener('click', async () => {
    await clearCache();
    clearCacheBtn.textContent = 'Cleared!';
    setTimeout(() => {
      clearCacheBtn.textContent = 'Clear Cache';
    }, 1500);
  });

  function updateStatsDisplay(currentStats: typeof stats) {
    costVal.textContent = `$${currentStats.totalCostUsd.toFixed(4)}`;
    postsVal.textContent = currentStats.totalPostsAnalyzed.toLocaleString();
    tokensVal.textContent = `${currentStats.totalInputTokens.toLocaleString()} tokens`;
    baitVal.textContent = (currentStats.totalBaitCollapsed + currentStats.totalSpamCollapsed).toLocaleString();
    adsVal.textContent = currentStats.totalAdsBlocked.toLocaleString();
  }

  // Listen for real-time stats updates from background worker
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.typesafe_stats?.newValue) {
        updateStatsDisplay(changes.typesafe_stats.newValue);
      }
    });
  }
});
