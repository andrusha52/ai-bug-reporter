// background.js - Real-time error monitoring with smart classification

import { generateBugReport } from './utils/openai.js';
import { classifyError, analyzeErrors } from './utils/error-classifier.js';
import { collectAdditionalContext } from './utils/contextCollector.js';
import {
  STORE_SAFE_BUILD,
  FEATURE_BACKGROUND_DOWNLOADS,
  FEATURE_NOTIFICATIONS
} from './utils/buildFlags.js';
import {
  incidentGroupKey,
  enrichNetworkErrorFromLogs,
  inferIncidentTitle,
  inferIncidentDescription,
  buildFocusedLogsForIncident,
  upsertDraftForTab,
  getDraftsForTab,
  removeDraftForTab,
  appendAutoDraftToHistory,
  setDraftReadyPrompt
} from './utils/incidentDrafts.js';

console.log('[Background] Service worker started', STORE_SAFE_BUILD ? '(store-safe)' : '(dev/full)');

// Мінімальне ядро: консоль + network (debugger). Звіт без читання localStorage/cookies.
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
  aiVerbosity: 'normal',
  aiLanguage: 'uk',
  maxConsoleLogs: 100,
  maxNetworkLogs: 100,
  hotkeyScreenshotEnabled: true,
  hotkeyAnalyzeEnabled: true,
  /** Авто Jira-чернетки після помилки (окремий виклик AI на інцидент) */
  autoJiraDrafts: true
};

let incidentDraftFlushTimer = null;
const pendingIncidentDraftJobs = [];
const incidentAiInFlight = new Set();

function scheduleIncidentJiraDraft(errSnapshot, tabId) {
  let err;
  try {
    err = JSON.parse(JSON.stringify(errSnapshot));
  } catch {
    return;
  }
  if (err.source === 'network' && monitoringState.tabId === tabId) {
    err = enrichNetworkErrorFromLogs(err, monitoringState.networkLogs);
  }
  const fp = incidentGroupKey(err);
  const idx = pendingIncidentDraftJobs.findIndex((j) => j.fp === fp);
  if (idx >= 0) pendingIncidentDraftJobs.splice(idx, 1);
  pendingIncidentDraftJobs.push({ tabId, fp, err });
  if (incidentDraftFlushTimer) clearTimeout(incidentDraftFlushTimer);
  incidentDraftFlushTimer = setTimeout(() => {
    incidentDraftFlushTimer = null;
    void flushIncidentDraftQueue();
  }, 2600);
}

function clearPendingIncidentDrafts() {
  if (incidentDraftFlushTimer) clearTimeout(incidentDraftFlushTimer);
  incidentDraftFlushTimer = null;
  pendingIncidentDraftJobs.length = 0;
}

async function flushIncidentDraftQueue() {
  const rawBatch = pendingIncidentDraftJobs.splice(0, pendingIncidentDraftJobs.length);
  if (rawBatch.length === 0) return;

  const byFp = new Map();
  for (const job of rawBatch) {
    byFp.set(job.fp, job);
  }
  const batch = [...byFp.values()];

  const settings = await getSettings();
  if (settings.autoJiraDrafts === false) {
    return;
  }

  for (const { tabId, fp, err } of batch) {
    try {
      if (incidentAiInFlight.has(fp)) {
        continue;
      }

      const existing = await getDraftsForTab(tabId);
      const prev = existing.find((d) => d.fingerprint === fp);
      if (prev?.status === 'ready') {
        await upsertDraftForTab(tabId, {
          ...prev,
          occurrenceCount: (prev.occurrenceCount || 1) + 1
        });
        continue;
      }
      if (prev?.status === 'pending') {
        await upsertDraftForTab(tabId, {
          ...prev,
          occurrenceCount: (prev.occurrenceCount || 1) + 1
        });
        continue;
      }

      await upsertDraftForTab(tabId, {
        fingerprint: fp,
        status: 'pending',
        title: inferIncidentTitle(err),
        createdAt: Date.now(),
        kind: err.source,
        occurrenceCount: 1
      });

      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab?.url?.startsWith('http')) {
        await upsertDraftForTab(tabId, {
          fingerprint: fp,
          status: 'error',
          error: 'Вкладка не HTTP',
          title: inferIncidentTitle(err)
        });
        continue;
      }

      incidentAiInFlight.add(fp);
      const lang = settings.aiLanguage || 'uk';
      const description = inferIncidentDescription(err, lang);
      const sameTab = monitoringState.isMonitoring && monitoringState.tabId === tabId;
      const allConsole = sameTab ? monitoringState.consoleLogs : [];
      const allNet = sameTab ? monitoringState.networkLogs : [];
      const { consoleLogs, networkLogs } = buildFocusedLogsForIncident(err, allConsole, allNet);

      const effectiveSettings = { ...settings, includeScreenshot: true };
      let additionalContext = await collectAdditionalContext(tabId, effectiveSettings);
      const pageInfo = { url: tab.url, title: tab.title, timestamp: Date.now() };

      let bugReport;
      try {
        bugReport = await generateBugReport(
          description,
          consoleLogs,
          networkLogs,
          null,
          pageInfo,
          'jira',
          additionalContext,
          effectiveSettings
        );
      } finally {
        incidentAiInFlight.delete(fp);
      }

      const latestList = await getDraftsForTab(tabId);
      const latestDraft = latestList.find((d) => d.fingerprint === fp);
      await upsertDraftForTab(tabId, {
        fingerprint: fp,
        status: 'ready',
        title: inferIncidentTitle(err),
        bugReport,
        createdAt: Date.now(),
        kind: err.source,
        occurrenceCount: latestDraft?.occurrenceCount || 1
      });

      await appendAutoDraftToHistory(bugReport, pageInfo);
      await setDraftReadyPrompt(tabId, fp, inferIncidentTitle(err));
    } catch (e) {
      console.warn('[Background] Incident Jira draft failed:', e);
      incidentAiInFlight.delete(fp);
      await upsertDraftForTab(tabId, {
        fingerprint: fp,
        status: 'error',
        error: e.message || String(e),
        title: inferIncidentTitle(err)
      });
    }
  }
}

// State for real-time monitoring
let monitoringState = {
  isMonitoring: false,
  tabId: null,
  errorCount: 0,
  warningCount: 0,
  networkErrorCount: 0,
  criticalCount: 0,
  consoleLogs: [],
  networkLogs: [],
  classifiedErrors: []
};

// State for context capture
let captureState = {
  isCapturing: false,
  tabId: null,
  consoleLogs: [],
  networkLogs: [],
  startTime: null
};

// Manual screenshot from hotkey (stored for next report)
let manualScreenshotData = null;

// Helper to get settings
async function getSettings() {
  try {
    const result = await chrome.storage.local.get('settings');
    const merged = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
    // Політика: у звіт лише console + network (+ опційний скрін); не зчитуємо LS/cookies/DOM/state
    return {
      ...merged,
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
      includeCookies: false
    };
  } catch (error) {
    console.error('[Background] Get settings error:', error);
    return DEFAULT_SETTINGS;
  }
}

// Авто-моніторинг на кожну вкладку потребує broad host_permissions. У store-safe лише після відкриття popup (activeTab).
if (!STORE_SAFE_BUILD) {
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const settings = await getSettings();
      if (!settings.monitoringEnabled) return;
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (!tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        await startMonitoring(activeInfo.tabId);
      }
    } catch (error) {
      console.warn('[Background] Could not start monitoring:', error.message);
    }
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
      try {
        const settings = await getSettings();
        if (!settings.monitoringEnabled) return;
        if (!tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          await startMonitoring(tabId);
        }
      } catch (error) {
        console.warn('[Background] Could not start monitoring:', error.message);
      }
    }
  });
}

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Message received:', message.type);
  
  switch (message.type) {
    case 'ANALYZE_BUG':
      handleAnalyzeBug(message.data)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response
      
    case 'TOGGLE_MONITORING':
      handleToggleMonitoring(message.enabled)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response
      
    case 'GET_ERROR_STATS':
      const analysis = analyzeErrors(monitoringState.classifiedErrors);
      sendResponse({
        success: true,
        stats: {
          errorCount: monitoringState.errorCount,
          warningCount: monitoringState.warningCount,
          networkErrorCount: monitoringState.networkErrorCount,
          criticalCount: monitoringState.criticalCount,
          totalIssues: monitoringState.errorCount + monitoringState.networkErrorCount,
          analysis: analysis,
          classifiedErrors: monitoringState.classifiedErrors.slice(-10) // Last 10
        }
      });
      break;

    case 'GET_INCIDENT_DRAFTS':
      (async () => {
        try {
          const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
          const tid = t?.id;
          if (tid == null) {
            sendResponse({ success: true, drafts: [] });
            return;
          }
          const drafts = await getDraftsForTab(tid);
          sendResponse({ success: true, drafts });
        } catch (e) {
          sendResponse({ success: false, error: e.message, drafts: [] });
        }
      })();
      return true;

    case 'REMOVE_INCIDENT_DRAFT':
      (async () => {
        try {
          const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
          const tid = t?.id;
          const fp = message.data?.fingerprint;
          if (tid == null || !fp) {
            sendResponse({ success: false });
            return;
          }
          await removeDraftForTab(tid, fp);
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
      
    case 'CONSOLE_LOG':
      handleConsoleLog(message.log, sender.tab?.id);
      break;

    case 'POPUP_OPENED':
      handlePopupOpened()
        .then(() => sendResponse({ success: true }))
        .catch(e => sendResponse({ success: false, error: e.message }));
      return true;
      
    default:
      console.warn('[Background] Unknown message type:', message.type);
  }
});

// Handle keyboard shortcuts (commands)
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[Background] Command received:', command);
  
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || activeTab.url.startsWith('chrome://')) return;
    
    const settings = await getSettings();
    
    switch (command) {
      case 'take_screenshot': {
        if (settings.hotkeyScreenshotEnabled !== false) {
          try {
            const windowId = activeTab.windowId;
            const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
            manualScreenshotData = dataUrl;
            if (FEATURE_BACKGROUND_DOWNLOADS) {
              chrome.downloads.download({
                url: dataUrl,
                filename: `bug-screenshot-${Date.now()}.png`,
                saveAs: false
              });
            }
            if (FEATURE_NOTIFICATIONS) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'AI Bug Reporter',
                message: FEATURE_BACKGROUND_DOWNLOADS
                  ? 'Скріншот збережено в Завантаження. Також буде додано до наступного звіту.'
                  : 'Скріншот збережено для наступного аналізу (Завантаження — з кнопки у звіті).'
              });
            }
          } catch (err) {
            console.error('[Background] Screenshot error:', err);
            if (FEATURE_NOTIFICATIONS) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'AI Bug Reporter',
                message: 'Помилка скріншота. Відкрий popup на потрібній вкладці (activeTab).'
              });
            }
          }
        }
        break;
      }
      /* quick_analyze: використовується _execute_action в manifest — Chrome відкриває popup */
    }
  } catch (error) {
    console.error('[Background] Command error:', error);
  }
});

async function handlePopupOpened() {
  const settings = await getSettings();
  if (settings.monitoringEnabled) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && !activeTab.url.startsWith('chrome://') && !activeTab.url.startsWith('chrome-extension://')) {
      await startMonitoring(activeTab.id);
    }
  }
  if (incidentDraftFlushTimer) {
    clearTimeout(incidentDraftFlushTimer);
    incidentDraftFlushTimer = null;
  }
  await flushIncidentDraftQueue();
}

/**
 * Start real-time monitoring for a tab
 */
async function startMonitoring(tabId) {
  if (monitoringState.isMonitoring && monitoringState.tabId === tabId) {
    return;
  }

  console.log('[Background] Starting monitoring for tab:', tabId);
  clearPendingIncidentDrafts();

  // Reset state
  monitoringState = {
    isMonitoring: true,
    tabId: tabId,
    errorCount: 0,
    warningCount: 0,
    networkErrorCount: 0,
    criticalCount: 0,
    consoleLogs: [],
    networkLogs: [],
    classifiedErrors: []
  };
  
  // Reset badge
  updateBadge(0);
  
  // Inject console interceptor
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content_scripts/console-interceptor.js']
    });
  } catch (error) {
    console.warn('[Background] Could not inject console interceptor:', error.message);
  }
  
  // Network errors — Chrome DevTools Protocol (потрібен permission "debugger")
  try {
    await chrome.debugger.attach({ tabId: tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId: tabId }, 'Network.enable');
  } catch (error) {
    console.warn('[Background] Could not attach debugger (network):', error.message);
  }

}

/**
 * Handle console log from content script
 */
function handleConsoleLog(log, tabId) {
  if (!monitoringState.isMonitoring || tabId !== monitoringState.tabId) {
    return;
  }
  
  const enrichedLog = {
    ...log,
    source: 'console',
    timestamp: Date.now()
  };
  
  // Store log
  monitoringState.consoleLogs.push(enrichedLog);
  
  // Classify error
  if (log.level === 'error' || log.level === 'warn') {
    const classification = classifyError(enrichedLog);
    monitoringState.classifiedErrors.push({
      ...enrichedLog,
      classification
    });

    if (log.level === 'error' && tabId != null) {
      const lastErr = monitoringState.classifiedErrors[monitoringState.classifiedErrors.length - 1];
      scheduleIncidentJiraDraft(lastErr, tabId);
    }

    // Update counters
    if (log.level === 'error') {
      monitoringState.errorCount++;
      if (classification.isCritical) {
        monitoringState.criticalCount++;
      }
    } else if (log.level === 'warn') {
      monitoringState.warningCount++;
    }
    
    // Update badge (show critical count if any, otherwise total errors)
    const badgeCount = monitoringState.criticalCount > 0 
      ? monitoringState.criticalCount 
      : (monitoringState.errorCount + monitoringState.networkErrorCount);
    updateBadge(badgeCount, monitoringState.criticalCount > 0);
  }
  
  // Also store for capture if capturing
  if (captureState.isCapturing && tabId === captureState.tabId) {
    captureState.consoleLogs.push(enrichedLog);
  }
}

/**
 * Update extension badge with error count
 */
function updateBadge(count, isCritical = false) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    
    // Different colors for critical vs regular errors
    if (isCritical) {
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' }); // Bright red for critical
      chrome.action.setTitle({ title: `AI Bug Reporter - 🔴 ${count} КРИТИЧН${count > 1 ? 'ИХ' : 'А'} помилк${count > 1 ? 'и' : 'а'}` });
    } else {
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }); // Orange for regular
      chrome.action.setTitle({ title: `AI Bug Reporter - ${count} помилк${count > 1 ? 'и' : 'а'}` });
    }
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'AI Bug Reporter' });
  }
}

/**
 * Stop monitoring
 */
async function stopMonitoring() {
  if (!monitoringState.isMonitoring) {
    return;
  }
  
  console.log('[Background] Stopping monitoring...');
  
  if (monitoringState.tabId) {
    try {
      await chrome.debugger.detach({ tabId: monitoringState.tabId });
    } catch (error) {
      /* ignore */
    }
  }

  monitoringState.isMonitoring = false;
  monitoringState.tabId = null;
  updateBadge(0);
}

/**
 * Handle monitoring toggle
 */
async function handleToggleMonitoring(enabled) {
  console.log('[Background] Toggle monitoring:', enabled);
  
  if (!enabled) {
    // Stop monitoring if it's running
    if (monitoringState.isMonitoring) {
      console.log('[Background] Stopping monitoring...');
      await stopMonitoring();
    }
    // Clear badge
    await chrome.action.setBadgeText({ text: '' });
  } else {
    // Start monitoring for active tab if not already monitoring
    if (!monitoringState.isMonitoring) {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && !activeTab.url.startsWith('chrome://') && !activeTab.url.startsWith('chrome-extension://')) {
          console.log('[Background] Starting monitoring for active tab...');
          await startMonitoring(activeTab.id);
        }
      } catch (error) {
        console.warn('[Background] Could not start monitoring:', error.message);
      }
    }
  }
}

/**
 * Main handler for bug analysis
 */
async function handleAnalyzeBug(data) {
  console.log('[Background] Starting bug analysis...');
  
  try {
    // Get active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab) {
      throw new Error('No active tab found');
    }
    
    if (activeTab.url.startsWith('chrome://')) {
      throw new Error('Cannot analyze Chrome internal pages');
    }
    
    // Use monitoring data if available, otherwise capture fresh
    if (monitoringState.isMonitoring && monitoringState.tabId === activeTab.id) {
      console.log('[Background] Using monitoring data');
      captureState.consoleLogs = [...monitoringState.consoleLogs];
      captureState.networkLogs = [...monitoringState.networkLogs];
    } else {
      // Start capturing context
      await startContextCapture(activeTab.id);
      
      // Wait a bit to collect logs
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Load user settings
    const settings = await getSettings();
    console.log('[Background] Using settings:', settings);
    
    // Get DOM snapshot (if enabled)
    let domSnapshot = null;
    if (settings.includeDomStructure) {
      domSnapshot = await captureDOMSnapshot(activeTab.id);
    }
    
    // Stop capturing (but keep monitoring)
    stopContextCapture();
    
    // For Jira mode - always capture screenshot
    const mode = data.mode || 'bug';
    const effectiveSettings = mode === 'jira' 
      ? { ...settings, includeScreenshot: true } 
      : settings;
    
    // Collect additional context based on settings
    let additionalContext = await collectAdditionalContext(activeTab.id, effectiveSettings);
    
    // Use manual screenshot from hotkey if available
    if (manualScreenshotData) {
      additionalContext = { ...additionalContext, screenshot: manualScreenshotData };
      manualScreenshotData = null; // Clear after use
    }
    
    // Prepare page info
    const pageInfo = {
      url: activeTab.url,
      title: activeTab.title,
      timestamp: Date.now()
    };
    
    console.log('[Background] Context captured:', {
      consoleLogs: captureState.consoleLogs.length,
      networkLogs: captureState.networkLogs.length,
      domSnapshotLength: domSnapshot?.length || 0,
      hasAdditionalContext: Object.keys(additionalContext).length > 0
    });
    
    console.log('[Background] Console logs sample:', captureState.consoleLogs.slice(0, 3));
    console.log('[Background] Network logs sample:', captureState.networkLogs.slice(0, 3));
    
    // Generate bug report with AI
    console.log('[Background] Calling generateBugReport with description:', data.description, 'mode:', mode);
    const bugReport = await generateBugReport(
      data.description,
      captureState.consoleLogs,
      captureState.networkLogs,
      domSnapshot,
      pageInfo,
      mode,
      additionalContext,
      effectiveSettings
    );
    
    console.log('[Background] Bug report generated:', bugReport);
    
    // Prepare video data for response (already captured above)
    // Extract screenshot for response (user can download and attach to Jira)
    const screenshotData = additionalContext.screenshot ? {
      dataUrl: additionalContext.screenshot,
      format: 'png'
    } : null;
    
    return {
      bugReport,
      context: {
        consoleLogsCount: captureState.consoleLogs.length,
        consoleErrorsCount: captureState.consoleLogs.filter(l => l.level === 'error').length,
        consoleWarningsCount: captureState.consoleLogs.filter(l => l.level === 'warn').length,
        networkLogsCount: captureState.networkLogs.length,
        networkErrorsCount: captureState.networkLogs.filter(l => 
          l.type === 'Network.loadingFailed' || 
          (l.type === 'Network.responseReceived' && l.params?.response?.status >= 400)
        ).length,
        pageInfo,
        hasVideo: false,
        hasScreenshot: !!screenshotData
      },
      video: null,
      screenshot: screenshotData
    };
    
  } catch (error) {
    console.error('[Background] Error analyzing bug:', error);
    stopContextCapture();
    throw error;
  }
}

/**
 * Start capturing context (for analysis)
 */
async function startContextCapture(tabId) {
  console.log('[Background] Starting context capture for tab:', tabId);
  
  // Reset state
  captureState = {
    isCapturing: true,
    tabId: tabId,
    consoleLogs: [],
    networkLogs: [],
    startTime: Date.now()
  };
  
  // Inject console interceptor if not monitoring
  if (!monitoringState.isMonitoring || monitoringState.tabId !== tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content_scripts/console-interceptor.js']
      });
      console.log('[Background] Console interceptor injected');
    } catch (error) {
      console.warn('[Background] Could not inject console interceptor:', error.message);
    }
    
    try {
      await chrome.debugger.attach({ tabId: tabId }, '1.3');
      await chrome.debugger.sendCommand({ tabId: tabId }, 'Network.enable');
      console.log('[Background] Debugger attached for network monitoring');
    } catch (error) {
      console.warn('[Background] Could not attach debugger:', error.message);
    }
  }
}

/**
 * Stop capturing context
 */
function stopContextCapture() {
  console.log('[Background] Stopping context capture');
  captureState.isCapturing = false;

  if (!monitoringState.isMonitoring && captureState.tabId) {
    chrome.debugger.detach({ tabId: captureState.tabId }).catch(err => {
      console.warn('[Background] Error detaching debugger:', err.message);
    });
  }
}

/**
 * Capture DOM snapshot
 */
async function captureDOMSnapshot(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // Get page HTML, remove scripts and limit size
        const html = document.documentElement.outerHTML;
        // Remove script and style tags for cleaner context
        const cleaned = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
        // Limit to 50KB
        return cleaned.substring(0, 50000);
      }
    });
    
    return results[0]?.result || '';
  } catch (error) {
    console.warn('[Background] Could not capture DOM:', error.message);
    return '';
  }
}

/**
 * Network events (Chrome DevTools Protocol)
 */
chrome.debugger.onEvent.addListener((source, method, params) => {
  const isMonitoring = monitoringState.isMonitoring && source.tabId === monitoringState.tabId;
  const isCapturing = captureState.isCapturing && source.tabId === captureState.tabId;
  
  if (!isMonitoring && !isCapturing) {
    return;
  }
  
  // Capture network events
  if (['Network.requestWillBeSent', 'Network.responseReceived', 'Network.loadingFailed'].includes(method)) {
    const logEntry = {
      type: method,
      params: params,
      timestamp: Date.now()
    };
    
    // Store in monitoring
    if (isMonitoring) {
      monitoringState.networkLogs.push(logEntry);
      
      // Classify and count network errors
      if (method === 'Network.loadingFailed') {
        const errorLog = {
          ...logEntry,
          source: 'network',
          failed: true,
          errorText: params.errorText
        };
        
        const classification = classifyError(errorLog);
        monitoringState.classifiedErrors.push({
          ...errorLog,
          classification
        });

        scheduleIncidentJiraDraft(
          monitoringState.classifiedErrors[monitoringState.classifiedErrors.length - 1],
          source.tabId
        );

        monitoringState.networkErrorCount++;
        if (classification.isCritical) {
          monitoringState.criticalCount++;
        }
        
        const badgeCount = monitoringState.criticalCount > 0 
          ? monitoringState.criticalCount 
          : (monitoringState.errorCount + monitoringState.networkErrorCount);
        updateBadge(badgeCount, monitoringState.criticalCount > 0);
        
      } else if (method === 'Network.responseReceived' && params.response?.status >= 400) {
        const errorLog = {
          ...logEntry,
          source: 'network',
          status: params.response.status,
          url: params.response.url
        };
        
        const classification = classifyError(errorLog);
        monitoringState.classifiedErrors.push({
          ...errorLog,
          classification
        });

        scheduleIncidentJiraDraft(
          monitoringState.classifiedErrors[monitoringState.classifiedErrors.length - 1],
          source.tabId
        );

        monitoringState.networkErrorCount++;
        if (classification.isCritical) {
          monitoringState.criticalCount++;
        }
        
        const badgeCount = monitoringState.criticalCount > 0 
          ? monitoringState.criticalCount 
          : (monitoringState.errorCount + monitoringState.networkErrorCount);
        updateBadge(badgeCount, monitoringState.criticalCount > 0);
      }
    }
    
    // Store in capture
    if (isCapturing) {
      captureState.networkLogs.push(logEntry);
    }
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId === captureState.tabId) {
    console.log('[Background] Debugger detached:', reason);
    if (captureState.isCapturing) {
      captureState.isCapturing = false;
    }
  }

  if (source.tabId === monitoringState.tabId) {
    console.log('[Background] Monitoring debugger detached:', reason);
    if (monitoringState.isMonitoring) {
      monitoringState.isMonitoring = false;
      updateBadge(0);
    }
  }
});

console.log('[Background] Event listeners registered');
