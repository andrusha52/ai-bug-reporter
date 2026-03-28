// content_scripts/console-interceptor.js - Simple console log capture

(function() {
  'use strict';
  
  // Prevent double injection
  if (window.__consoleInterceptorInjected) {
    return;
  }
  window.__consoleInterceptorInjected = true;
  
  
  // Store original console methods
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  };
  
  // Intercept console methods
  ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
    console[level] = function(...args) {
      // Call original method first
      originalConsole[level].apply(console, args);
      
      // Send to background
      try {
        const logPayload = {
          level: level,
          args: args.map(arg => {
            if (arg instanceof Error) {
              return arg.message || String(arg);
            }
            if (typeof arg === 'object' && arg !== null) {
              try {
                return JSON.stringify(arg);
              } catch (e) {
                return String(arg);
              }
            }
            return String(arg);
          }),
          url: window.location.href,
          timestamp: Date.now()
        };
        const err = args.find(a => a instanceof Error);
        if (err && err.stack) {
          logPayload.stack = err.stack;
        }
        chrome.runtime.sendMessage({ type: 'CONSOLE_LOG', log: logPayload });
      } catch (e) {
        // Silently fail if extension context is gone
      }
    };
  });
})();
