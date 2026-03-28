// utils/openai.js - Gemini + OpenAI API (no backend)

import { getAiConfig } from './api.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Generate bug report using Gemini or OpenAI API
 */
export async function generateBugReport(userDescription, consoleLogs, networkLogs, domSnapshot, pageInfo, mode = 'bug', additionalContext = {}, settings = {}) {
  const { provider, token } = await getAiConfig();
  if (!token || !token.trim()) {
    throw new Error('AI токен не налаштовано. Додай Gemini або OpenAI ключ в Settings.');
  }

  const trimmedToken = token.trim();
  console.log('[OpenAI] Generating bug report via', provider.toUpperCase(), {
    description: userDescription,
    consoleLogs: consoleLogs?.length || 0,
    networkLogs: networkLogs?.length || 0,
    domSnapshotLength: domSnapshot?.length || 0,
    pageInfo,
    mode,
    hasAdditionalContext: Object.keys(additionalContext).length > 0
  });
  
  try {
    const prompt = buildPrompt(userDescription, consoleLogs || [], networkLogs || [], domSnapshot || '', pageInfo || {}, mode, additionalContext || {}, settings || {});
    
    const text = provider === 'openai' 
      ? await callOpenAI(trimmedToken, prompt)
      : await callGemini(trimmedToken, prompt);
    
    if (!text) {
      throw new Error('Порожня відповідь від AI');
    }
    
    console.log('[OpenAI] Bug report received from', provider);
    const bugReport = parseBugReport(text);
    return bugReport;
  } catch (error) {
    console.error('[OpenAI] Error generating bug report:', error);
    throw error;
  }
}

/**
 * Call Gemini API
 */
async function callGemini(apiKey, prompt) {
  const response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        topP: 0.95
      }
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const msg = errData.error?.message || response.statusText || 'Помилка API';
    if (response.status === 401 || response.status === 403) {
      throw new Error('Невірний Gemini токен. Перевір ключ на https://aistudio.google.com/app/apikey');
    }
    throw new Error(msg);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

/**
 * Call OpenAI API
 */
async function callOpenAI(apiKey, prompt) {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const msg = errData.error?.message || response.statusText || 'Помилка API';
    if (response.status === 401 || response.status === 403) {
      throw new Error('Невірний OpenAI токен. Перевір ключ на https://platform.openai.com/api-keys');
    }
    throw new Error(msg);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content;
}

/**
 * Get analysis instructions based on mode
 */
function getModeInstructions(mode) {
  const baseFormat = `
If Redux/Zustand state or ERROR LOCATIONS are provided, use them to identify which actions led to the bug and which file/line caused the crash.
Use these severity indicators:
- 🔴 CRITICAL - For 5xx errors, uncaught exceptions, breaking bugs
- 🟠 HIGH - For 4xx errors, API failures, major issues  
- 🟡 MEDIUM - For UI glitches, validation errors
- 🟢 LOW - For warnings, deprecations

Use these type indicators:
- 🖥️ Backend - For API/server errors
- 💻 Frontend - For React/JS/UI errors
- 🌐 Network - For connection/timeout issues
- 🔐 Auth - For auth/permission errors`;

  switch (mode) {
    case 'fix':
      return `Generate a DEVELOPER-FOCUSED FIX REPORT in this EXACT format:

## Summary
[One sentence with severity]: 🔴 CRITICAL Backend Error - API endpoint returns 503

## Root Cause
- What's broken (Frontend/Backend/Network)
- Why it's happening
- What component/service is affected

## Recommended Fix
1. **Immediate Actions** (to stop the bleeding):
   - Specific actions to take right now
   
2. **Code Changes** (what to modify):
   - Files to modify
   - Code snippets or pseudo-code
   - Configuration changes
   
3. **Testing Steps** (how to verify fix):
   - How to test the fix
   - What to check

## Prevention
- How to prevent this in the future
- Monitoring/alerts to add

## Technical Details
- Severity: [Critical/High/Medium/Low]
- Type: [Frontend/Backend/Network/Auth]
- Affected Files/Services: [specific]
- Error Stack: [key errors]

${baseFormat}`;

    case 'qa':
      return `Generate a QA TEST PLAN in this EXACT format:

## Summary
[One sentence with severity]: 🔴 CRITICAL Backend Error - API endpoint returns 503

## Test Scenarios

### Happy Path Testing
1. **Scenario**: Normal flow
   - Steps: [specific steps]
   - Expected: [what should happen]
   - Priority: High/Medium/Low

### Edge Cases
1. **Scenario**: Edge case description
   - Steps: [specific steps]
   - Expected: [what should happen]
   - Priority: High/Medium/Low

### Regression Testing
- What to retest after fix
- Related features to verify

## Test Data Requirements
- What test data is needed
- Environment setup

## Acceptance Criteria
✅ Checklist of what must work

## Technical Details
- Severity: [Critical/High/Medium/Low]
- Type: [Frontend/Backend/Network/Auth]
- Affected Features: [list]

${baseFormat}`;

    case 'quick':
      return `Generate a QUICK SUMMARY (keep it short!) in this EXACT format:

## Summary
🔴 CRITICAL Backend Error - API endpoint returns 503

## Root Cause
[2-3 sentences max about what's broken and why]

## Quick Fix
[1-2 sentences on immediate action to take]

## Technical Details
- Severity: [Critical/High/Medium/Low]
- Type: [Frontend/Backend/Network/Auth]

${baseFormat}`;

    case 'jira':
      return `Generate a bug report FOR JIRA TICKET. Use Markdown (Jira Cloud supports it).
Output format - copy-paste ready for Jira:

## Summary
[One sentence for Jira title, max 255 chars]: 🔴 CRITICAL Backend Error - API endpoint returns 503

## Description

### Root Cause
- What's broken (Frontend/Backend/Network)
- Why it's happening
- What component/service is affected

### Steps to Reproduce
1. First step
2. Second step
3. Third step

### Expected Behavior
What should happen

### Actual Behavior
What actually happens

### Technical Details
- **Severity:** [Critical/High/Medium/Low]
- **Type:** [Frontend/Backend/Network/Auth]
- **Affected Component:** [specific]
- **Console Errors:** [list]
- **Network Errors:** [list with status codes]
- **Environment:** [URL, Browser, OS if relevant]

### Screenshot
*[Attach screenshot below - available for download]*

${baseFormat}`;

    default: // 'bug'
      return `Generate a structured bug report in this EXACT format:

## Summary
[One sentence]: 🔴 CRITICAL Backend Error - API endpoint returns 503

## Root Cause
- What's broken (Frontend/Backend/Network)
- Why it's happening
- What component/service is affected

## Steps to Reproduce
1. First step
2. Second step
3. Third step

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Technical Details
- Severity: [Critical/High/Medium/Low]
- Type: [Frontend/Backend/Network/Auth]
- Affected Component: [specific]
- Console Errors: [list]
- Network Errors: [list with status codes]
- Browser: [if relevant]

${baseFormat}`;
  }
}

/**
 * Build prompt for OpenAI with error classification
 */
function buildPrompt(userDescription, consoleLogs, networkLogs, domSnapshot, pageInfo, mode = 'bug', additionalContext = {}, settings = {}) {
  // Analyze errors
  const consoleErrors = consoleLogs.filter(log => log.level === 'error' || log.level === 'warn');
  const networkErrors = networkLogs.filter(log => 
    log.type === 'Network.loadingFailed' || 
    (log.type === 'Network.responseReceived' && log.params?.response?.status >= 400)
  );
  
  // Classify errors
  const hasCriticalErrors = consoleErrors.some(e => {
    const msg = e.args?.join(' ').toLowerCase() || '';
    return msg.includes('uncaught') || msg.includes('unhandled') || msg.includes('cannot read');
  }) || networkErrors.some(e => {
    const status = e.params?.response?.status || 0;
    return status >= 500 || e.type === 'Network.loadingFailed';
  });
  
  const hasBackendErrors = networkErrors.some(e => {
    const status = e.params?.response?.status || 0;
    return status >= 400 && status < 600;
  }) || consoleErrors.some(e => {
    const msg = e.args?.join(' ').toLowerCase() || '';
    return msg.includes('api') || msg.includes('server') || msg.includes('endpoint');
  });
  
  const hasFrontendErrors = consoleErrors.some(e => {
    const msg = e.args?.join(' ').toLowerCase() || '';
    return msg.includes('react') || msg.includes('component') || msg.includes('render') || 
           msg.includes('undefined is not') || msg.includes('cannot read property');
  });
  
  // Determine error category
  let errorCategory = 'Unknown';
  let severityLevel = 'Medium';
  
  if (hasCriticalErrors) {
    severityLevel = 'CRITICAL';
  } else if (consoleErrors.length > 0 || networkErrors.length > 0) {
    severityLevel = 'High';
  }
  
  if (hasBackendErrors && hasFrontendErrors) {
    errorCategory = 'Full-Stack (Backend + Frontend)';
  } else if (hasBackendErrors) {
    errorCategory = 'Backend / API';
  } else if (hasFrontendErrors) {
    errorCategory = 'Frontend / UI';
  } else if (networkErrors.length > 0) {
    errorCategory = 'Network / Connectivity';
  }
  
  const contextInfo = `SEVERITY: ${severityLevel}
ERROR CATEGORY: ${errorCategory}

USER DESCRIPTION:
${userDescription || 'No description provided'}

PAGE INFO:
- URL: ${pageInfo.url}
- Title: ${pageInfo.title}
- Timestamp: ${new Date(pageInfo.timestamp).toLocaleString()}

CONSOLE ERRORS (last 30):
${formatConsoleLogs(consoleLogs)}

${formatStackTraces(consoleLogs)}

NETWORK REQUESTS (failed/errors):
${formatNetworkLogs(networkLogs)}

DOM CONTEXT (partial):
${domSnapshot ? domSnapshot.substring(0, 3000) : 'Not available'}`;

  // Add additional context if available
  let additionalInfo = '';
  if (Object.keys(additionalContext).length > 0) {
    additionalInfo = '\n\nADDITIONAL CONTEXT:\n';
    
    if (additionalContext.userAgent) {
      additionalInfo += `\nUser Agent: ${additionalContext.userAgent}`;
    }
    
    if (additionalContext.screenInfo) {
      const s = additionalContext.screenInfo;
      additionalInfo += `\nScreen: ${s.screenWidth}x${s.screenHeight} (${s.colorDepth}bit)`;
    }
    
    if (additionalContext.browserInfo) {
      const b = additionalContext.browserInfo;
      additionalInfo += `\nBrowser: ${b.platform}, ${b.language}, Online: ${b.onLine}`;
    }
    
    if (additionalContext.screenshot) {
      additionalInfo += `\nScreenshot: Available (${(additionalContext.screenshot.length / 1024).toFixed(0)}KB)`;
    }
    
    if (additionalContext.localStorage) {
      const keys = Object.keys(additionalContext.localStorage);
      additionalInfo += `\nLocalStorage: ${keys.length} items`;
    }
    
    if (additionalContext.cookies) {
      additionalInfo += `\nCookies: ${additionalContext.cookies.length} items`;
    }

    if (additionalContext.reduxState) {
      const r = additionalContext.reduxState;
      additionalInfo += `\n\nREDUX STATE (${r.source || 'store'}):`;
      if (r.actions?.length) {
        additionalInfo += `\nLast ${r.actions.length} actions: ${r.actions.map(a => a.type).join(', ')}`;
      }
      if (r.state) {
        const stateStr = typeof r.state === 'string' ? r.state : JSON.stringify(r.state);
        additionalInfo += `\nState: ${stateStr.slice(0, 2000)}${stateStr.length > 2000 ? '...' : ''}`;
      }
    }

    if (additionalContext.zustandState?.stores?.length) {
      additionalInfo += `\n\nZUSTAND STORES:`;
      additionalContext.zustandState.stores.forEach(s => {
        const stateStr = typeof s.state === 'string' ? s.state : JSON.stringify(s.state);
        additionalInfo += `\n${s.name}: ${stateStr.slice(0, 800)}${stateStr.length > 800 ? '...' : ''}`;
      });
    }
  }

  const instructions = getModeInstructions(mode);
  
  return `You are a senior QA engineer analyzing a bug report. Generate a professional analysis with SEVERITY and TYPE classification.

${contextInfo}${additionalInfo}

${instructions}`;
}

/**
 * Format console logs for prompt
 */
function formatConsoleLogs(logs) {
  if (!logs || logs.length === 0) return 'No console logs captured';
  
  return logs
    .filter(log => log.level === 'error' || log.level === 'warn')
    .slice(-30)
    .map(log => {
      let line = `[${log.level.toUpperCase()}] ${log.args?.join(' ') || ''}`;
      if (log.stack) line += `\n  Stack: ${log.stack.slice(0, 500)}`;
      return line;
    })
    .join('\n') || 'No errors or warnings';
}

/**
 * Extract file:line from stack traces for error location analysis
 */
function formatStackTraces(logs) {
  if (!logs || logs.length === 0) return '';
  const locations = [];
  const seen = new Set();
  logs
    .filter(log => log.stack && (log.level === 'error' || log.level === 'warn'))
    .forEach(log => {
      const stack = log.stack;
      const matches = stack.matchAll(/(?:at\s+.*?\s+)?\(?([^)\s]+):(\d+)(?::(\d+))?\)?/g);
      for (const m of matches) {
        const file = m[1].trim();
        if (file && !file.includes('node_modules') && !file.startsWith('native') && !file.startsWith('eval')) {
          const key = `${file}:${m[2]}`;
          if (!seen.has(key)) {
            seen.add(key);
            locations.push({ file: file.split('/').pop(), line: m[2], col: m[3] || '?' });
          }
        }
      }
    });
  if (locations.length === 0) return '';
  return `ERROR LOCATIONS (file:line from stack traces - where the crash occurred):
${locations.slice(0, 15).map(l => `- ${l.file}:${l.line}:${l.col}`).join('\n')}`;
}

/**
 * Format network logs for prompt
 */
function formatNetworkLogs(logs) {
  if (!logs || logs.length === 0) return 'No network logs captured';
  
  const failures = logs.filter(log => 
    log.type === 'Network.loadingFailed' || 
    (log.type === 'Network.responseReceived' && log.params?.response?.status >= 400)
  );
  
  if (failures.length === 0) return 'No failed requests';
  
  return failures
    .slice(-20)
    .map(log => {
      if (log.type === 'Network.loadingFailed') {
        return `FAILED: ${log.params.errorText}`;
      }
      if (log.type === 'Network.responseReceived') {
        const res = log.params.response;
        return `${res.status} ${res.statusText} - ${res.url}`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Parse generated text into structured format
 */
function parseBugReport(text) {
  // Remove main heading if present (# Bug Report)
  const cleanText = text.replace(/^#\s+Bug Report\s*\n/i, '');
  
  const result = {
    fullReport: cleanText,
    fullText: cleanText,
    summary: extractSection(cleanText, 'Summary'),
    rootCause: extractSection(cleanText, 'Root Cause'),
    stepsToReproduce: extractSection(cleanText, 'Steps to Reproduce'),
    expectedBehavior: extractSection(cleanText, 'Expected Behavior'),
    actualBehavior: extractSection(cleanText, 'Actual Behavior'),
    technicalDetails: extractSection(cleanText, 'Technical Details')
  };
  
  // Map sections for backend compatibility
  if (result.summary) result.sections = { summary: result.summary };
  if (result.rootCause) result.sections = { ...(result.sections || {}), root_cause: result.rootCause };
  
  return result;
}

/**
 * Extract section from markdown text (supports both ## Header and **Bold** formats)
 */
/**
 * Extract section from markdown text (supports both ## Header and **Bold** formats)
 */
function extractSection(text, sectionName) {
  // Try markdown header first (## Summary or ### Root Cause)
  let regex = new RegExp(`##+\\s+${sectionName}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  let match = text.match(regex);
  
  // If not found, try bold format (**Summary**)
  if (!match) {
    regex = new RegExp(`\\*\\*${sectionName}\\*\\*[:\\s]*([\\s\\S]*?)(?=\\n\\*\\*|\\n##|$)`, 'i');
    match = text.match(regex);
  }
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Fallback: try to find anything after the section name
  regex = new RegExp(`${sectionName}[:\\s]*\\n([\\s\\S]*?)(?=\\n##|\\n\\*\\*|$)`, 'i');
  match = text.match(regex);
  
  return match && match[1] ? match[1].trim() : '';
}

console.log('[OpenAI] Module loaded');
