/**
 * Флаги залежать від manifest.json (одне джерело правди).
 * Store: без жорстких host_permissions (тільки AI API). Dev: manifest.dev.json + <all_urls>.
 */
function getPerms() {
  try {
    return chrome.runtime.getManifest().permissions || [];
  } catch {
    return [];
  }
}

const P = getPerms();

/** true якщо у manifest немає debugger (типова store-збірка) */
export const STORE_SAFE_BUILD = !P.includes('debugger');

export const FEATURE_DEBUGGER_NETWORK = P.includes('debugger');
export const FEATURE_BACKGROUND_DOWNLOADS = P.includes('downloads');
export const FEATURE_NOTIFICATIONS = P.includes('notifications');
