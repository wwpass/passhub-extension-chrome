'use strict';

import { ensureReturnsResolved, ensureTabIsLoaded, createLogger, safeHostname, generateCid, fmtCid } from './common.js';

const log = createLogger('background');

let farewellCount = 0;

let deferredMsg = null;

log.info('[AUTH] Service worker started');

//messages from externally connectables (= passhub tab)
browser.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {

  // Use existing _cid from request or generate new one
  const cid = request._cid || generateCid();
  const C = fmtCid(cid);  // "[a7f3]" or ""

  log.debug(`[MSG] ${C} ← PassHub: ${request.id} from ${safeHostname(sender.url)}`);

  if (request.id == 'clear to send') {
    if (!deferredMsg) {
      log.warn(`[MSG] ${C} ⚠ Deferred message pending, requesting retry`);
      sendResponse({ status: 'retry', reason: 'deferred_message_pending' });
      return;
    }
    const msg = deferredMsg;
    deferredMsg = null;  // Clear after sending to prevent stale data
    log.debug(`[MSG] ${fmtCid(msg._cid)} → Sending deferred: ${msg.id}`);
    sendResponse(msg);
    farewellCount++;
    return;
  }

  if (request.id == 'loginRequest') {
    // sent by passhub tab when user clicks on the URL link of password record, forward to the target URL
    sendResponse({ id: "Ok" });  // Critical for Safari - must respond before async operations
    browser.tabs.create({ url: request.url })
      .then(tab => {
        log.debug(`[TAB] ${C} Created tab ${tab.id} for ${safeHostname(request.url)}`);

        // Wait for tab to fully load before injecting script (important for Safari)
        ensureTabIsLoaded(tab)
          .then(() => {
          browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['contentScript.js']
          })
            .then((injectionResult) => {
              log.debug(`[INJECT] ${C} ✓ ContentScript injected into tab ${tab.id}`);
              // Add _cid to request before sending to contentScript
              browser.tabs.sendMessage(tab.id, { ...request, _cid: cid })
                .then(response => {
                  log.debug(`[FILL] ${C} ← ContentScript confirmed`);
                })
                .catch(err => {
                  log.error(`[FILL] ${C} ✗ Failed to send to tab ${tab.id}: ${err.message}`);
                })
            });
        }).catch(err => {
          log.error(`[TAB] ${C} ✗ Load timeout for tab ${tab.id}`);
        });
      })
      .catch(err => {
        log.error(`[TAB] ${C} ✗ Create failed: ${err.message}`);
      })

  } else if (request.id == 'remember me') {
    // sent by passhub tab just after signin, the passhub tab is saved for future communications

    browser.storage.session.set({ passhub: { peer: sender, version: ("version" in request) ? request.version : 1 } });
    sendResponse({ id: "63 Ok" });

    let returns = browser.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['passhubTabScript.js']
    });

    // Wait for script injection to complete (important for Safari)
    ensureReturnsResolved(returns).then(() => {
      log.debug('[INJECT] ✓ PasshubTabScript ready');
    }).catch(err => {
      log.error(`[INJECT] ✗ PasshubTabScript timeout for tab ${sender.tab.id}`);
    })
  } else if ((request.id == 'advise') || (request.id == 'payment')) {
    // sent by passhub tab as a response containing data, retransmitted to popup

    const originUrl = new URL(sender.origin);

    request.passhubInstance = originUrl.hostname;
    // Preserve _cid when relaying to popup
    browser.runtime.sendMessage({ ...request, _cid: cid })
      .catch(err => {
        log.error(`[MSG] ${C} ✗ Relay to popup failed: ${err.message}`);
      })
    sendResponse({ farewell: `goodbye ${request.id} ${farewellCount}` });
    farewellCount++;
  } else {
    sendResponse({ farewell: `goodbye ${request.id} ${farewellCount}` });
    farewellCount++;
  }
});


function notConnected() {
  log.info('[AUTH] PassHub not connected');
  browser.runtime.sendMessage({ id: 'not connected' })
    .then(response => log.debug('[MSG] → Notified popup: not connected'))
    .catch(err => {
      log.error(`[MSG] ✗ Failed to notify popup: ${err.message}`);
    })
}

browser.runtime.onMessage.addListener((popupMessage, sender, sendResponse) => {

  // Generate _cid for popup-initiated requests
  const cid = popupMessage._cid || generateCid();
  const C = fmtCid(cid);

  log.debug(`[MSG] ${C} ← Popup: ${popupMessage.id}`);

  sendResponse({ status: 'wait' });

  browser.storage.session.get("passhub")
    .then(passhubWindow => {
      log.debug(`[AUTH] ${C} Session storage check:`, { connected: !!passhubWindow.passhub });
      if (!passhubWindow.passhub) {
        notConnected();
      } else {
        browser.tabs.sendMessage(passhubWindow.passhub.peer.tab.id, {
          id: "request to send",
          origin: passhubWindow.passhub.origin,
          version: ("version" in passhubWindow.passhub) ? passhubWindow.passhub.version : 1,
          _cid: cid  // Pass _cid to passhubTabScript
        })
          .then(response => {
            log.debug(`[MSG] ${C} ← PasshubTabScript: ${response.farewell}`);
            if (response.farewell.includes('passhubTabScript')) {
              // Store message with _cid for later retrieval
              deferredMsg = { ...popupMessage, _cid: cid };
              log.debug(`[MSG] ${C} Deferred message set: ${popupMessage.id}`);
            } else {
              notConnected();
            }
          })
          .catch(err => {
            log.error(`[MSG] ${C} ✗ Request to send failed: ${err.message}`);
            notConnected();
          })
      }
    })
})

function injectionOnInstall() {
  const event = new Event("passhubExtInstalled");
  document.dispatchEvent(event);
  console.log("extension installed");
}

browser.runtime.onInstalled.addListener(() => {
  log.info('[AUTH] Extension installed/updated');
  const manifest = browser.runtime.getManifest();
  const urlList = manifest.externally_connectable.matches;

  browser.tabs.query({ url: urlList }, function (passHubTabs) {
    if (passHubTabs && passHubTabs.length) {
      const tabId = passHubTabs[0].id;

      browser.scripting.executeScript({
        target: { tabId: tabId },
        func: injectionOnInstall,
      })
        .catch(err => {
          log.error(`[INJECT] ✗ Install script failed for tab ${tabId}: ${err.message}`);
        })
    }
  });
})
