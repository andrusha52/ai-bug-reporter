// utils/contextCollector.js — мінімальний контекст для звіту (БЕЗ читання localStorage/cookies)

/**
 * Додатковий контекст лише з дозволених джерел (не читаємо localStorage/cookies для AI).
 */
export async function collectAdditionalContext(tabId, settings) {
  const context = {};

  try {
    if (settings.includeUserAgent) {
      context.userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    }
    if (settings.includeScreenInfo && typeof screen !== 'undefined') {
      context.screenInfo = {
        screenWidth: screen.width,
        screenHeight: screen.height
      };
    }
    if (settings.includeBrowserInfo && typeof navigator !== 'undefined') {
      context.browserInfo = {
        platform: navigator.platform,
        language: navigator.language,
        onLine: navigator.onLine
      };
    }
    if (settings.includeScreenshot) {
      try {
        context.screenshot = await captureScreenshot(tabId);
      } catch (error) {
        console.error('[ContextCollector] Screenshot error:', error);
        context.screenshot = null;
      }
    }
    // Намисно НЕ читаємо localStorage / cookies для звіту.
  } catch (error) {
    console.error('[ContextCollector] Error:', error);
  }

  return context;
}

async function captureScreenshot(tabId) {
  const tab = await chrome.tabs.get(tabId);
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png', quality: 80 });
}

export function formatAdditionalContext(context) {
  const parts = [];
  if (context.userAgent) parts.push(`USER AGENT:\n${context.userAgent}`);
  if (context.screenInfo) {
    parts.push(`SCREEN: ${context.screenInfo.screenWidth}x${context.screenInfo.screenHeight}`);
  }
  if (context.browserInfo) {
    parts.push(`BROWSER: ${context.browserInfo.platform}, ${context.browserInfo.language}`);
  }
  if (context.screenshot) {
    parts.push(`SCREENSHOT: (${(context.screenshot.length / 1024).toFixed(0)}KB)`);
  }
  return parts.join('\n\n');
}
