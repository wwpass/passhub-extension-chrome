'use strict';

// const consoleLog = console.log;
const consoleLog = () => { };

let connected = false;
let passhubPort = null;
let passhubInstance = '';

let farewellCount = 0;


let deferredMsg = null;


function logtime() {
  const today = new Date();
  return today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds() + " ";
}

consoleLog(logtime() + 'passhub extension background start');

//messages from externally connectables (= passhub tab) 
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  consoleLog(`external message from passhub window/ request from ${sender.url}`);
  consoleLog(request);

  if (request.id == 'clear to send') {
    sendResponse(deferredMsg);
    farewellCount++;
    return;
  }

  if (request.id == 'loginRequest') {
    // sent by passhub tab when user clicks on the URL link of password record, forward to the target URL
    chrome.tabs.create({ url: request.url })
      .then(tab => {
        consoleLog('tab created');
        consoleLog(tab);

        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['contentScript.js']
        })
          .then((injectionResult) => {
            consoleLog('inJectionResult');
            consoleLog(injectionResult);
            chrome.tabs.sendMessage(tab.id, request)
              .then(response => {
                consoleLog('bg got response from content script');
                consoleLog(response);
              })
          });
      })
      .catch(err => {
        consoleLog('catch 42');
        consoleLog(err);
      })

  } else if (request.id == 'remember me') {
    // sent by passhub tab just after signin, the passhub tab is saved for future communications
    chrome.storage.session.set({ passhub: sender });

    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['passhubTabScript.js']
    })
      .then((injectionResult) => {
        consoleLog('passhubTabScript InjectionResult');
        consoleLog(injectionResult);
        sendResponse({ id: "Ok" });
      })
  } else if ((request.id == 'advise') || (request.id == 'payment')) {
    // sent by passhub tab as a response containing data, retransmitted to popup

    const originUrl = new URL(sender.origin);

    request.passhubInstance = originUrl.hostname;
    chrome.runtime.sendMessage(request);
    sendResponse({ farewell: `goodbye ${request.id} ${farewellCount}` });
    farewellCount++;

  } else {
    sendResponse({ farewell: `goodbye ${request.id} ${farewellCount}` });
    farewellCount++;
  }
});

// permanent external connection created by passhub tab, identified by port (passhubPort), backward compatibility 

chrome.runtime.onConnectExternal.addListener((port) => {
  passhubPort = port;
  connected = true;
  consoleLog(`connected: ${passhubPort.sender.origin}`);
  const originUrl = new URL(passhubPort.sender.origin);

  passhubInstance = originUrl.hostname;

  consoleLog(passhubPort);

  passhubPort.onDisconnect.addListener((prt) => {
    consoleLog(logtime());
    consoleLog(`disconnected ${prt.sender.origin}`);
    passhubInstance = '';
    connected = false;
  });
});


// messages sent by popup, retransmitted to passhub window via permanent external connection (payment page/not a payment page)

function fallBackToConnection(message) {
  try {
    if (!connected) {
      chrome.runtime.sendMessage({ id: 'not connected' })
        .then(response => consoleLog(response))
    } else {
      // sendResponseFunction({ id: 'wait' });
      passhubPort.postMessage(message);
    }
  }
  catch (err) {
    consoleLog('catch 73');
    consoleLog(err);
    consoleLog('passhubPort');
    consoleLog(passhubPort);
  }
}

chrome.runtime.onMessage.addListener((popupMessage, sender, sendResponse) => {
  consoleLog("bg got (popup) message");
  consoleLog(popupMessage);

  sendResponse({ status: 'wait' });

  chrome.storage.session.get("passhub")
    .then(passhubWindow => {
      consoleLog("session storage returns");
      consoleLog(passhubWindow);
      if (!passhubWindow.passhub) {
        fallBackToConnection(popupMessage);
      } else {
        chrome.tabs.sendMessage(passhubWindow.passhub.tab.id, { id: "request to send", origin: passhubWindow.passhub.origin })
          .then(response => {
            consoleLog('response to rts');
            consoleLog(response);
            if (response.farewell.includes('passhubTabScript')) {
              deferredMsg = popupMessage;
            } else {
              fallBackToConnection(popupMessage);
            }
          })
          .catch(err => {
            fallBackToConnection(popupMessage);
          })
      }
    })
})

function injectionOnInstall() {
  const event = new Event("passhubExtInstalled");
  document.dispatchEvent(event);
  consoleLog("extension installed");
}

chrome.runtime.onInstalled.addListener(() => {
  const manifest = chrome.runtime.getManifest();
  const urlList = manifest.externally_connectable.matches;

  chrome.tabs.query({ url: urlList }, function (passHubTabs) {
    if (passHubTabs && passHubTabs.length) {
      const tabId = passHubTabs[0].id;

      chrome.scripting.executeScript({
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
