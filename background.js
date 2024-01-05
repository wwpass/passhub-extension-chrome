'use strict';

const consoleLog = console.log;
// const consoleLog = () => {};

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

//messages from externally connectables (= passhub window) 
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  consoleLog(`external message from passhub window/ request from ${sender.url}`);
  consoleLog(request);

  if (request.id == 'clear to send') {
    sendResponse(deferredMsg);
    farewellCount++;
    return;
  }

  if (request.id == 'loginRequest') {
    // sent by passhub window when user clicks on the URL link of password record, forward to the target URL
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
    // sent by passhub window just after signin, the passhub window is saved for future communications
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
    // sent by passhub window as a response containing data , retransmitted to popup
    request.passhubInstance = passhubInstance;
    chrome.runtime.sendMessage(request);
    sendResponse({ farewell: `goodbye ${request.id} ${farewellCount}` });
    farewellCount++;

  } else {
    sendResponse({ farewell: `goodbye ${request.id} ${farewellCount}` });
    farewellCount++;
  }
});

// permanent external connection created by passhub window, identified by port (passhubPort)

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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  consoleLog("bg got message");
  consoleLog(message);


  chrome.storage.session.get("passhub")
    .then(passhubWindow => {
      console.log("session storage returns");
      console.log(passhubWindow);
      chrome.tabs.sendMessage(passhubWindow.passhub.tab.id, { id: "request to send", origin: passhubWindow.passhub.origin })
        .then(response => {
          console.log('response to rts');
          console.log(response);
          deferredMsg = message;
        });
    })
    .catch(err => {
      console.log('catch 112 rts');
      console.log(err);
    })



  if (!connected) {
    sendResponse({ status: 'not connected' });
  } else {
    sendResponse({ status: 'wait' });
    try {
      passhubPort.postMessage(message);
    } catch (err) {
      consoleLog('catch 73');
      consoleLog(err);
      consoleLog('passhubPort');
      consoleLog(passhubPort);
    }
  }
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
