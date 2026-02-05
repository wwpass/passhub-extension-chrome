// Chrome/Edge compatibility - they use 'chrome' instead of 'browser'
if (typeof browser === "undefined") {
  globalThis.browser = chrome;
}

export const consoleLog = console.log;
// export const consoleLog = () => { };

// Browser API compatibility shim for Safari/Chrome/Edge

// ============================================================
// Structured Logger
// ============================================================

export const LOG_LEVEL = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// Set to LOG_LEVEL.NONE for production
let currentLogLevel = LOG_LEVEL.DEBUG;

export function setLogLevel(level) {
  currentLogLevel = level;
}

function formatTime() {
  const d = new Date();
  const pad2 = n => n.toString().padStart(2, '0');
  const pad3 = n => n.toString().padStart(3, '0');
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

// Uses getters + bind() to preserve clickable source links in DevTools
export function createLogger(context) {
  const noop = () => {};
  const bind = (level, levelName) =>
    level >= currentLogLevel
      ? console.log.bind(console, `[${formatTime()}] [${levelName}] [${context}]`)
      : noop;

  return {
    get debug() { return bind(LOG_LEVEL.DEBUG, 'DEBUG'); },
    get info()  { return bind(LOG_LEVEL.INFO, 'INFO'); },
    get warn()  { return bind(LOG_LEVEL.WARN, 'WARN'); },
    get error() { return bind(LOG_LEVEL.ERROR, 'ERROR'); },
  };
}

// Log categories for filtering (not used)
export const LOG_CAT = {
  MSG: 'MSG',        // Messaging between components
  INJECT: 'INJECT',  // Script injection
  FILL: 'FILL',      // Form filling
  PAYMENT: 'PAYMENT',// Payment flow
  TAB: 'TAB',        // Tab operations
  AUTH: 'AUTH',      // Authentication/connection
};

// Extract hostname safely for logging (privacy + readability)
export function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url || 'unknown';
  }
}

// Generate short correlation ID for request tracing
export function generateCid() {
  return Math.random().toString(36).substring(2, 6); // e.g. "a7f3"
}

// Format correlation ID for logging (handles undefined/null)
export function fmtCid(cid) {
  return cid ? `[${cid}]` : '';
}

// Internal logger for common.js utilities
const log = createLogger('common');

// ============================================================

export function logtime() {
  const today = new Date();
  return today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds() + " ";
}


const pending = {
  state: 'pending',
};

function getPromiseState(promise) {
  // We put `pending` promise after the promise to test,
  // which forces .race to test `promise` first
  return Promise.race([promise, pending]).then(
    (value) => {
    if (value === pending) {
        return value;
      }
      return {
        state: 'resolved',
        value
      };
    },
    (reason) => ({ state: 'rejected', reason })
  );
}

export function ensureReturnsResolved(returns) {
    return new Promise(function (resolve, reject) {
        (function waitForState(iteration=0){
            log.debug('[INJECT] Waiting for injection:', { attempt: iteration, maxAttempts: 10 });
            getPromiseState(returns).then(
              value => {
                  if (value.state == "resolved") {
                      log.debug('[INJECT] ✓ Injection resolved');
                      return resolve();
                  }
                iteration += 1;
                  if (iteration > 10) {
                      log.warn('[INJECT] ✗ Injection timeout after 10 attempts');
                      return reject();
                  }
                let ms = 300;
                setTimeout(waitForState, ms, iteration);
            })
    })();
});
}

export function ensureTabIsLoaded() {
    return new Promise(function (resolve, reject) {
        (function waitForTab(iteration=0){
            browser.tabs.query({ currentWindow: true, active: true }).then(
                current_tabs => {
                    let current_tab = current_tabs[0];
                    log.debug('[TAB] Waiting for tab load:', { attempt: iteration, status: current_tab.status });
                    iteration += 1;
                    if (current_tab.status == "complete") {
                        log.debug('[TAB] ✓ Tab loaded');
                        return resolve();
                    }
                    if (iteration > 20) {
                        log.warn('[TAB] ✗ Tab load timeout after 20 attempts');
                        return reject();
                    }
                    let ms = 300;
                    setTimeout(waitForTab, ms, iteration);
                }
            )
        })();
    });
}
