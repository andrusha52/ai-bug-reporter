// settings/settings.js - Settings page logic

console.log('[Settings] Script loaded');

// Мінімальне ядро: console + network; без читання LS/cookies у звіт
const DEFAULT_SETTINGS = {
  monitoringEnabled: true,
  includeUserAgent: false,
  includeScreenInfo: false,
  includeBrowserInfo: false,
  includeScreenshot: false,
  includeDomStructure: false,
  includeReduxState: false,
  includeZustand: false,
  includePerformance: false,
  includeUserJourney: false,
  includeSessionStorage: false,
  includeEnvironment: false,
  includeLocalStorage: false,
  includeCookies: false,
  aiVerbosity: 'normal',
  aiLanguage: 'uk',
  maxConsoleLogs: 100,
  maxNetworkLogs: 100,
  hotkeyScreenshotEnabled: true,
  hotkeyAnalyzeEnabled: true
};

const STORAGE_KEYS = { gemini: 'aiApiKey', openai: 'openaiApiKey', provider: 'aiProvider' };

// DOM Elements
const backBtn = document.getElementById('backBtn');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const notification = document.getElementById('saveNotification');

// Initialize
init();

async function init() {
  try {
    console.log('[Settings] Initializing...');
    
    // Load saved settings
    await loadSettings();
    updateHotkeyLabels();
    
    // Setup event listeners
    backBtn.addEventListener('click', handleBack);
    saveBtn.addEventListener('click', handleSave);
    resetBtn.addEventListener('click', handleReset);
    
    const geminiEl = document.getElementById('geminiToken');
    const openaiEl = document.getElementById('openaiToken');
    if (geminiEl && openaiEl) {
      geminiEl.addEventListener('input', () => handleTokenInput('gemini', geminiEl, openaiEl));
      geminiEl.addEventListener('paste', () => setTimeout(() => handleTokenInput('gemini', geminiEl, openaiEl), 0));
      openaiEl.addEventListener('input', () => handleTokenInput('openai', openaiEl, geminiEl));
      openaiEl.addEventListener('paste', () => setTimeout(() => handleTokenInput('openai', openaiEl, geminiEl), 0));
    }
    
    const shortcutsLink = document.getElementById('shortcutsLink');
    if (shortcutsLink) {
      shortcutsLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      });
    }

    const clearSiteDataBtn = document.getElementById('clearSiteDataBtn');
    if (clearSiteDataBtn) {
      clearSiteDataBtn.addEventListener('click', async () => {
        const { runClearActiveTabSiteDataWithUi } = await import('../utils/clearSiteBrowsingData.js');
        await runClearActiveTabSiteDataWithUi();
      });
    }

    console.log('[Settings] Initialized successfully');
  } catch (error) {
    console.error('[Settings] Initialization error:', error);
  }
}

/** Show platform-specific hotkey labels (⌘ on Mac, Ctrl on Win) */
function updateHotkeyLabels() {
  const isMac = navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac');
  const mod = isMac ? '⌘' : 'Ctrl';
  const labels = [
    { id: 'hotkeyScreenshotLabel', text: `📸 ${mod}+Shift+S — Скріншот` },
    { id: 'hotkeyAnalyzeLabel', text: `⚡ ${mod}+Shift+A — Швидкий аналіз` }
  ];
  labels.forEach(({ id, text }) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['settings', STORAGE_KEYS.gemini, STORAGE_KEYS.openai]);
    const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
    
    console.log('[Settings] Loaded settings:', settings);
    
    // Hotkeys
    const hotkeyScreenshot = document.getElementById('hotkeyScreenshotEnabled');
    const hotkeyAnalyze = document.getElementById('hotkeyAnalyzeEnabled');
    if (hotkeyScreenshot) hotkeyScreenshot.checked = settings.hotkeyScreenshotEnabled !== false;
    if (hotkeyAnalyze) hotkeyAnalyze.checked = settings.hotkeyAnalyzeEnabled !== false;
    
    // AI tokens
    const geminiEl = document.getElementById('geminiToken');
    const openaiEl = document.getElementById('openaiToken');
    if (geminiEl) {
      const token = result[STORAGE_KEYS.gemini] || '';
      geminiEl.value = token;
      geminiEl.placeholder = token ? '••••••••••••••••' : 'AIzaSy...';
    }
    if (openaiEl) {
      const token = result[STORAGE_KEYS.openai] || '';
      openaiEl.value = token;
      openaiEl.placeholder = token ? '••••••••••••••••' : 'sk-...';
    }
    
    const shot = document.getElementById('includeScreenshot');
    if (shot) shot.checked = !!settings.includeScreenshot;
    document.getElementById('aiVerbosity').value = settings.aiVerbosity;
    document.getElementById('aiLanguage').value = settings.aiLanguage;
    document.getElementById('maxConsoleLogs').value = settings.maxConsoleLogs;
    document.getElementById('maxNetworkLogs').value = settings.maxNetworkLogs;
  } catch (error) {
    console.error('[Settings] Load error:', error);
  }
}

/**
 * Save settings to storage
 */
async function handleTokenInput(provider, activeInput, otherInput) {
  const value = activeInput.value.trim();
  if (value) {
    otherInput.value = '';
    otherInput.placeholder = provider === 'gemini' ? 'sk-...' : 'AIzaSy...';
    const key = provider === 'gemini' ? STORAGE_KEYS.gemini : STORAGE_KEYS.openai;
    await chrome.storage.local.set({ [STORAGE_KEYS.provider]: provider, [key]: value });
    await chrome.storage.local.remove([provider === 'gemini' ? STORAGE_KEYS.openai : STORAGE_KEYS.gemini]);
  }
}

async function handleSave() {
  try {
    // Save AI tokens
    const geminiEl = document.getElementById('geminiToken');
    const openaiEl = document.getElementById('openaiToken');
    if (geminiEl?.value.trim()) {
      await chrome.storage.local.set({ [STORAGE_KEYS.provider]: 'gemini', [STORAGE_KEYS.gemini]: geminiEl.value.trim() });
      await chrome.storage.local.remove([STORAGE_KEYS.openai]);
    } else if (openaiEl?.value.trim()) {
      await chrome.storage.local.set({ [STORAGE_KEYS.provider]: 'openai', [STORAGE_KEYS.openai]: openaiEl.value.trim() });
      await chrome.storage.local.remove([STORAGE_KEYS.gemini]);
    }
    
    const prev = (await chrome.storage.local.get('settings')).settings || {};
    const settings = {
      ...DEFAULT_SETTINGS,
      ...prev,
      // Звіт: лише console + network; не відновлюємо старі «зчитувати все» зі сховища
      includeUserAgent: false,
      includeScreenInfo: false,
      includeBrowserInfo: false,
      includeDomStructure: false,
      includeReduxState: false,
      includeZustand: false,
      includePerformance: false,
      includeUserJourney: false,
      includeSessionStorage: false,
      includeEnvironment: false,
      includeLocalStorage: false,
      includeCookies: false,
      hotkeyScreenshotEnabled: document.getElementById('hotkeyScreenshotEnabled')?.checked !== false,
      hotkeyAnalyzeEnabled: document.getElementById('hotkeyAnalyzeEnabled')?.checked !== false,
      includeScreenshot: document.getElementById('includeScreenshot')?.checked === true,
      aiVerbosity: document.getElementById('aiVerbosity').value,
      aiLanguage: document.getElementById('aiLanguage').value,
      maxConsoleLogs: parseInt(document.getElementById('maxConsoleLogs').value, 10),
      maxNetworkLogs: parseInt(document.getElementById('maxNetworkLogs').value, 10)
    };
    
    await chrome.storage.local.set({ settings });
    
    console.log('[Settings] Settings saved:', settings);
    
    // Show notification
    showNotification();
    
    // Notify background script about settings change
    chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings });
  } catch (error) {
    console.error('[Settings] Save error:', error);
  }
}

/**
 * Reset settings to default
 */
async function handleReset() {
  try {
    const confirmed = confirm('Скинути всі налаштування до значень за замовчуванням?');
    if (!confirmed) return;
    
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    
    console.log('[Settings] Settings reset to default');
    
    // Reload settings from storage
    await loadSettings();
    
    // Show notification
    showNotification('Налаштування скинуто!');
    
    // Notify background script
    chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings: DEFAULT_SETTINGS });
  } catch (error) {
    console.error('[Settings] Reset error:', error);
  }
}

/**
 * Go back to popup
 */
function handleBack() {
  window.close();
}

/**
 * Show save notification
 */
function showNotification(message = 'Налаштування збережено!') {
  notification.querySelector('span').textContent = message;
  notification.style.display = 'flex';
  
  setTimeout(() => {
    notification.style.display = 'none';
  }, 2000);
}

console.log('[Settings] Event listeners registered');
