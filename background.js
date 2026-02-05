'use strict';

import { ensureReturnsResolved, ensureTabIsLoaded } from './common.js';
// const consoleLog = console.log;
const consoleLog = () => { };

let farewellCount = 0;

let deferredMsg = null;

function logtime() {
  const today = new Date();
  return today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds() + " ";
}

consoleLog(logtime() + 'passhub extension background start');

//messages from externally connectables (= passhub tab)
browser.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  consoleLog(`external message from passhub window/ request from ${sender.url}`);
  consoleLog(request);

  if (request.id == 'clear to send') {
    if (!deferredMsg) {
      consoleLog('error deferredMsg absent');  // happens from time to time... 
    }
    sendResponse(deferredMsg);
    farewellCount++;
    return;
  }

  if (request.id == 'loginRequest') {
    // sent by passhub tab when user clicks on the URL link of password record, forward to the target URL
    sendResponse({ id: "Ok" });  // Critical for Safari - must respond before async operations
    browser.tabs.create({ url: request.url })
      .then(tab => {
        consoleLog('tab created');
        consoleLog(tab);

        // Wait for tab to fully load before injecting script (important for Safari)
        ensureTabIsLoaded(tab)
          .then(() => {
          browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['contentScript.js']
          })
            .then((injectionResult) => {
              consoleLog('inJectionResult');
              consoleLog(injectionResult);
              // Add _cid to request before sending to contentScript
              browser.tabs.sendMessage(tab.id, { ...request, _cid: cid })
                .then(response => {
                  consoleLog('bg got response from content script');
                  consoleLog(response);
                })
                .catch(err => {
                  consoleLog('catch 48');
                  consoleLog(err);
                })
            });
        }).catch(err => {
          log.error(`[TAB] ${C} ✗ Load timeout for tab ${tab.id}`);
        });
      })
      .catch(err => {
        consoleLog('catch 42');
        consoleLog(err);
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
    }).catch(err => {
    })
  } else if ((request.id == 'advise') || (request.id == 'payment')) {
    // sent by passhub tab as a response containing data, retransmitted to popup

    const originUrl = new URL(sender.origin);

    request.passhubInstance = originUrl.hostname;
    // Preserve _cid when relaying to popup
    browser.runtime.sendMessage({ ...request, _cid: cid })
      .catch(err => {
        consoleLog('catch 81');
        consoleLog(err);
      })
    sendResponse({ farewell: `goodbye ${request.id} ${farewellCount}` });
    farewellCount++;
  } else {
    sendResponse({ farewell: `goodbye ${request.id} ${farewellCount}` });
    farewellCount++;
  }
});


function notConnected() {
  browser.runtime.sendMessage({ id: 'not connected' })
    .then(response => consoleLog(response))
    .catch(err => {
      consoleLog('catch 98');
      consoleLog(err);
    })
}

browser.runtime.onMessage.addListener((popupMessage, sender, sendResponse) => {
  consoleLog("bg got (popup) message");
  consoleLog(popupMessage);

  sendResponse({ status: 'wait' });

  browser.storage.session.get("passhub")
    .then(passhubWindow => {
      consoleLog("session storage returns");
      consoleLog(passhubWindow);
      if (!passhubWindow.passhub) {
        notConnected();
      } else {
        browser.tabs.sendMessage(passhubWindow.passhub.peer.tab.id, {
          id: "request to send",
          origin: passhubWindow.passhub.origin,
          version: ("version" in passhubWindow.passhub) ? passhubWindow.passhub.version : 1
        })
          .then(response => {
            consoleLog('response to rts');
            consoleLog(response);
            if (response.farewell.includes('passhubTabScript')) {
              deferredMsg = popupMessage;
              consoleLog('deferredMsg set to');
              consoleLog(popupMessage);
            } else {
              notConnected();
            }
          })
          .catch(err => {
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
          consoleLog('catch 107');
          consoleLog(err)
        })
    }
  });
})
