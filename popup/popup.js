// popup/popup.js - Simplified popup for AI Bug Reporter

import { bugReportToPlainText, clearDraftReadyPrompt } from '../utils/incidentDrafts.js';

console.log('[Popup] Script loaded');

// DOM Elements
const inputSection = document.getElementById('input-section');
const loadingSection = document.getElementById('loading-section');
const resultSection = document.getElementById('result-section');
const settingsSection = document.getElementById('settings-section');

const errorStats = document.getElementById('errorStats');
const criticalBadge = document.getElementById('criticalBadge');
const highBadge = document.getElementById('highBadge');
const mediumBadge = document.getElementById('mediumBadge');
const lowBadge = document.getElementById('lowBadge');

const criticalCount = document.getElementById('criticalCount');
const highCount = document.getElementById('highCount');
const mediumCount = document.getElementById('mediumCount');
const lowCount = document.getElementById('lowCount');

const criticalTooltip = document.getElementById('criticalTooltip');
const highTooltip = document.getElementById('highTooltip');
const mediumTooltip = document.getElementById('mediumTooltip');
const lowTooltip = document.getElementById('lowTooltip');

const errorDetails = document.getElementById('errorDetails');
const detailsToggle = document.getElementById('detailsToggle');
const detailsContent = document.getElementById('detailsContent');

const bugDescription = document.getElementById('bugDescription');
const analyzeBtn = document.getElementById('analyzeBtn');
const errorDiv = document.getElementById('error');

const bugReport = document.getElementById('bugReport');
const contextInfo = document.getElementById('contextInfo');
const copyBtn = document.getElementById('copyBtn');
const newAnalysisBtn = document.getElementById('newAnalysisBtn');
const pageInfo = document.getElementById('pageInfo');
const settingsBtn = document.getElementById('settingsBtn');

// Store video and screenshot for download
let currentScreenshotData = null;
let currentReportFullText = null;
let incidentDraftsPollId = null;
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const backFromSettingsBtn = document.getElementById('backFromSettingsBtn');
const clearAiTokenBtn = document.getElementById('clearAiTokenBtn');

// Initialize
init();

async function init() {
  try {
    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab) {
      const url = new URL(tab.url);
      pageInfo.textContent = url.hostname || 'Сторінка';
      pageInfo.title = tab.url;
      const isWebPage = tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'));
      if (isWebPage) {
        pageInfo.href = tab.url;
        pageInfo.onclick = (e) => {
          e.preventDefault();
          chrome.tabs.update(tab.id, { active: true });
          window.close();
        };
      }
    }
    
    // Get error stats and show severity badges
    await updateErrorStats();
    await refreshIncidentDrafts();
    wireDraftReadyModal();
    await maybeShowDraftReadyModal();

    // Setup event listeners
    analyzeBtn.addEventListener('click', () => handleAnalyze());
    copyBtn.addEventListener('click', handleCopy);
    const downloadScreenshotBtn = document.getElementById('downloadScreenshotBtn');
    if (downloadScreenshotBtn) {
      downloadScreenshotBtn.addEventListener('click', handleDownloadScreenshot);
    }
    newAnalysisBtn.addEventListener('click', handleNewAnalysis);
    const backToHistoryBtn = document.getElementById('backToHistoryBtn');
    if (backToHistoryBtn) {
      backToHistoryBtn.addEventListener('click', () => {
        document.getElementById('backToHistoryBtn').style.display = 'none';
        showHistory();
      });
    }
    settingsBtn.addEventListener('click', toggleSettings);
    saveSettingsBtn.addEventListener('click', handleSaveSettings);
    backFromSettingsBtn.addEventListener('click', () => showInput());
    if (clearAiTokenBtn) {
      clearAiTokenBtn.addEventListener('click', handleClearAiToken);
    }
    
    const geminiInput = document.getElementById('geminiTokenInput');
    const openaiInput = document.getElementById('openaiTokenInput');
    if (geminiInput) {
      geminiInput.addEventListener('input', () => handleTokenInput('gemini', geminiInput, openaiInput));
      geminiInput.addEventListener('paste', () => setTimeout(() => handleTokenInput('gemini', geminiInput, openaiInput), 0));
    }
    if (openaiInput) {
      openaiInput.addEventListener('input', () => handleTokenInput('openai', openaiInput, geminiInput));
      openaiInput.addEventListener('paste', () => setTimeout(() => handleTokenInput('openai', openaiInput, geminiInput), 0));
    }
    
    const shortcutsLink = document.getElementById('shortcutsLink');
    if (shortcutsLink) {
      shortcutsLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      });
    }

    document.querySelectorAll('.template-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.dataset.text;
        if (text) bugDescription.value = text;
        bugDescription.focus();
      });
    });

    const historyBtn = document.getElementById('historyBtn');
    const backFromHistoryBtn = document.getElementById('backFromHistoryBtn');
    if (historyBtn) historyBtn.addEventListener('click', showHistory);
    if (backFromHistoryBtn) backFromHistoryBtn.addEventListener('click', () => showInput());
    
    // Details toggle
    if (detailsToggle) {
      detailsToggle.addEventListener('click', toggleDetails);
    }
    
    applyStoreBuildUiVisibility();

    // Always show input section (no auth required)
    showInput();

    chrome.runtime.sendMessage({ type: 'POPUP_OPENED' }).catch(() => {});
    
    // Enter key to submit (Shift+Enter for new line)
    bugDescription.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevent new line
        handleAnalyze();
      }
    });
    
    // Quick action chips
    document.querySelectorAll('.quick-action-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        const mode = chip.dataset.mode;
        setAnalysisMode(mode);
        
        // Auto-fill description if empty and errors detected
        if (!bugDescription.value.trim()) {
          const defaultText = getDefaultDescriptionForMode(mode);
          bugDescription.value = defaultText;
        }
        
        handleAnalyze(mode);
      });
    });
    
    bugDescription.focus();
    
  } catch (error) {
    console.error('[Popup] Initialization error:', error);
    showError('Помилка ініціалізації: ' + error.message);
  }
}

/**
 * Update error stats with severity badges
 */
/**
 * Jira чернетки по інцидентах (фоновий AI)
 */
async function refreshIncidentDrafts() {
  try {
    const res = await sendMessage('GET_INCIDENT_DRAFTS');
    if (!res?.success) return;
    const drafts = res.drafts || [];
    renderIncidentDraftsPanel(drafts);
    const pending = drafts.some((d) => d.status === 'pending');
    if (pending && !incidentDraftsPollId) {
      incidentDraftsPollId = setInterval(() => {
        refreshIncidentDrafts().catch(() => {});
      }, 2000);
    } else if (!pending && incidentDraftsPollId) {
      clearInterval(incidentDraftsPollId);
      incidentDraftsPollId = null;
    }
    await maybeShowDraftReadyModal();
  } catch (e) {
    console.warn('[Popup] refreshIncidentDrafts:', e);
  }
}

function renderIncidentDraftsPanel(drafts) {
  const section = document.getElementById('incident-drafts-section');
  const list = document.getElementById('incidentDraftsList');
  if (!section || !list) return;

  if (!drafts.length) {
    section.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  section.style.display = 'block';
  list.innerHTML = drafts
    .slice()
    .reverse()
    .map((d) => {
      const st = d.status || 'pending';
      let statusHtml = '';
      if (st === 'pending') {
        statusHtml = '<span class="incident-draft-status pending">Генерується…</span>';
      } else if (st === 'ready') {
        statusHtml = '<span class="incident-draft-status ready">Готово</span>';
      } else {
        statusHtml = `<span class="incident-draft-status err">${escapeHtml(d.error || 'Помилка')}</span>`;
      }
      const baseTitle = escapeHtml(d.title || 'Інцидент');
      const occHtml =
        d.occurrenceCount > 1
          ? ` <span class="occ-badge" title="Повторів">×${Number(d.occurrenceCount)}</span>`
          : '';
      const title = `${baseTitle}${occHtml}`;
      const fpEnc = encodeURIComponent(d.fingerprint || '');
      return `
      <div class="incident-draft-card" data-fingerprint="${fpEnc}">
        <div class="incident-draft-card-top">
          <span class="incident-draft-kind">${d.kind === 'network' ? '🌐' : '💻'}</span>
          <div class="incident-draft-card-body">
            <div class="incident-draft-title">${title}</div>
            ${statusHtml}
          </div>
          <button type="button" class="incident-draft-dismiss" title="Прибрати зі списку" data-fp="${fpEnc}">×</button>
        </div>
        <div class="incident-draft-actions">
          ${st === 'ready' && d.bugReport ? `<button type="button" class="btn btn-draft-open" data-fp="${fpEnc}">Відкрити Jira-текст</button>` : ''}
          ${st === 'ready' && d.bugReport ? `<button type="button" class="btn btn-draft-copy" data-fp="${fpEnc}">Копіювати</button>` : ''}
        </div>
      </div>`;
    })
    .join('');

  list.querySelectorAll('.incident-draft-dismiss').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      let fp = btn.getAttribute('data-fp');
      if (fp) fp = decodeURIComponent(fp);
      if (!fp) return;
      await sendMessage('REMOVE_INCIDENT_DRAFT', { fingerprint: fp });
      await refreshIncidentDrafts();
    });
  });

  list.querySelectorAll('.btn-draft-open').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fp = decodeURIComponent(btn.getAttribute('data-fp') || '');
      const d = drafts.find((x) => x.fingerprint === fp);
      if (!d?.bugReport) return;
      openIncidentDraftResult(d);
    });
  });

  list.querySelectorAll('.btn-draft-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fp = decodeURIComponent(btn.getAttribute('data-fp') || '');
      const d = drafts.find((x) => x.fingerprint === fp);
      if (!d?.bugReport) return;
      const text = bugReportToPlainText(d.bugReport);
      try {
        await navigator.clipboard.writeText(text);
        const o = btn.textContent;
        btn.textContent = '✓ Скопійовано';
        setTimeout(() => { btn.textContent = o; }, 1600);
      } catch (err) {
        console.error(err);
      }
    });
  });
}

async function readDraftReadyPrompt() {
  try {
    const s = await chrome.storage.session.get('draftReadyPrompt');
    if (s.draftReadyPrompt) return s.draftReadyPrompt;
  } catch {
    /* session API */
  }
  const l = await chrome.storage.local.get('draftReadyPrompt');
  return l.draftReadyPrompt || null;
}

async function maybeShowDraftReadyModal() {
  const modal = document.getElementById('draft-ready-modal');
  if (modal?.style.display === 'flex') return;

  const prompt = await readDraftReadyPrompt();
  if (!prompt?.fingerprint) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== prompt.tabId) return;
  if (Date.now() - prompt.at > 15 * 60 * 1000) {
    await clearDraftReadyPrompt();
    return;
  }
  const titleEl = document.getElementById('draft-ready-title');
  if (!modal || !titleEl) return;
  titleEl.textContent = prompt.title || 'Чернетка готова';
  modal.style.display = 'flex';
}

function wireDraftReadyModal() {
  const modal = document.getElementById('draft-ready-modal');
  const openBtn = document.getElementById('draftReadyOpenBtn');
  const skipBtn = document.getElementById('draftReadySkipBtn');
  if (!modal || !openBtn || !skipBtn) return;

  const hide = async () => {
    modal.style.display = 'none';
    await clearDraftReadyPrompt();
  };

  openBtn.addEventListener('click', async () => {
    await hide();
    const section = document.getElementById('incident-drafts-section');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (section) {
      section.classList.add('incident-drafts-highlight');
      setTimeout(() => section.classList.remove('incident-drafts-highlight'), 2200);
    }
    await refreshIncidentDrafts();
  });

  skipBtn.addEventListener('click', hide);
}

function openIncidentDraftResult(draft) {
  const minimal = {
    bugReport: draft.bugReport,
    context: {
      consoleLogsCount: 0,
      consoleErrorsCount: 0,
      consoleWarningsCount: 0,
      networkLogsCount: 0,
      networkErrorsCount: 0,
      pageInfo: {},
      hasVideo: false,
      hasScreenshot: false
    },
    video: null,
    screenshot: null
  };
  displayResults(minimal, 'jira', { skipHistory: true });
  const h2 = document.querySelector('#result-section .result-header h2');
  if (h2) h2.textContent = 'Jira (авточернетка)';
}

async function updateErrorStats() {
  try {
    const response = await sendMessage('GET_ERROR_STATS');
    
    if (response.success && response.stats) {
      const { analysis, classifiedErrors } = response.stats;
      
      if (!analysis || analysis.total === 0) {
        errorStats.style.display = 'none';
        return;
      }
      
      // Show error stats
      errorStats.style.display = 'block';
      
      // Update severity badges
      updateSeverityBadge('critical', analysis.critical, classifiedErrors);
      updateSeverityBadge('high', analysis.high, classifiedErrors);
      updateSeverityBadge('medium', analysis.medium, classifiedErrors);
      updateSeverityBadge('low', analysis.low, classifiedErrors);
      
      // Show error details if there are errors
      if (classifiedErrors && classifiedErrors.length > 0) {
        populateErrorDetails(classifiedErrors);
        errorDetails.style.display = 'block';
      } else {
        errorDetails.style.display = 'none';
      }
    }
  } catch (error) {
    console.warn('[Popup] Could not get error stats:', error);
  }
}

/**
 * Update individual severity badge
 */
function updateSeverityBadge(severity, count, classifiedErrors) {
  const badge = document.getElementById(`${severity}Badge`);
  const countEl = document.getElementById(`${severity}Count`);
  const tooltip = document.getElementById(`${severity}Tooltip`);
  
  if (count > 0) {
    badge.style.display = 'flex';
    countEl.textContent = count;
    
    // Build tooltip with error types
    const errorsOfSeverity = classifiedErrors.filter(e => 
      e.classification?.severity === severity
    );
    
    if (errorsOfSeverity.length > 0) {
      const types = {};
      errorsOfSeverity.forEach(e => {
        const type = e.classification?.type || 'unknown';
        types[type] = (types[type] || 0) + 1;
      });
      
      const tooltipText = Object.entries(types)
        .map(([type, cnt]) => {
          const typeLabels = {
            frontend: '💻 Frontend',
            backend: '🖥️ Backend',
            network: '🌐 Network',
            auth: '🔐 Auth',
            validation: '✅ Validation',
            unknown: '❓ Unknown'
          };
          return `${typeLabels[type] || type}: ${cnt}`;
        })
        .join('\n');
      
      tooltip.textContent = tooltipText;
    }
  } else {
    badge.style.display = 'none';
  }
}

/**
 * Populate error details dropdown
 */
function populateErrorDetails(classifiedErrors) {
  const maxErrors = 10; // Show max 10 errors
  const errors = classifiedErrors.slice(0, maxErrors);
  
  detailsContent.innerHTML = errors.map(error => {
    const type = error.classification?.type || 'unknown';
    const emoji = error.classification?.emoji || '❓';
    const details = error.classification?.details || '';
    
    let message = '';
    if (error.source === 'console') {
      message = error.args?.join(' ') || 'Console error';
    } else if (error.source === 'network') {
      message = `${error.params?.request?.method || 'Request'} ${error.params?.response?.url || error.url || ''}`;
      if (error.status) {
        message += ` - ${error.status}`;
      }
      if (details) {
        message += ` (${details})`;
      }
    }
    
    // Truncate long messages
    if (message.length > 100) {
      message = message.substring(0, 100) + '...';
    }
    
    return `
      <div class="error-item">
        <div class="error-item-header">
          <span>${emoji}</span>
          <span class="error-item-type ${type}">${type}</span>
        </div>
        <div class="error-item-message">${escapeHtml(message)}</div>
      </div>
    `;
  }).join('');
  
  if (classifiedErrors.length > maxErrors) {
    detailsContent.innerHTML += `
      <div class="error-item" style="text-align: center; font-style: italic;">
        +${classifiedErrors.length - maxErrors} more errors...
      </div>
    `;
  }
}

/**
 * Toggle error details
 */
function toggleDetails() {
  const isOpen = detailsContent.style.display === 'block';
  detailsContent.style.display = isOpen ? 'none' : 'block';
  detailsToggle.classList.toggle('open', !isOpen);
}

/**
 * Get default description for analysis mode
 */
function getDefaultDescriptionForMode(mode) {
  const defaultDescriptions = {
    bug: 'Аналізуй виявлені помилки та створи детальний баг репорт',
    jira: 'Створи bug report для Jira тікета з скріншотом',
    fix: 'Як виправити ці помилки? Які кроки потрібні для фіксу?',
    qa: 'Створи QA тест план для цих помилок. Що потрібно перевірити?',
    quick: 'Швидкий саммарі помилок - що не працює і чому?'
  };
  
  return defaultDescriptions[mode] || defaultDescriptions.bug;
}

/**
 * Set analysis mode (highlight active chip)
 */
function setAnalysisMode(mode) {
  document.querySelectorAll('.quick-action-chip').forEach(chip => {
    if (chip.dataset.mode === mode) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

/**
 * Handle analyze button click
 */
async function handleAnalyze(mode = 'bug') {
  const description = bugDescription.value.trim();
  
  if (!description) {
    showError('Будь ласка, опиши проблему');
    bugDescription.focus();
    return;
  }
  
  showLoading();
  hideError();
  setAnalyzeButtonLoading(true);
  
  try {
    console.log('[Popup] Sending ANALYZE_BUG message with mode:', mode);
    
    const response = await sendMessage('ANALYZE_BUG', { description, mode });
    
    if (!response.success) {
      throw new Error(response.error || 'Невідома помилка');
    }
    
    console.log('[Popup] Analysis complete:', response.data);
    
    // Show results
    displayResults(response.data, mode);
    
  } catch (error) {
    console.error('[Popup] Analysis error:', error);
    showError('Помилка аналізу: ' + error.message);
    showInput();
  } finally {
    setAnalyzeButtonLoading(false);
  }
}

function setAnalyzeButtonLoading(loading) {
  const btn = document.getElementById('analyzeBtn');
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.classList.add('loading');
    const text = btn.querySelector('.btn-text');
    if (text) text.textContent = 'Аналізую...';
  } else {
    btn.disabled = false;
    btn.classList.remove('loading');
    const text = btn.querySelector('.btn-text');
    if (text) text.textContent = 'Аналізувати';
  }
}

/**
 * Display analysis results
 */
function displayResults(data, mode = 'bug', options = {}) {
  const { skipHistory = false, fromHistory = false } = options;
  const { bugReport: report, context, screenshot } = data;
  
  // Store for download
  currentScreenshotData = screenshot || null;
  currentReportFullText = report?.fullReport || report?.fullText || null;
  
  // Show/hide download screenshot button
  const downloadScreenshotBtn = document.getElementById('downloadScreenshotBtn');
  if (downloadScreenshotBtn) {
    downloadScreenshotBtn.style.display = (currentScreenshotData?.dataUrl) ? 'flex' : 'none';
  }
  
  // Update header for Jira mode
  const resultHeader = document.querySelector('#result-section .result-header h2');
  if (resultHeader) {
    resultHeader.textContent = mode === 'jira' ? 'Jira Ticket' : 'Bug Report';
  }
  
  // Reset mode highlighting
  document.querySelectorAll('.quick-action-chip').forEach(chip => {
    chip.classList.remove('active');
  });
  
  // Format bug report as markdown-like HTML
  let html = '';
  
  if (report.summary) {
    html += `<div class="section-block">
      <h3>📋 Summary</h3>
      <p>${escapeHtml(report.summary)}</p>
    </div>`;
  }
  
  if (report.rootCause) {
    html += `<div class="section-block">
      <h3>🔍 Root Cause</h3>
      <p>${escapeHtml(report.rootCause)}</p>
    </div>`;
  }
  
  if (report.stepsToReproduce) {
    html += `<div class="section-block">
      <h3>📝 Steps to Reproduce</h3>
      <div class="steps">${formatSteps(report.stepsToReproduce)}</div>
    </div>`;
  }
  
  if (report.expectedBehavior) {
    html += `<div class="section-block">
      <h3>✅ Expected Behavior</h3>
      <p>${escapeHtml(report.expectedBehavior)}</p>
    </div>`;
  }
  
  if (report.actualBehavior) {
    html += `<div class="section-block">
      <h3>❌ Actual Behavior</h3>
      <p>${escapeHtml(report.actualBehavior)}</p>
    </div>`;
  }
  
  if (report.technicalDetails) {
    html += `<div class="section-block technical">
      <h3>🔧 Technical Details</h3>
      <pre>${escapeHtml(report.technicalDetails)}</pre>
    </div>`;
  }
  
  if (mode === 'jira' && currentScreenshotData) {
    html += `<div class="section-block">
      <h3>📸 Screenshot</h3>
      <p>Натисни кнопку «Скріншот» вище, щоб завантажити. Прикріпи до Jira тікета.</p>
    </div>`;
  }

  if (!html.trim() && report?.fullReport) {
    html = `<div class="section-block technical">
      <h3>📄 Звіт</h3>
      <pre>${escapeHtml(report.fullReport)}</pre>
    </div>`;
  }

  bugReport.innerHTML = html.trim() ? html : '<p>Не вдалося згенерувати звіт</p>';

  const backHist = document.getElementById('backToHistoryBtn');
  if (backHist) {
    backHist.style.display = fromHistory ? 'flex' : 'none';
  }
  
  if (!skipHistory) {
    saveReportToHistory(report, mode, data);
  }
  
  // Show context info with detailed stats
  const stats = [];
  
  if (context.consoleErrorsCount > 0) {
    stats.push(`${context.consoleErrorsCount} console errors`);
  }
  if (context.consoleWarningsCount > 0) {
    stats.push(`${context.consoleWarningsCount} warnings`);
  }
  if (context.networkErrorsCount > 0) {
    stats.push(`${context.networkErrorsCount} network errors`);
  }
  if (context.consoleLogsCount > 0) {
    stats.push(`${context.consoleLogsCount} total logs`);
  }
  if (context.networkLogsCount > 0) {
    stats.push(`${context.networkLogsCount} requests`);
  }
  
  let contextText = stats.length > 0 ? `📊 Контекст: ${stats.join(', ')}` : '📊 Контекст: немає даних';
  if (currentScreenshotData && mode === 'jira') {
    contextText += ' • 📸 Скріншот: завантаж і прикріпи до Jira';
  }
  contextInfo.textContent = contextText;
  
  showResult();
}

/**
 * Format steps as ordered list
 */
function formatSteps(stepsText) {
  const lines = stepsText.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    return '<p>' + escapeHtml(stepsText) + '</p>';
  }
  
  let html = '<ol>';
  lines.forEach(line => {
    // Remove leading numbers/bullets if present
    const cleanLine = line.replace(/^[\d\.\-\*\)]+\s*/, '').trim();
    if (cleanLine) {
      html += `<li>${escapeHtml(cleanLine)}</li>`;
    }
  });
  html += '</ol>';
  
  return html;
}

/**
 * Handle download screenshot button
 */
function handleDownloadScreenshot() {
  if (!currentScreenshotData?.dataUrl) return;
  try {
    const link = document.createElement('a');
    link.href = currentScreenshotData.dataUrl;
    link.download = `bug-screenshot-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    const btn = document.getElementById('downloadScreenshotBtn');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2"/></svg><span>Завантажено!</span>';
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    }
  } catch (e) {
    console.error('[Popup] Screenshot download error:', e);
  }
}

/**
 * Handle copy to clipboard
 */
async function handleCopy() {
  try {
    const reportText = currentReportFullText || bugReport.innerText;
    await navigator.clipboard.writeText(reportText);
    
    // Visual feedback
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2"/>
      </svg>
      <span>Скопійовано!</span>
    `;
    copyBtn.classList.add('success');
    
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
      copyBtn.classList.remove('success');
    }, 2000);
    
  } catch (error) {
    console.error('[Popup] Copy error:', error);
    showError('Не вдалося скопіювати');
  }
}

/**
 * Handle new analysis
 */
function handleNewAnalysis() {
  const backHist = document.getElementById('backToHistoryBtn');
  if (backHist) backHist.style.display = 'none';

  currentScreenshotData = null;
  currentReportFullText = null;
  const downloadScreenshotBtn = document.getElementById('downloadScreenshotBtn');
  if (downloadScreenshotBtn) downloadScreenshotBtn.style.display = 'none';
  
  bugDescription.value = '';
  showInput();
  bugDescription.focus();
}

/**
 * Toggle settings: open if on main view, return without saving if in settings
 */
function toggleSettings() {
  if (settingsSection.style.display === 'block') {
    showInput();
  } else {
    showSettings();
    setSettingsButtonIcon('back');
  }
}

function setSettingsButtonIcon(mode) {
  const btn = document.getElementById('settingsBtn');
  if (!btn) return;
  if (mode === 'back') {
    btn.title = 'Назад (без збереження)';
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="2"/>
    </svg>`;
  } else {
    btn.title = 'Налаштування';
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
      <path d="M12 1V3M12 21V23M4.22 4.22L5.64 5.64M18.36 18.36L19.78 19.78M1 12H3M21 12H23M4.22 19.78L5.64 18.36M18.36 5.64L19.78 4.22" stroke="currentColor" stroke-width="2"/>
    </svg>`;
  }
}

/**
 * Show settings view
 */
async function showSettings() {
  await loadSettings();
  updateHotkeyLabels();
  
  inputSection.style.display = 'none';
  loadingSection.style.display = 'none';
  resultSection.style.display = 'none';
  const historySection = document.getElementById('history-section');
  if (historySection) historySection.style.display = 'none';
  settingsSection.style.display = 'block';

  // Setup monitoring toggle change handler (only if not already added)
  const monitoringToggle = document.getElementById('monitoringEnabled');
  monitoringToggle.replaceWith(monitoringToggle.cloneNode(true));
  document.getElementById('monitoringEnabled').addEventListener('change', async function() {
    await handleMonitoringToggleChange(this.checked);
  });
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
 * Handle monitoring toggle change
 */
async function handleMonitoringToggleChange(enabled) {
  try {
    // Get current settings
    const result = await chrome.storage.local.get('settings');
    const settings = result.settings || {};
    
    // Update monitoring state
    settings.monitoringEnabled = enabled;
    
    // Save immediately
    await chrome.storage.local.set({ settings });
    
    // Notify background
    chrome.runtime.sendMessage({ 
      type: 'TOGGLE_MONITORING', 
      enabled 
    });
    
    console.log('[Popup] Monitoring toggled:', enabled);
  } catch (error) {
    console.error('[Popup] Toggle monitoring error:', error);
  }
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['settings', 'aiApiKey', 'openaiApiKey', 'aiProvider']);
    const settings = {
      monitoringEnabled: true,
      hotkeyScreenshotEnabled: true,
      hotkeyAnalyzeEnabled: true,
      includeUserAgent: false,
      includeScreenInfo: false,
      includeBrowserInfo: false,
      includeScreenshot: false,
      includeDomStructure: false,
      includeReduxState: false,
      includeZustand: false,
      autoJiraDrafts: true,
      aiVerbosity: 'normal',
      aiLanguage: 'uk'
    };
    Object.assign(settings, result.settings || {});
    
    document.getElementById('monitoringEnabled').checked = settings.monitoringEnabled !== false;
    const hotkeyScreenshot = document.getElementById('hotkeyScreenshotEnabled');
    const hotkeyAnalyze = document.getElementById('hotkeyAnalyzeEnabled');
    if (hotkeyScreenshot) hotkeyScreenshot.checked = settings.hotkeyScreenshotEnabled !== false;
    if (hotkeyAnalyze) hotkeyAnalyze.checked = settings.hotkeyAnalyzeEnabled !== false;
    const includeScreenshotEl = document.getElementById('includeScreenshot');
    if (includeScreenshotEl) includeScreenshotEl.checked = !!settings.includeScreenshot;
    const autoJira = document.getElementById('autoJiraDrafts');
    if (autoJira) autoJira.checked = settings.autoJiraDrafts !== false;
    document.getElementById('aiVerbosity').value = settings.aiVerbosity;
    document.getElementById('aiLanguage').value = settings.aiLanguage;
    
    const geminiInput = document.getElementById('geminiTokenInput');
    const openaiInput = document.getElementById('openaiTokenInput');
    if (geminiInput) {
      const token = result.aiApiKey || '';
      geminiInput.value = token;
      geminiInput.placeholder = token ? '••••••••••••••••' : 'AIzaSy...';
    }
    if (openaiInput) {
      const token = result.openaiApiKey || '';
      openaiInput.value = token;
      openaiInput.placeholder = token ? '••••••••••••••••' : 'sk-...';
    }
  } catch (error) {
    console.error('[Popup] Load settings error:', error);
  }
}

/**
 * Save settings
 */
async function handleSaveSettings() {
  try {
    const settings = {
      monitoringEnabled: document.getElementById('monitoringEnabled').checked,
      hotkeyScreenshotEnabled: document.getElementById('hotkeyScreenshotEnabled')?.checked !== false,
      hotkeyAnalyzeEnabled: document.getElementById('hotkeyAnalyzeEnabled')?.checked !== false,
      includeUserAgent: false,
      includeScreenInfo: false,
      includeBrowserInfo: false,
      includeScreenshot: document.getElementById('includeScreenshot')?.checked === true,
      includeDomStructure: false,
      includeReduxState: false,
      includeZustand: false,
      includePerformance: false,
      includeUserJourney: false,
      includeSessionStorage: false,
      includeEnvironment: false,
      includeLocalStorage: false,
      includeCookies: false,
      aiVerbosity: document.getElementById('aiVerbosity').value,
      aiLanguage: document.getElementById('aiLanguage').value,
      maxConsoleLogs: 100,
      maxNetworkLogs: 100,
      autoJiraDrafts: document.getElementById('autoJiraDrafts')?.checked !== false
    };
    
    // Save AI tokens (whichever has value - they're mutually exclusive via handleTokenInput)
    const geminiInput = document.getElementById('geminiTokenInput');
    const openaiInput = document.getElementById('openaiTokenInput');
    const { saveGeminiToken, saveOpenaiToken } = await import('../utils/api.js');
    if (geminiInput?.value.trim()) {
      await saveGeminiToken(geminiInput.value.trim());
    } else if (openaiInput?.value.trim()) {
      await saveOpenaiToken(openaiInput.value.trim());
    }
    
    await chrome.storage.local.set({ settings });
    
    console.log('[Popup] Settings saved:', settings);
    
    const toast = document.createElement('div');
    toast.className = 'save-toast';
    toast.textContent = '✓ Налаштування збережено';
    toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:#212121;color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;z-index:9999';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
    
    // Visual feedback
    const originalText = saveSettingsBtn.innerHTML;
    saveSettingsBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2"/>
      </svg>
      <span>Збережено!</span>
    `;
    
    setTimeout(() => {
      saveSettingsBtn.innerHTML = originalText;
      showInput();
    }, 1000);
    
    // Notify background
    chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings });
  } catch (error) {
    console.error('[Popup] Save settings error:', error);
  }
}

/**
 * Handle token input - when one has value, clear the other
 */
async function handleTokenInput(provider, activeInput, otherInput) {
  const value = activeInput.value.trim();
  if (value) {
    otherInput.value = '';
    otherInput.placeholder = provider === 'gemini' ? 'sk-...' : 'AIzaSy...';
    try {
      const { saveGeminiToken, saveOpenaiToken } = await import('../utils/api.js');
      if (provider === 'gemini') {
        await saveGeminiToken(value);
      } else {
        await saveOpenaiToken(value);
      }
    } catch (e) {
      console.error('[Popup] Save token error:', e);
    }
  }
}

/**
 * Clear all AI tokens
 */
async function handleClearAiToken() {
  if (!confirm('Видалити всі AI токени? Аналіз не працюватиме без ключа.')) {
    return;
  }
  
  try {
    const { clearAiTokens } = await import('../utils/api.js');
    await clearAiTokens();
    
    const geminiInput = document.getElementById('geminiTokenInput');
    const openaiInput = document.getElementById('openaiTokenInput');
    if (geminiInput) {
      geminiInput.value = '';
      geminiInput.placeholder = 'AIzaSy...';
    }
    if (openaiInput) {
      openaiInput.value = '';
      openaiInput.placeholder = 'sk-...';
    }
  } catch (error) {
    console.error('[Popup] Clear AI tokens error:', error);
    alert('Помилка видалення токенів');
  }
}

/**
 * UI State Management
 */
function showInput() {
  inputSection.style.display = 'block';
  loadingSection.style.display = 'none';
  resultSection.style.display = 'none';
  settingsSection.style.display = 'none';
  const historySection = document.getElementById('history-section');
  if (historySection) historySection.style.display = 'none';
  setSettingsButtonIcon('settings');
  updateErrorStats().catch(() => {});
  refreshIncidentDrafts().catch(() => {});
}

function showLoading() {
  inputSection.style.display = 'none';
  loadingSection.style.display = 'block';
  resultSection.style.display = 'none';
  const historySection = document.getElementById('history-section');
  if (historySection) historySection.style.display = 'none';
}

function showResult() {
  inputSection.style.display = 'none';
  loadingSection.style.display = 'none';
  resultSection.style.display = 'flex';
  settingsSection.style.display = 'none';
  const historySection = document.getElementById('history-section');
  if (historySection) historySection.style.display = 'none';
}

function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

function hideError() {
  errorDiv.style.display = 'none';
}

const HISTORY_KEY = 'reportHistory';
const HISTORY_MAX = 25;

async function saveReportToHistory(report, mode, data) {
  try {
    const fullReport = report?.fullReport || report?.fullText || '';
    const summary = report?.summary || fullReport?.slice(0, 100) || 'Без назви';
    let host = '';
    try {
      const url = data?.context?.pageInfo?.url || '';
      if (url) host = new URL(url).hostname;
    } catch (_) {}

    const entry = {
      id: Date.now(),
      timestamp: Date.now(),
      summary: summary.slice(0, 80) + (summary.length > 80 ? '...' : ''),
      fullReport,
      url: host || '—',
      mode,
      viewed: true
    };

    const { [HISTORY_KEY]: list = [] } = await chrome.storage.local.get(HISTORY_KEY);
    const updated = [entry, ...list].slice(0, HISTORY_MAX);
    await chrome.storage.local.set({ [HISTORY_KEY]: updated });
  } catch (e) {
    console.warn('[Popup] Save history error:', e);
  }
}

function historyDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function historyDayHeadingUk(ts) {
  return new Date(ts).toLocaleDateString('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

async function markHistoryItemViewed(id) {
  try {
    const { [HISTORY_KEY]: list = [] } = await chrome.storage.local.get(HISTORY_KEY);
    const updated = list.map((it) => (it.id === id ? { ...it, viewed: true } : it));
    await chrome.storage.local.set({ [HISTORY_KEY]: updated });
  } catch (e) {
    console.warn('[Popup] markHistoryItemViewed:', e);
  }
}

function openHistoryItem(item) {
  if (!item?.fullReport) return;

  currentScreenshotData = null;
  const downloadScreenshotBtn = document.getElementById('downloadScreenshotBtn');
  if (downloadScreenshotBtn) downloadScreenshotBtn.style.display = 'none';

  currentReportFullText = item.fullReport;

  const mode =
    item.mode === 'jira-auto' || item.mode === 'jira' ? 'jira' : item.mode || 'bug';
  const modeLabel =
    item.mode === 'jira-auto' ? 'Jira авто' : item.mode === 'jira' ? 'Jira' : item.mode || 'bug';
  const timeStr = new Date(item.timestamp).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const h2 = document.querySelector('#result-section .result-header h2');
  if (h2) h2.textContent = mode === 'jira' ? 'Звіт з історії' : 'Звіт з історії';

  bugReport.innerHTML = `<div class="section-block technical">
    <h3>${escapeHtml(item.summary || '—')}</h3>
    <p class="history-inline-meta">${escapeHtml(timeStr)} · ${escapeHtml(item.url || '—')} · ${escapeHtml(modeLabel)}</p>
    <pre>${escapeHtml(item.fullReport)}</pre>
  </div>`;

  if (contextInfo) {
    contextInfo.textContent = '📂 Відкрито з історії';
  }

  const backHist = document.getElementById('backToHistoryBtn');
  if (backHist) backHist.style.display = 'flex';

  document.querySelectorAll('.quick-action-chip').forEach((chip) => chip.classList.remove('active'));
  showResult();
}

async function showHistory() {
  const backHist = document.getElementById('backToHistoryBtn');
  if (backHist) backHist.style.display = 'none';

  inputSection.style.display = 'none';
  loadingSection.style.display = 'none';
  resultSection.style.display = 'none';
  settingsSection.style.display = 'none';
  const historySection = document.getElementById('history-section');
  const historyList = document.getElementById('historyList');
  if (!historySection || !historyList) return;

  const { [HISTORY_KEY]: rawList = [] } = await chrome.storage.local.get(HISTORY_KEY);
  const list = [...rawList].sort((a, b) => b.timestamp - a.timestamp);

  if (list.length === 0) {
    historyList.innerHTML = '<p class="setting-hint" style="margin-top: 12px;">Історія порожня. Звіти зберігаються після кожного аналізу.</p>';
  } else {
    const dayOrder = [];
    const seenDay = new Set();
    for (const item of list) {
      const dk = historyDayKey(item.timestamp);
      if (!seenDay.has(dk)) {
        seenDay.add(dk);
        dayOrder.push(dk);
      }
    }

    const byDay = new Map();
    for (const item of list) {
      const dk = historyDayKey(item.timestamp);
      if (!byDay.has(dk)) byDay.set(dk, []);
      byDay.get(dk).push(item);
    }

    let html = '';
    for (const dk of dayOrder) {
      const items = byDay.get(dk) || [];
      if (!items.length) continue;
      const heading = historyDayHeadingUk(items[0].timestamp);
      html += `<div class="history-date-group">
        <div class="history-date-heading">${escapeHtml(heading)}</div>`;

      for (const item of items) {
        const timeStr = new Date(item.timestamp).toLocaleTimeString('uk-UA', {
          hour: '2-digit',
          minute: '2-digit'
        });
        const modeLabel =
          item.mode === 'jira-auto'
            ? 'Jira авто'
            : item.mode === 'jira'
              ? 'Jira'
              : item.mode || 'bug';
        const unread = item.viewed !== true;
        const statusTitle = unread ? 'Ще не відкривали зі списку' : 'Переглянуто';
        const newBadge = unread
          ? `<span class="history-new-pill" title="${escapeHtml(statusTitle)}">Нове</span>`
          : `<span class="history-read-mark" title="${escapeHtml(statusTitle)}" aria-label="Переглянуто">✓</span>`;
        html += `
        <div class="history-item ${unread ? 'history-item--unread' : 'history-item--read'}" data-id="${item.id}" title="Відкрити звіт">
          <div class="history-item-body">
            <div class="history-item-summary">${escapeHtml(item.summary || '—')}</div>
            <div class="history-item-meta">
              <span class="history-item-time">${escapeHtml(timeStr)}</span>
              <span class="history-meta-sep">·</span>
              <span class="history-item-host">${escapeHtml(item.url || '—')}</span>
              <span class="history-meta-sep">·</span>
              <span>${escapeHtml(modeLabel)}</span>
              <span class="history-meta-sep history-meta-sep--tight">·</span>
              ${newBadge}
            </div>
          </div>
          <button type="button" class="history-item-copy" data-id="${item.id}" title="Лише копіювати текст (без позначки «переглянуто»)">⧉</button>
        </div>`;
      }
      html += '</div>';
    }

    historyList.innerHTML = html;

    historyList.querySelectorAll('.history-item').forEach((el) => {
      el.addEventListener('click', async (e) => {
        if (e.target.closest('.history-item-copy')) return;
        const id = Number(el.dataset.id);
        const item = list.find((i) => i.id === id);
        if (!item?.fullReport) return;
        await markHistoryItemViewed(id);
        openHistoryItem(item);
      });
    });

    historyList.querySelectorAll('.history-item-copy').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const item = list.find((i) => i.id === id);
        if (!item?.fullReport) return;
        try {
          await navigator.clipboard.writeText(item.fullReport);
          const o = btn.textContent;
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = o; }, 1200);
        } catch (err) {
          console.error(err);
        }
      });
    });
  }
  historySection.style.display = 'block';
}

/**
 * Utility functions
 */
function sendMessage(type, data) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, data }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** Приховати UI, недоступний без dev permissions / commands */
function applyStoreBuildUiVisibility() {
  /* Відео та browsingData quick actions прибрані з продукту */
}

console.log('[Popup] Event listeners registered');
