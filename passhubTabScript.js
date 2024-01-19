const consoleLog = console.log;
//const consoleLog = () => {};

consoleLog('passhubTabSript start');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    consoleLog('message');
    consoleLog(message);
    consoleLog('sender');
    consoleLog(sender);

    if (message.id === 'request to send') {
        window.postMessage(message, message.origin);
    }
    sendResponse({ farewell: "passhubTabScript goodbye" });
});

