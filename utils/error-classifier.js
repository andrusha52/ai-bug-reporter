// utils/error-classifier.js - Smart error classification

/**
 * Classify error by severity and type
 */
export function classifyError(error) {
  const classification = {
    severity: 'medium',
    type: 'unknown',
    isCritical: false,
    emoji: '⚠️',
    color: '#f59e0b'
  };

  // Determine error type and severity
  if (error.source === 'console') {
    classifyConsoleError(error, classification);
  } else if (error.source === 'network') {
    classifyNetworkError(error, classification);
  }

  return classification;
}

/**
 * Classify console error
 */
function classifyConsoleError(error, classification) {
  const message = error.args?.join(' ').toLowerCase() || '';
  
  // Critical frontend errors
  if (message.includes('uncaught') || 
      message.includes('unhandled') ||
      message.includes('cannot read property') ||
      message.includes('undefined is not') ||
      message.includes('null is not')) {
    classification.severity = 'critical';
    classification.type = 'frontend';
    classification.isCritical = true;
    classification.emoji = '🔴';
    classification.color = '#dc2626';
    return;
  }

  // Auth errors
  if (message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('token') ||
      message.includes('session expired')) {
    classification.severity = 'high';
    classification.type = 'auth';
    classification.emoji = '🔐';
    classification.color = '#dc2626';
    return;
  }

  // API/Backend errors
  if (message.includes('api') ||
      message.includes('endpoint') ||
      message.includes('server') ||
      message.includes('fetch failed')) {
    classification.severity = 'high';
    classification.type = 'backend';
    classification.emoji = '🔴';
    classification.color = '#dc2626';
    return;
  }

  // UI/Rendering errors
  if (message.includes('react') ||
      message.includes('component') ||
      message.includes('render') ||
      message.includes('dom')) {
    classification.severity = 'medium';
    classification.type = 'frontend';
    classification.emoji = '⚠️';
    classification.color = '#f59e0b';
    return;
  }

  // Validation errors
  if (message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required')) {
    classification.severity = 'low';
    classification.type = 'validation';
    classification.emoji = '⚠️';
    classification.color = '#f59e0b';
    return;
  }

  // Deprecation warnings
  if (message.includes('deprecated') ||
      message.includes('warning')) {
    classification.severity = 'low';
    classification.type = 'deprecated';
    classification.emoji = '💡';
    classification.color = '#6b7280';
    return;
  }

  // Default console error
  if (error.level === 'error') {
    classification.severity = 'medium';
    classification.type = 'frontend';
    classification.emoji = '⚠️';
    classification.color = '#f59e0b';
  } else if (error.level === 'warn') {
    classification.severity = 'low';
    classification.type = 'warning';
    classification.emoji = '💡';
    classification.color = '#6b7280';
  }
}

/**
 * Classify network error
 */
function classifyNetworkError(error, classification) {
  const status = error.status || 0;
  const url = error.url || '';

  // 5xx - Backend/Server errors (CRITICAL)
  if (status >= 500 && status < 600) {
    classification.severity = 'critical';
    classification.type = 'backend';
    classification.isCritical = true;
    classification.emoji = '🔴';
    classification.color = '#dc2626';
    
    // Specific 5xx errors
    if (status === 500) {
      classification.details = 'Internal Server Error';
    } else if (status === 502) {
      classification.details = 'Bad Gateway';
    } else if (status === 503) {
      classification.details = 'Service Unavailable';
    } else if (status === 504) {
      classification.details = 'Gateway Timeout';
    }
    return;
  }

  // 401, 403 - Auth errors (HIGH)
  if (status === 401 || status === 403) {
    classification.severity = 'high';
    classification.type = 'auth';
    classification.emoji = '🔐';
    classification.color = '#dc2626';
    classification.details = status === 401 ? 'Unauthorized' : 'Forbidden';
    return;
  }

  // 404 - Not Found (MEDIUM)
  if (status === 404) {
    // API 404 - more critical
    if (url.includes('/api/') || url.includes('/v1/') || url.includes('/graphql')) {
      classification.severity = 'high';
      classification.type = 'backend';
      classification.emoji = '🔴';
      classification.color = '#dc2626';
    } else {
      // Asset 404 - less critical
      classification.severity = 'medium';
      classification.type = 'frontend';
      classification.emoji = '⚠️';
      classification.color = '#f59e0b';
    }
    classification.details = 'Not Found';
    return;
  }

  // 429 - Rate Limit (MEDIUM)
  if (status === 429) {
    classification.severity = 'medium';
    classification.type = 'backend';
    classification.emoji = '⏱️';
    classification.color = '#f59e0b';
    classification.details = 'Rate Limit Exceeded';
    return;
  }

  // 400-499 - Client errors (LOW-MEDIUM)
  if (status >= 400 && status < 500) {
    classification.severity = 'medium';
    classification.type = 'frontend';
    classification.emoji = '⚠️';
    classification.color = '#f59e0b';
    classification.details = 'Client Error';
    return;
  }

  // Network failures (timeout, connection error) - CRITICAL
  if (error.failed || error.errorText) {
    classification.severity = 'critical';
    classification.isCritical = true;
    classification.emoji = '🔴';
    classification.color = '#dc2626';
    
    const errorText = (error.errorText || '').toLowerCase();
    
    if (errorText.includes('timeout')) {
      classification.type = 'network';
      classification.details = 'Request Timeout';
    } else if (errorText.includes('connection')) {
      classification.type = 'network';
      classification.details = 'Connection Failed';
    } else if (errorText.includes('cors')) {
      classification.type = 'backend';
      classification.details = 'CORS Error';
    } else {
      classification.type = 'network';
      classification.details = 'Network Error';
    }
    return;
  }
}

/**
 * Get severity label
 */
export function getSeverityLabel(severity) {
  const labels = {
    critical: '🔴 КРИТИЧНО',
    high: '🟠 ВИСОКО',
    medium: '🟡 СЕРЕДНЬО',
    low: '🟢 НИЗЬКО'
  };
  return labels[severity] || '⚪ НЕВІДОМО';
}

/**
 * Get type label
 */
export function getTypeLabel(type) {
  const labels = {
    frontend: '💻 Frontend',
    backend: '🖥️ Backend',
    network: '🌐 Network',
    auth: '🔐 Auth',
    validation: '✅ Validation',
    deprecated: '📦 Deprecated',
    warning: '⚠️ Warning',
    unknown: '❓ Unknown'
  };
  return labels[type] || '❓ Unknown';
}

/**
 * Group and analyze errors
 */
export function analyzeErrors(errors) {
  const analysis = {
    total: errors.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    byType: {
      frontend: 0,
      backend: 0,
      network: 0,
      auth: 0,
      validation: 0,
      deprecated: 0,
      warning: 0,
      unknown: 0
    },
    criticalErrors: [],
    mostCommon: null
  };

  errors.forEach(error => {
    const classification = classifyError(error);
    
    // Count by severity
    analysis[classification.severity]++;
    
    // Count by type
    if (analysis.byType[classification.type] !== undefined) {
      analysis.byType[classification.type]++;
    }
    
    // Store critical errors
    if (classification.isCritical) {
      analysis.criticalErrors.push({
        ...error,
        classification
      });
    }
  });

  // Find most common type
  const types = Object.entries(analysis.byType);
  if (types.length > 0) {
    const sorted = types.sort((a, b) => b[1] - a[1]);
    analysis.mostCommon = sorted[0][0];
  }

  return analysis;
}

console.log('[ErrorClassifier] Module loaded');
