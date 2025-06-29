const consoleLog = () => { };
const windowClose = window.close;

// Debug mode:
// const consoleLog = console.log;
// const windowClose = () => { consoleLog('xxx')};

consoleLog(logtime() + 'passhub extension popup start');

function logtime() {
  const today = new Date();
  return today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds() + " ";
}

let activeTab = null;

let frameResponded = 0;
let validFrames = [];
let sameUrlFrames = [];
let paymentFrames = [];

let paymentStatus = "not a payment page";
let paymentHost = null;

function validFramesRemove(frame) {
  validFrames = validFrames.filter(e => e !== frame);
  consoleLog(`Removed frame from validFrames ${frame.url}`);
}

function gotPaymentStatus(tab, frame, response) {

  consoleLog(`gotPaymentStatus from frame ${frame.frameId}`);
  consoleLog(`frameResponded ${frameResponded + 1} out of ${validFrames.length}`);

  consoleLog(response);
  if (response.payment == "payment page") {
    consoleLog('paymentFrame')
    consoleLog(frame)

    paymentStatus = response.payment;
    paymentFrames.push(frame);
  }

  if (response.payment == "not valid frame") {
    validFramesRemove(frame);
  } else {
    frameResponded++;
  }

  if (frameResponded == validFrames.length) {
    consoleLog('all frames responded');

    let mainURL = new URL(activeTab.url);

    const mainDomains = mainURL.host.split('.').reverse();
    if (mainDomains[mainDomains.length - 1] == 'www') {
      mainDomains.pop();
    }

    for (let frame of validFrames) {

      const frameURL = new URL(frame.url);
      const frameDomains = frameURL.host.split('.').reverse();
      if (frameDomains[frameDomains.length - 1] == 'www') {
        frameDomains.pop();
      }

      const minLength = mainDomains.length < frameDomains.length ? mainDomains.length : frameDomains.length;
      const maxLength = mainDomains.length > frameDomains.length ? mainDomains.length : frameDomains.length;
      consoleLog(`frame ${frame.frameId} ${frame.url} urllength ${frameDomains.length}`);
      if (maxLength - minLength > 1) {
        consoleLog('not same length');
        continue;
      }
      let same = true;
      for (let i = 0; i < minLength; i++) {
        if (frameDomains[i] != mainDomains[i]) {
          same = false;
          consoleLog('not sameUrl: ' + frameDomains[i] + ' != ' + mainDomains[i]);
          break;
        }
      }
      if (same) {
        consoleLog('sameUrl: ' + frameDomains.join('.'));
        sameUrlFrames.push(frame);
      }
    }

    consoleLog('sameUrlFrames');
    consoleLog(sameUrlFrames);


    consoleLog('paymentFrames');
    consoleLog(paymentFrames);

    if (paymentFrames.length) {
      const paymentUrl = new URL(paymentFrames[0].url);
      paymentHost = paymentUrl.host;
      consoleLog(`paymentHost1 ${paymentHost}`)

      /*      
            for (let payFrame of paymentFrames) {
              const url = new URL(payFrame.url);
              const host = url.host;
              if (host != paymentHost) {
                console.log('host witrh wrong url', host);
      
                paymentHost = null;
                paymentStatus = "not a payment page";
                break;
              }
            }
      */

      consoleLog(`paymentHost ${paymentHost}`)
    }

    chrome.runtime.sendMessage({ id: paymentHost ? "payment page" : "not a payment page", url: tab.url, tabId: tab.id })
      .then(bgResponse => {
        consoleLog('popup got background response');
        consoleLog(bgResponse);
        const p = document.querySelector('#status-text');
        if (bgResponse.status == 'not connected') {
          const signIn = document.getElementById('sign-in');
          signIn.style.display = 'block';
          document.querySelector('#passhub-link').onclick = activatePassHubTab;
        }
      })
      .catch(err => {
        consoleLog('catch 32');
        consoleLog(err);
      })
  }
}

function paymentPlatform() {
  if (paymentHost) {
    let mainURL = new URL(activeTab.url);
    let mHost = mainURL.host;

    let parts = mainURL.host.split('.');

    if (parts.length > 1) {
      mHost = parts.slice(parts.length - 2).join('.');
    }
    parts = paymentHost.split('.');

    let pHost = paymentHost;

    if (parts.length > 1) {
      pHost = parts.slice(parts.length - 2).join('.')
    }
    consoleLog(`paymentPlatform pHost ${pHost} mHost ${mHost}`)
    if (pHost != mHost) {
      consoleLog(`paymentPlatform returns ${paymentHost}`)

      return paymentHost;
    }
  }
  return null;
}

function installScript(tab, frame) {
  consoleLog(`installScript for frame ${frame.frameId} ${frame.url}`);

  chrome.tabs.sendMessage(tab.id, { id: 'payment status' }, { frameId: frame.frameId })
    .then(response => {
      consoleLog(`response ${response.payment} from frame ${frame.frameId} ${frame.url}`);
      consoleLog(response);
      gotPaymentStatus(tab, frame, response);
    })
    .catch(err => {
      consoleLog(`catch69 frame: ${frame.frameId}`);
      consoleLog(err);
      // consoleLog(frame);

      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id, frameIds: [frame.frameId] },
          files: ['contentScript.js'],
        })
        .then(injectionResult => {
          consoleLog('injectionResult');
          consoleLog(injectionResult);

          chrome.tabs.sendMessage(tab.id, { id: 'payment status' }, { frameId: frame.frameId })
            .then(response => {
              consoleLog(`response from frame ${frame.frameId} after executeScript/sendMessage`);
              consoleLog(response);
              gotPaymentStatus(tab, frame, response);
            })
            .catch(err => {
              consoleLog(`catch70 frame: ${frame.frameId} ${frame.url}`);
              consoleLog(err);
              gotPaymentStatus(tab, frame, { payment: "not valid frame" });
            })
        })
        .catch(err => {
          consoleLog(`catch71 frame: ${frame.frameId} ${frame.url}`);
          consoleLog(err);
          if (frame.frameId == 0) {
            notRegularPage(activeTab.url);
          }
          gotPaymentStatus(tab, frame, { payment: "not valid frame" });
        })
    })
}

function notRegularPage(url, protocol = "") {
  document.getElementById('not-a-regular-page').style.display = 'block';

  if (protocol == "http:") {
    document.getElementById('not-a-regular-page-text').innerText = "Not a secure HTTPS page";
  } else {
    document.getElementById('not-a-regular-page-text').innerText = "Not a regular page";
  }
  document.getElementById('not-a-regular-page-url').innerText = url;
}

chrome.tabs.query({ active: true, currentWindow: true })
  .then(tabs => {
    activeTab = tabs[0];
    consoleLog('activeTab');
    consoleLog(activeTab);

    let mainURL = new URL(activeTab.url);
    consoleLog('mainURL');
    consoleLog(mainURL);


    if ((mainURL.host == "") || (mainURL.protocol != "https:")) {
      notRegularPage(activeTab.url, mainURL.protocol);
      return;
    }

    let mainUrlFrames = [];  // do we need it?

    chrome.webNavigation.getAllFrames({ tabId: activeTab.id })
      .then(frameList => {
        consoleLog(`frameList with ${frameList.length} frames`);
        for (let frame of frameList) {
          consoleLog(`${frame.frameId} ${frame.url}`)
          let frameURL = new URL(frame.url);
          if ((frameURL.host !== "") || (frameURL.protocol == "https:")) {
            validFrames.push(frame);
            if (frameURL.host == mainURL.host) {
              mainUrlFrames.push(frame);
            }
          }
        }
        consoleLog('mainUrlFrames');
        consoleLog(mainUrlFrames);

        if (mainUrlFrames.length == 0) {
          notRegularPage(activeTab.url);
          return;
        }

        consoleLog('Sending message "payment status"');
        for (let frame of validFrames) {
          installScript(activeTab, frame)
        }
      })
      .catch(err => {
        consoleLog('catch 105');
        consoleLog(err);

      })
  });

const dial =
  `<svg style="transform: rotate(90deg) scale(-1,1)" width="24" viewBox="0 0 200 200" version="1.1"
    xmlns="http://www.w3.org/2000/svg">
    <circle r="90" cx="100" cy="100" fill="transparent" stroke-width="20">
    </circle>
    <circle class="otp-dial" r="85" cx="100" cy="100" fill="transparent"  stroke-width="30";
        stroke-dashoffset="0"></circle>
</svg>`

function setOtpDial(val) {
  const circles = document.querySelectorAll('svg .otp-dial');

  if (isNaN(val)) {
    val = 100;
  } else {
    if (val < 0) { val = 0; }
    if (val > 100) { val = 100; }


    for (const circle of circles) {
      const r = circle.getAttribute('r');
      const c = Math.PI * (r * 2);
      const pct = c - ((100 - val) / 100) * c;

      circle.style.strokeDashoffset = pct;
      circle.style.strokeDasharray = c;

    }
  }
}

// all enrties found by passhub.net for the current tab 
let found = [];


function updateOtp() {
  for (let i = 0; i < found.length; i++) {
    if ('totp_next' in found[i]) {
      found[i].totp = found[i].totp_next;
      const record = document.querySelector(`[data-row = "${i}"]`)
      const totpValue = record.querySelector('.totp-value')
      if (totpValue) {
        totpValue.innerText = found[i].totp;
      }
    }
  }
}

setInterval(() => {
  const d = new Date();
  setOtpDial((d.getSeconds() % 30) * 10 / 3)
  if ((d.getSeconds() % 30) == 0) {
    updateOtp()
  }
}, 1000)


document.querySelector('#modal-mask').addEventListener('click', (ev) => {
  ev.stopPropagation();
  ev.target.style.display = 'none';

  const copyDialogs = document.querySelectorAll('.copy-dialog')
  for (const copyDialog of copyDialogs) {
    copyDialog.style.display = 'none'
  }
})

function copyDivEntryClick(ev, fieldName) {
  ev.stopPropagation();
  document.querySelector('#modal-mask').style.display = 'none';
  const foundEntry = ev.target.closest('.found-entry');
  const row = parseInt(foundEntry.getAttribute('data-row'));
  if (paymentStatus == "payment page") {
    const card = found[row].card;
    if (fieldName == "cc-name") {
      navigator.clipboard.writeText(card[4].trim())
    }
    if (fieldName == "cc-number") {
      navigator.clipboard.writeText(card[3].trim())
    }
    if (fieldName == "cc-exp-month") {
      navigator.clipboard.writeText(card[5].trim())
    }
    if (fieldName == "cc-exp-year") {
      navigator.clipboard.writeText(card[6].trim())
    }
    if (fieldName == "cc-csc") {
      navigator.clipboard.writeText(card[7].trim())
    }
  } else {
    const field = found[row][fieldName];
    navigator.clipboard.writeText(field.trim())
  }

  const p = ev.target.closest('.copy-dialog');
  p.style.display = 'none'
}

function startCopiedTimer() {
  setTimeout(() => {
    document
      .querySelectorAll(".copied")
      .forEach((e) => (e.style.display = "none"));
    windowClose();

  }, 1000);
}

function renderFoundEntry(entryData, row) {

  const foundEntry = document.createElement('div');
  foundEntry.setAttribute('data-row', `${row}`);
  foundEntry.setAttribute('class', 'found-entry');

  const copyDialog = document.createElement('div');
  copyDialog.setAttribute('class', 'copy-dialog')

  if (paymentStatus == "payment page") {

    const copyCcName = document.createElement('div');
    copyCcName.innerHTML = '<span>Copy name</span>';

    copyCcName.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'cc-name');
    })
    copyDialog.append(copyCcName);

    const copyCcNumber = document.createElement('div');
    copyCcNumber.innerHTML = '<span>Copy number</span>';

    copyCcNumber.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'cc-number');
    })
    copyDialog.append(copyCcNumber);

    const copyCcCSC = document.createElement('div');
    copyCcCSC.innerHTML = '<span>Copy CVC</span>';

    copyCcCSC.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'cc-csc');
    })
    copyDialog.append(copyCcCSC);

    const copyCcExpMonth = document.createElement('div');
    copyCcExpMonth.innerHTML = '<span>Copy Exp. Month</span>';

    copyCcExpMonth.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'cc-exp-month');
    })
    copyDialog.append(copyCcExpMonth);

    const copyCcExpYear = document.createElement('div');
    copyCcExpYear.innerHTML = '<span>Copy Exp. Year</span>';

    copyCcExpYear.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'cc-exp-year');
    })
    copyDialog.append(copyCcExpYear);


  } else {
    const copyUsername = document.createElement('div');
    copyUsername.innerHTML = '<span>Copy Username</span>';

    copyUsername.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'username');
    })
    copyDialog.append(copyUsername);

    const copyPassword = document.createElement('div');
    copyPassword.innerHTML = '<span>Copy Password</span>';

    copyPassword.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'password');
    })
    copyDialog.append(copyPassword);
  }


  foundEntry.setAttribute('title', 'Click to fill the form');

  if ("totp" in entryData) {
    const copyTotp = document.createElement('div');
    copyTotp.innerHTML = '<span>Copy One-time Code</span>';

    copyTotp.addEventListener('click', (ev) => {
      copyDivEntryClick(ev, 'totp');
    })
    copyDialog.append(copyTotp);
    foundEntry.setAttribute('title', 'Click to fill the form & copy TOTP');
  }

  copyDialog.style.display = 'none';
  foundEntry.append(copyDialog);

  const fillSpan = document.createElement('span')
  fillSpan.setAttribute('class', 'three-dots')

  fillSpan.innerHTML = '<img src="images/three-dots-vertical.svg">'
  fillSpan.setAttribute('title', 'Details')
  foundEntry.append(fillSpan);

  fillSpan.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const p = ev.target.closest('.found-entry');
    const c = p.querySelector('.copy-dialog');
    c.style.display = 'block';
    document.querySelector('#modal-mask').style.display = 'block'
  })

  foundEntry.onclick = advItemClick;

  const titleDiv = document.createElement('div');
  titleDiv.setAttribute('class', 'found-title');
  titleDiv.innerText = entryData.title;
  foundEntry.appendChild(titleDiv);

  const safeDiv = document.createElement('div');
  safeDiv.setAttribute('class', 'found-safe');
  safeDiv.innerText = entryData.safe;
  foundEntry.appendChild(safeDiv);

  if ("totp" in entryData) {
    const totpDiv = document.createElement('div');
    totpDiv.setAttribute('class', 'found-totp');
    totpDiv.innerHTML = dial;
    totpDiv.innerHTML += '<div style="margin: 0 20px 0 10px; font-size: 14px">One-time code (TOTP)</div>';
    const totpValue = document.createElement('div');
    totpValue.setAttribute("title", "Copy one-time code");

    totpValue.innerHTML = `<code class="totp-value">${entryData.totp}
            <div class="copied" >
              <div>Copied &#10003;</div>
            </div>
          </code>`
      ;

    totpValue.addEventListener('click', (ev) => {
      ev.stopPropagation();
      totpValue.querySelector('.copied').style.display = 'initial';
      startCopiedTimer();
      navigator.clipboard.writeText(entryData.totp.trim()).then(() => {
        //windowClose();
      })
    })
    totpDiv.appendChild(totpValue);
    foundEntry.appendChild(totpDiv);
  }
  return foundEntry;
}

function renderAccounts(message) {

  const passhubInstanceDiv = document.getElementById('passhub-instance');
  if (('passhubInstance' in message) && (message.passhubInstance != "passhub.net") && (message.passhubInstance != "www.passhub.net")) {
    if (message.passhubInstance.startsWith("www.")) {
      passhubInstanceDiv.innerText = message.passhubInstance.substring(4);
    } else {
      passhubInstanceDiv.innerText = message.passhubInstance;
    }
    passhubInstanceDiv.style.display = 'block';
  } else {
    passhubInstanceDiv.innerText = '';
    passhubInstanceDiv.style.display = 'none';
  }

  if (paymentHost) {
    let platform = paymentPlatform();
    consoleLog(`platform ${platform}`)
    if (platform) {
      consoleLog(`platform1 ${platform}`);
      document.getElementById('paygate').style.display = 'block';
      document.getElementById('paygate-url').innerText = platform;
    }
  }

  found = message.found;
  consoleLog('renderAccount found: ' + message.found.length);

  if (message.id === "payment") {
    paymentStatus = "payment page";
    document.querySelector('.credit-card').style.display = 'none';
  } else {
    document.querySelector('.credit-card').style.display = 'initial';
    document.querySelector('.credit-card').addEventListener('click', () => {

      chrome.runtime.sendMessage({ id: "payment page" /*, url: tab.url, tabId: tab.id */ })
        .then(bgResponse => {
          consoleLog('popup got background response');
          consoleLog(bgResponse);
          const p = document.querySelector('#status-text');
          if (bgResponse.status == 'not connected') {
            const signIn = document.getElementById('sign-in');
            signIn.style.display = 'block';
            document.querySelector('#passhub-link').onclick = activatePassHubTab;
          }
        })
        .catch(err => {
          consoleLog('catch 32');
          consoleLog(err);
        })

    })
  }

  if (found.length === 0) {
    const notFound = document.getElementById('not-found');
    notFound.style.display = 'block';
    if (message.id === "payment") {
      document.getElementById("not-found-password").style.display = "none";
      document.getElementById("not-found-payment-card").style.display = "block";
    } else {
      document.getElementById("not-found-password").style.display = "block";
      document.getElementById("not-found-payment-card").style.display = "none";
      const notFoundHostName = document.getElementById("not-found-hostname");
      notFoundHostName.innerText = message.hostname;
    }
    return;
  }

  const adviceListDiv = document.querySelector('#advice');
  adviceListDiv.innerHTML = '';
  consoleLog('renderAccount in advice');
  try {
    for (let i = 0; i < found.length; i++) {
      consoleLog('rendering ' + i + 1);
      const foundEntry = renderFoundEntry(found[i], i)

      adviceListDiv.appendChild(foundEntry);
      consoleLog('22');
    }
  } catch (e) {
    consoleLog('catch 193');
    consoleLog(e);
  }
  adviceListDiv.style.display = 'block';
  consoleLog('renderAccount advise rendered');
}

function advItemClick(e) {
  consoleLog('in dvItemClick');
  consoleLog(paymentStatus);
  const row = parseInt(this.getAttribute('data-row'));
  consoleLog(`clicked ${row} row`);

  chrome.tabs.query({ active: true, currentWindow: true })
    .then(tabs => {

      if (paymentStatus == "payment page") {
        consoleLog(`paymentHost ${paymentHost} `)
        if (paymentHost) {
          consoleLog('paymentFrames');
          consoleLog(paymentFrames);

          for (let frame of paymentFrames) {
            consoleLog('frame');
            consoleLog(frame);
            chrome.tabs.sendMessage(
              tabs[0].id,
              {
                id: 'card',
                card: found[row].card,
              },
              { frameId: frame.frameId })
              .then(response => {
                consoleLog('response');
                consoleLog(response);
                windowClose();
              })
              .catch(err => {
                consoleLog('catched 169');
                consoleLog(err);
              })
          }
        }
        return;
      }

      for (let frame of sameUrlFrames) {
        consoleLog('frame');
        consoleLog(frame);
        if ("totp" in found[row]) {
          navigator.clipboard.writeText(found[row].totp.trim())
        }

        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            id: 'loginRequest',
            username: found[row].username,
            password: found[row].password,
            frameId: frame.frameId //debug

          },
          { frameId: frame.frameId }
        )
          .then(response => {
            consoleLog('response');
            consoleLog(response);
            windowClose();
          })
          .catch(err => {
            consoleLog('catched 169');
            consoleLog(err);
          })
      }
    });
}

function activatePassHubDocTab() {
  const manifest = chrome.runtime.getManifest();
  const urlList = manifest.externally_connectable.matches;

  chrome.tabs.query({ url: urlList, currentWindow: true }, tabs => {
    for (let tab of tabs) {
      if (tab.url.includes('/doc/browser-extension')) {
        chrome.tabs.update(tab.id, { active: true });
        return;
      }
    }
    window.open('https://passhub.net/doc/browser-extension', 'target="_blank"');
  });
}

function activatePassHubTab() {
  const manifest = chrome.runtime.getManifest();
  const urlList = manifest.externally_connectable.matches;

  chrome.tabs.query({ url: urlList, currentWindow: true }, passHubTabs => {
    for (let tab of passHubTabs) {
      if (tab.url.includes('doc')) {
        continue;
      }
      chrome.tabs.update(tab.id, { active: true });
      return;
    }
    window.open('https://passhub.net/', 'target="_blank"');
  });
}

document.querySelector('.help').onclick = activatePassHubDocTab;

document.querySelector('.close-popup').addEventListener('click', (ev) => {
  windowClose()
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  consoleLog('popup got message');
  consoleLog(request);
  consoleLog(sender);

  if (request.id === "not connected") {
    const signIn = document.getElementById('sign-in');
    sendResponse({ response: 'Bye' })
    consoleLog(signIn);
    signIn.style.display = 'block';
    document.querySelector('#passhub-link').onclick = activatePassHubTab;
    consoleLog(signIn.style);
  }

  if ((request.id === "advise") || (request.id === "payment")) {
    sendResponse({ response: 'Bye' })
    renderAccounts(request);
    return;
  }
});



