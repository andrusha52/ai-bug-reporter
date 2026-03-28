// utils/advancedCollector.js - Advanced context collection (Redux, Performance, User Journey, etc.)

/**
 * Capture Redux state + action history (like Redux DevTools)
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object>} - Redux state and action history
 */
export async function captureReduxState(tabId) {
  try {
    console.log('[AdvancedCollector] Capturing Redux state and actions...');
    
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          const out = { source: null, state: null, actions: [], error: null };
          const MAX_ACTIONS = 50;
          const MAX_STATE_SIZE = 15000;

          // Get action history from our logger (if initReduxActionTracking ran)
          if (window.__bugReporterReduxActions?.length) {
            out.actions = window.__bugReporterReduxActions.slice(-MAX_ACTIONS);
          }

          // Try Redux DevTools Extension
          if (window.__REDUX_DEVTOOLS_EXTENSION__) {
            try {
              const state = window.__REDUX_DEVTOOLS_EXTENSION__.getState?.();
              if (state) {
                out.source = 'Redux DevTools';
                const str = JSON.stringify(state);
                out.state = str.length > MAX_STATE_SIZE ? str.slice(0, MAX_STATE_SIZE) + '...[truncated]' : state;
                return out;
              }
            } catch (_) {}
          }

          // Try to find Redux store in window
          let store = window.store || window.__REDUX_STORE__ || window.__store__;
          if (!store && window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers) {
            const renderers = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers;
            for (const r of Object.values(renderers)) {
              if (r?.getCurrentFiber) {
                let fiber = r.getCurrentFiber?.();
                while (fiber) {
                  if (fiber.memoizedState?.store) {
                    store = fiber.memoizedState.store;
                    break;
                  }
                  fiber = fiber.return;
                }
                if (store) break;
              }
            }
          }
          if (store?.getState) {
            out.source = out.source || 'Redux store';
            try {
              const state = store.getState();
              const str = JSON.stringify(state);
              out.state = str.length > MAX_STATE_SIZE ? str.slice(0, MAX_STATE_SIZE) + '...[truncated]' : state;
            } catch (e) {
              out.state = '[Unable to serialize]';
            }
            return out;
          }

          // Try Vuex
          if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.store) {
            out.source = 'Vuex';
            out.state = window.__VUE_DEVTOOLS_GLOBAL_HOOK__.store.state;
            return out;
          }

          // Try MobX
          if (window.__mobxInstanceCount) {
            return { source: 'MobX', detected: true };
          }

          return out.source || out.actions?.length ? out : null;
        } catch (e) {
          return { error: e.message };
        }
      }
    });

    const result = results[0]?.result;
    console.log('[AdvancedCollector] Redux captured:', !!result, 'actions:', result?.actions?.length || 0);
    return result;
  } catch (error) {
    console.error('[AdvancedCollector] Redux capture error:', error);
    return null;
  }
}

/**
 * Capture Zustand store state
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object>} - Zustand state(s)
 */
export async function captureZustandState(tabId) {
  try {
    console.log('[AdvancedCollector] Capturing Zustand state...');

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          const stores = [];
          const MAX_SIZE = 10000;

          // Zustand DevTools stores refs
          if (window.__ZUSTAND_DEVTOOLS__) {
            const devtools = window.__ZUSTAND_DEVTOOLS__;
            if (Array.isArray(devtools)) {
              devtools.forEach((s, i) => {
                try {
                  if (s?.getState) {
                    const state = s.getState();
                    const str = JSON.stringify(state);
                    stores.push({ name: `store_${i}`, state: str.length > MAX_SIZE ? str.slice(0, MAX_SIZE) + '...' : state });
                  }
                } catch (_) {}
              });
            }
          }

          // Common patterns: window.useXStore?.getState()
          const storeNames = ['useStore', 'useAppStore', 'useAuthStore', 'useUserStore', 'store'];
          storeNames.forEach(name => {
            try {
              const fn = window[name];
              if (fn?.getState) {
                const state = fn.getState();
                const str = JSON.stringify(state);
                stores.push({ name, state: str.length > MAX_SIZE ? str.slice(0, MAX_SIZE) + '...' : state });
              }
            } catch (_) {}
          });

          return stores.length ? { source: 'Zustand', stores } : null;
        } catch (e) {
          return { error: e.message };
        }
      }
    });

    const result = results[0]?.result;
    console.log('[AdvancedCollector] Zustand captured:', !!result, 'stores:', result?.stores?.length || 0);
    return result;
  } catch (error) {
    console.error('[AdvancedCollector] Zustand capture error:', error);
    return null;
  }
}

/**
 * Initialize Redux action tracking (call when monitoring starts)
 * Patches store.dispatch to log actions for later capture
 */
export async function initReduxActionTracking(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        if (window.__bugReporterReduxPatched) return;
        window.__bugReporterReduxActions = [];
        window.__bugReporterReduxPatched = true;
        const MAX = 80;

        function tryPatch(store) {
          if (!store?.dispatch || store.__bugReporterPatched) return false;
          const orig = store.dispatch;
          store.dispatch = function(action) {
            try {
              window.__bugReporterReduxActions.push({
                type: action?.type || 'UNKNOWN',
                payload: action?.payload !== undefined ? (typeof action.payload === 'object' ? '[object]' : action.payload) : undefined,
                ts: Date.now()
              });
              if (window.__bugReporterReduxActions.length > MAX) {
                window.__bugReporterReduxActions.shift();
              }
            } catch (_) {}
            return orig.apply(this, arguments);
          };
          store.__bugReporterPatched = true;
          return true;
        }

        function findAndPatch() {
          if (tryPatch(window.store) || tryPatch(window.__REDUX_STORE__) || tryPatch(window.__store__)) return;
          if (window.__REDUX_DEVTOOLS_EXTENSION__?.connect) {
            try {
              const devTools = window.__REDUX_DEVTOOLS_EXTENSION__.connect();
              if (devTools._store) tryPatch(devTools._store);
            } catch (_) {}
          }
        }

        findAndPatch();
        let attempts = 0;
        const id = setInterval(() => {
          findAndPatch();
          if (++attempts > 25) clearInterval(id);
        }, 200);
      }
    });
    console.log('[AdvancedCollector] Redux action tracking initialized');
  } catch (error) {
    console.warn('[AdvancedCollector] Redux init error:', error.message);
  }
}

/**
 * Capture performance metrics
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object>} - Performance data
 */
export async function capturePerformanceMetrics(tabId) {
  try {
    console.log('[AdvancedCollector] Capturing performance metrics...');
    
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const perfData = {};
          
          // Navigation Timing
          const nav = performance.getEntriesByType('navigation')[0];
          if (nav) {
            perfData.navigation = {
              loadTime: Math.round(nav.loadEventEnd - nav.fetchStart),
              domReady: Math.round(nav.domContentLoadedEventEnd - nav.fetchStart),
              ttfb: Math.round(nav.responseStart - nav.requestStart),
              dnsLookup: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
              tcpConnection: Math.round(nav.connectEnd - nav.connectStart),
              tlsTime: nav.secureConnectionStart > 0 
                ? Math.round(nav.connectEnd - nav.secureConnectionStart) 
                : 0,
              requestTime: Math.round(nav.responseEnd - nav.requestStart),
              responseTime: Math.round(nav.responseEnd - nav.responseStart),
              domProcessing: Math.round(nav.domComplete - nav.domInteractive)
            };
          }
          
          // Core Web Vitals
          const paint = performance.getEntriesByType('paint');
          perfData.paint = {};
          paint.forEach(entry => {
            perfData.paint[entry.name] = Math.round(entry.startTime);
          });
          
          // LCP (Largest Contentful Paint)
          const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
          if (lcpEntries.length > 0) {
            perfData.lcp = Math.round(lcpEntries[lcpEntries.length - 1].startTime);
          }
          
          // FID (First Input Delay) - if available
          const fidEntries = performance.getEntriesByType('first-input');
          if (fidEntries.length > 0) {
            perfData.fid = Math.round(fidEntries[0].processingStart - fidEntries[0].startTime);
          }
          
          // CLS (Cumulative Layout Shift) - approximate
          const layoutShiftEntries = performance.getEntriesByType('layout-shift');
          if (layoutShiftEntries.length > 0) {
            perfData.cls = layoutShiftEntries
              .filter(entry => !entry.hadRecentInput)
              .reduce((sum, entry) => sum + entry.value, 0)
              .toFixed(3);
          }
          
          // Memory (if available)
          if (performance.memory) {
            perfData.memory = {
              usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
              totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB',
              jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + 'MB'
            };
          }
          
          // Resource count
          const resources = performance.getEntriesByType('resource');
          perfData.resources = {
            total: resources.length,
            scripts: resources.filter(r => r.initiatorType === 'script').length,
            css: resources.filter(r => r.initiatorType === 'css' || r.initiatorType === 'link').length,
            images: resources.filter(r => r.initiatorType === 'img').length,
            xhr: resources.filter(r => r.initiatorType === 'xmlhttprequest' || r.initiatorType === 'fetch').length
          };
          
          return perfData;
        } catch (e) {
          return { error: e.message };
        }
      }
    });
    
    const result = results[0]?.result;
    console.log('[AdvancedCollector] Performance metrics captured:', result);
    
    return result;
  } catch (error) {
    console.error('[AdvancedCollector] Performance capture error:', error);
    return null;
  }
}

/**
 * Capture user journey (click history)
 * @param {number} tabId - Tab ID
 * @returns {Promise<Array>} - Click history
 */
export async function captureUserJourney(tabId) {
  try {
    console.log('[AdvancedCollector] Capturing user journey...');
    
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          // Get click history if tracking is enabled
          return window.__bugReporterClickHistory || [];
        } catch (e) {
          return [];
        }
      }
    });
    
    const result = results[0]?.result || [];
    console.log('[AdvancedCollector] User journey captured:', result.length, 'events');
    
    return result;
  } catch (error) {
    console.error('[AdvancedCollector] User journey capture error:', error);
    return [];
  }
}

/**
 * Initialize user journey tracking in page
 * @param {number} tabId - Tab ID
 */
export async function initUserJourneyTracking(tabId) {
  try {
    console.log('[AdvancedCollector] Initializing user journey tracking...');
    
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.__bugReporterClickHistory) return; // Already initialized
        
        window.__bugReporterClickHistory = [];
        const maxHistory = 20;
        
        // Helper to get CSS selector
        function getSelector(el) {
          if (el.id) return `#${el.id}`;
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\s+/).slice(0, 2).join('.');
            if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
          }
          return el.tagName.toLowerCase();
        }
        
        // Track clicks
        document.addEventListener('click', (e) => {
          try {
            window.__bugReporterClickHistory.push({
              type: 'click',
              selector: getSelector(e.target),
              text: e.target.textContent?.trim().slice(0, 50) || '',
              tagName: e.target.tagName,
              timestamp: Date.now(),
              x: e.clientX,
              y: e.clientY
            });
            
            if (window.__bugReporterClickHistory.length > maxHistory) {
              window.__bugReporterClickHistory.shift();
            }
          } catch (err) {
            console.error('Click tracking error:', err);
          }
        }, true);
        
        // Track form submissions
        document.addEventListener('submit', (e) => {
          try {
            window.__bugReporterClickHistory.push({
              type: 'submit',
              selector: getSelector(e.target),
              timestamp: Date.now()
            });
          } catch (err) {
            console.error('Submit tracking error:', err);
          }
        }, true);
        
        console.log('[BugReporter] User journey tracking initialized');
      }
    });
    
    console.log('[AdvancedCollector] User journey tracking initialized');
  } catch (error) {
    console.error('[AdvancedCollector] Init tracking error:', error);
  }
}

/**
 * Capture session storage
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object>} - Session storage data
 */
export async function captureSessionStorage(tabId) {
  try {
    console.log('[AdvancedCollector] Capturing sessionStorage...');
    
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const data = {};
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            data[key] = sessionStorage.getItem(key);
          }
          return data;
        } catch (e) {
          return { error: e.message };
        }
      }
    });
    
    const result = results[0]?.result;
    console.log('[AdvancedCollector] SessionStorage captured:', Object.keys(result || {}).length, 'items');
    
    return result;
  } catch (error) {
    console.error('[AdvancedCollector] SessionStorage capture error:', error);
    return null;
  }
}

/**
 * Capture environment info
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object>} - Environment data
 */
export async function captureEnvironmentInfo(tabId) {
  try {
    console.log('[AdvancedCollector] Capturing environment info...');
    
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const env = {};
          
          // Try to detect environment from common patterns
          const hostname = window.location.hostname;
          if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
            env.environment = 'local';
          } else if (hostname.includes('dev') || hostname.includes('development')) {
            env.environment = 'development';
          } else if (hostname.includes('staging') || hostname.includes('stage') || hostname.includes('qa')) {
            env.environment = 'staging';
          } else {
            env.environment = 'production';
          }
          
          // Try to find build/version info
          env.buildInfo = {
            version: document.querySelector('meta[name="version"]')?.content || 
                    window.__APP_VERSION__ || 
                    window.APP_VERSION ||
                    null,
            buildDate: document.querySelector('meta[name="build-date"]')?.content || null,
            gitCommit: window.__GIT_COMMIT__ || window.GIT_COMMIT || null
          };
          
          // Feature flags (if available)
          if (window.featureFlags || window.__FEATURE_FLAGS__) {
            env.featureFlags = window.featureFlags || window.__FEATURE_FLAGS__;
          }
          
          // API endpoints
          env.apiEndpoints = {
            baseURL: window.__API_BASE_URL__ || window.API_BASE_URL || null,
            graphQL: window.__GRAPHQL_ENDPOINT__ || null
          };
          
          return env;
        } catch (e) {
          return { error: e.message };
        }
      }
    });
    
    const result = results[0]?.result;
    console.log('[AdvancedCollector] Environment info captured:', result);
    
    return result;
  } catch (error) {
    console.error('[AdvancedCollector] Environment capture error:', error);
    return null;
  }
}

/**
 * Capture network timing for specific request
 * @param {number} tabId - Tab ID
 * @param {string} url - Request URL
 * @returns {Promise<Object>} - Network timing
 */
export async function captureNetworkTiming(tabId, url) {
  try {
    console.log('[AdvancedCollector] Capturing network timing...');
    
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [url],
      func: (targetUrl) => {
        try {
          const resources = performance.getEntriesByType('resource');
          const resource = resources.find(r => r.name === targetUrl);
          
          if (!resource) return null;
          
          return {
            url: resource.name,
            duration: Math.round(resource.duration),
            dnsTime: Math.round(resource.domainLookupEnd - resource.domainLookupStart),
            tcpTime: Math.round(resource.connectEnd - resource.connectStart),
            sslTime: resource.secureConnectionStart > 0 
              ? Math.round(resource.connectEnd - resource.secureConnectionStart)
              : 0,
            waitingTime: Math.round(resource.responseStart - resource.requestStart),
            downloadTime: Math.round(resource.responseEnd - resource.responseStart),
            size: resource.transferSize,
            type: resource.initiatorType
          };
        } catch (e) {
          return { error: e.message };
        }
      }
    });
    
    return results[0]?.result;
  } catch (error) {
    console.error('[AdvancedCollector] Network timing error:', error);
    return null;
  }
}

console.log('[AdvancedCollector] Module loaded');
