/*

Why do we need passhubTabScript? - because an extension can only send messages to the contentscripts, not to the web page itself

*/

// Chrome/Edge compatibility
if (typeof browser === "undefined") {
  var browser = chrome;
}

// Inline logger (content scripts can't use ES module imports)
// Uses getters + bind() to preserve clickable source links in DevTools
const LOG_ENABLED = true;  // Set to false for production
const log = (() => {
  const formatTime = () => {
    const d = new Date();
    const pad2 = n => n.toString().padStart(2, '0');
    const pad3 = n => n.toString().padStart(3, '0');
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
  };
  const noop = () => {};
  const bind = (level) => console.log.bind(console, `[${formatTime()}] [${level}] [passhubTabScript]`);
  return {
    get debug() { return LOG_ENABLED ? bind('DEBUG') : noop; },
    get info()  { return LOG_ENABLED ? bind('INFO')  : noop; },
    get warn()  { return LOG_ENABLED ? bind('WARN')  : noop; },
    get error() { return LOG_ENABLED ? bind('ERROR') : noop; },
  };
})();

// Inline correlation ID helper (can't import from common.js)
const fmtCid = (cid) => cid ? `[${cid}]` : '';

log.info('[AUTH] PasshubTabScript loaded');

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const C = fmtCid(message._cid);

    log.debug(`[MSG] ${C} ← Background:`, { type: message.id, version: message.version });

    if (message.id === 'request to send') {
        sendResponse({ farewell: "passhubTabScript goodbye" });
        if (("version" in message) && message.version > 1) {
            log.debug(`[MSG] ${C} → Dispatching 'rts' event (v2 protocol)`);
            const event = new Event("rts");
            document.dispatchEvent(event);
        } else {
            log.debug(`[MSG] ${C} → PostMessage to origin (v1 protocol)`);
            window.postMessage(message, message.origin);
        }
        return;
    }
    sendResponse({ farewell: "passhubTabScript goodbye" });
});

