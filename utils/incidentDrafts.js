/**
 * Helpers for per-incident AI drafts (focused console/network slice).
 */

const HISTORY_KEY = 'reportHistory';
const HISTORY_MAX = 25;
const DRAFT_PROMPT_KEY = 'draftReadyPrompt';

/** Доповнює мережеву помилку URL/method з логів CDP (для loadingFailed). */
export function enrichNetworkErrorFromLogs(err, networkLogs) {
  if (err.source !== 'network' || !Array.isArray(networkLogs)) return err;
  const rid = err.params?.requestId;
  if (rid == null) return err;
  const sent = [...networkLogs].reverse().find(
    (l) => l.type === 'Network.requestWillBeSent' && l.params?.requestId === rid
  );
  if (!sent?.params?.request) return err;
  const req = sent.params.request;
  return {
    ...err,
    url: err.url || err.params?.response?.url || req.url,
    params: {
      ...err.params,
      request: { ...(err.params?.request || {}), method: req.method, url: req.url }
    }
  };
}

/** Групування однакових інцидентів (один AI-звіт на групу). */
export function incidentGroupKey(err) {
  if (err.source === 'network') {
    const url =
      err.params?.response?.url ||
      err.url ||
      err.params?.request?.url ||
      '';
    let path = url;
    try {
      const u = new URL(url, 'https://placeholder.local');
      path = u.pathname;
    } catch {
      /* ignore */
    }
    const method = err.params?.request?.method || '';
    const code =
      err.status || err.params?.response?.status || err.errorText || err.params?.errorText || '';
    return `g:net:${method}:${path}:${code}`;
  }
  const raw = String(err.args?.[0] ?? err.message ?? '');
  const line = raw.split('\n')[0].trim().slice(0, 220);
  return `g:con:${line}`;
}

export function bugReportToPlainText(report) {
  if (!report) return '';
  if (report.fullReport) return report.fullReport;
  if (report.fullText) return report.fullText;
  const parts = [];
  if (report.summary) parts.push(`Summary\n${report.summary}`);
  if (report.rootCause) parts.push(`Root cause\n${report.rootCause}`);
  if (report.stepsToReproduce) parts.push(`Steps\n${report.stepsToReproduce}`);
  if (report.expectedBehavior) parts.push(`Expected\n${report.expectedBehavior}`);
  if (report.actualBehavior) parts.push(`Actual\n${report.actualBehavior}`);
  if (report.technicalDetails) parts.push(`Technical\n${report.technicalDetails}`);
  return parts.join('\n\n');
}

export async function appendAutoDraftToHistory(bugReport, pageInfo) {
  try {
    const fullReport = bugReportToPlainText(bugReport);
    const summary = bugReport?.summary || fullReport.slice(0, 100) || 'Jira чернетка';
    let host = '';
    try {
      const url = pageInfo?.url || '';
      if (url) host = new URL(url).hostname;
    } catch {
      /* ignore */
    }
    const entry = {
      id: Date.now(),
      timestamp: Date.now(),
      summary: summary.slice(0, 80) + (summary.length > 80 ? '…' : ''),
      fullReport,
      url: host || '—',
      mode: 'jira-auto',
      viewed: false
    };
    const { [HISTORY_KEY]: list = [] } = await chrome.storage.local.get(HISTORY_KEY);
    const updated = [entry, ...list].slice(0, HISTORY_MAX);
    await chrome.storage.local.set({ [HISTORY_KEY]: updated });
  } catch (e) {
    console.warn('[incidentDrafts] appendAutoDraftToHistory:', e);
  }
}

export async function setDraftReadyPrompt(tabId, fingerprint, title) {
  try {
    await chrome.storage.session.set({
      [DRAFT_PROMPT_KEY]: { tabId, fingerprint, title, at: Date.now() }
    });
  } catch (e) {
    await chrome.storage.local.set({
      [DRAFT_PROMPT_KEY]: { tabId, fingerprint, title, at: Date.now() }
    });
  }
}

export async function clearDraftReadyPrompt() {
  try {
    await chrome.storage.session.remove(DRAFT_PROMPT_KEY);
  } catch (e) {
    await chrome.storage.local.remove(DRAFT_PROMPT_KEY);
  }
}

export function inferIncidentTitle(err) {
  if (err.source === 'network') {
    const url = err.params?.response?.url || err.url || '';
    let short = url;
    try {
      const parsed = new URL(url);
      short = parsed.pathname + parsed.search;
    } catch {
      /* keep */
    }
    const status = err.status || err.params?.response?.status;
    const fail = err.errorText || err.params?.errorText;
    if (status) return `${status} ${short.slice(0, 72)}`;
    if (fail) return `Network: ${String(fail).slice(0, 64)}`;
    return `Network: ${short.slice(0, 80)}`;
  }
  const msg = err.args?.join(' ') || err.message || 'Console error';
  return msg.length > 90 ? msg.slice(0, 87) + '…' : msg;
}

export function inferIncidentDescription(err, lang = 'uk') {
  if (lang === 'en') {
    if (err.source === 'network') {
      const url = err.params?.response?.url || err.url || '';
      const status = err.status || err.params?.response?.status;
      const fail = err.errorText || err.params?.errorText;
      return `Auto: network issue on this tab. ${status ? `HTTP ${status}. ` : ''}${fail ? `Error: ${fail}. ` : ''}URL: ${url}. Create a Jira-ready bug ticket with summary, steps, expected/actual, technical details.`;
    }
    const msg = err.args?.join(' ') || err.message || '';
    return `Auto: JavaScript console problem on this tab: ${msg}. Create a Jira-ready bug ticket.`;
  }
  if (err.source === 'network') {
    const url = err.params?.response?.url || err.url || '';
    const status = err.status || err.params?.response?.status;
    const fail = err.errorText || err.params?.errorText;
    return `Автоматично: мережева помилка на цій вкладці. ${status ? `HTTP ${status}. ` : ''}${fail ? `Текст: ${fail}. ` : ''}URL: ${url}. Згенеруй готовий опис для Jira: summary, кроки, expected/actual, технічні деталі.`;
  }
  const msg = err.args?.join(' ') || err.message || '';
  return `Автоматично: помилка в консолі на цій вкладці: ${msg}. Згенеруй готовий опис для Jira.`;
}

export function buildFocusedLogsForIncident(err, consoleLogs, networkLogs) {
  const rid = err.params?.requestId;
  let netSlice;
  if (err.source === 'network' && rid != null) {
    netSlice = networkLogs.filter((l) => l.params?.requestId === rid);
  } else if (err.source === 'network') {
    netSlice = networkLogs.slice(-40);
  } else {
    netSlice = networkLogs.slice(-30);
  }
  const conSlice = err.source === 'console' ? consoleLogs.slice(-80) : consoleLogs.slice(-40);
  return { consoleLogs: conSlice, networkLogs: netSlice };
}

const STORAGE_KEY = 'incidentJiraDrafts';

export async function loadDraftsMap() {
  const { [STORAGE_KEY]: map } = await chrome.storage.local.get(STORAGE_KEY);
  return map && typeof map === 'object' ? map : {};
}

export async function saveDraftsMap(map) {
  await chrome.storage.local.set({ [STORAGE_KEY]: map });
}

export async function getDraftsForTab(tabId) {
  const map = await loadDraftsMap();
  const key = String(tabId);
  return Array.isArray(map[key]) ? map[key] : [];
}

export async function upsertDraftForTab(tabId, draft) {
  const map = await loadDraftsMap();
  const key = String(tabId);
  const list = Array.isArray(map[key]) ? [...map[key]] : [];
  const idx = list.findIndex((d) => d.fingerprint === draft.fingerprint);
  if (idx >= 0) list[idx] = { ...list[idx], ...draft };
  else {
    list.push(draft);
    while (list.length > 14) list.shift();
  }
  map[key] = list;
  await saveDraftsMap(map);
}

export async function removeDraftForTab(tabId, fingerprint) {
  const map = await loadDraftsMap();
  const key = String(tabId);
  if (!Array.isArray(map[key])) return;
  map[key] = map[key].filter((d) => d.fingerprint !== fingerprint);
  await saveDraftsMap(map);
}
