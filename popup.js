// const consoleLog = console.log;
const consoleLog = () => {};

consoleLog(logtime() + 'passhub extension popup start');

function logtime () {
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
  if(response.payment == "payment page") {
    paymentStatus = response.payment;
    paymentFrames.push(frame);
  }

  if(response.payment == "not valid frame") {
    validFramesRemove(frame);
  } else {
    frameResponded++;    
  }

  if(frameResponded == validFrames.length) {
    consoleLog('all frames responded');

    let mainURL = new URL(activeTab.url);

    const mainDomains = mainURL.host.split('.').reverse();
    if(mainDomains[mainDomains.length-1] == 'www') {
      mainDomains.pop();
    }

    for(let frame of validFrames) {

      const frameURL = new URL(frame.url);
      const frameDomains = frameURL.host.split('.').reverse();
      if(frameDomains[frameDomains.length-1] == 'www') {
        frameDomains.pop();
      }
  
      const minLength = mainDomains.length < frameDomains.length ?  mainDomains.length : frameDomains.length;
      const maxLength = mainDomains.length > frameDomains.length ?  mainDomains.length : frameDomains.length;
      consoleLog(`frame ${frame.frameId} ${frame.url} urllength ${frameDomains.length}`);
      if(maxLength - minLength > 1) {
        consoleLog('not same length');
        break;
      }
      let same = true;
      for(let i = 0; i < minLength; i++) {
        if( frameDomains[i] != mainDomains[i]) {
          same = false;
          consoleLog('not sameUrl');
          break;
        }
      }
      if(same) {
        consoleLog('sameUrl');
        sameUrlFrames.push(frame);
      }
    }

    consoleLog('sameUrlFrames');
    consoleLog(sameUrlFrames);


    consoleLog('paymentFrames');
    consoleLog(paymentFrames);

    if(paymentFrames.length) {
      const paymentUrl = new URL(paymentFrames[0].url);
      paymentHost = paymentUrl.host;
      consoleLog(`paymentHost1 ${paymentHost}`)

      for(let payFrame of paymentFrames) {
        const url = new URL(payFrame.url);
        const host = url.host;
        if(host != paymentHost) {
          paymentHost = null;
          paymentStatus = "not a payment page";
          break;
        }
      }
      consoleLog(`paymentHost ${paymentHost}`)
    }

    chrome.runtime.sendMessage({id: paymentHost? "payment page" :"not a payment page", url: tab.url, tabId: tab.id})
    .then( bgResponse => {
      consoleLog('popup got background response');
      consoleLog(bgResponse);
      const p = document.querySelector('#status-text');
      if (bgResponse.status == 'not connected') {
        const signIn = document.getElementById('sign-in');
        signIn.style.display = 'block';
        document.querySelector('#passhub-link').onclick = activatePassHubTab;
      }
    })
    .catch( err => {
      consoleLog('catch 32');
      consoleLog(err);
    })
  }
}

function paymentPlatform() {
  if(paymentHost) {
    let mainURL = new URL(activeTab.url);
    let mHost = mainURL.host;

    let parts = mainURL.host.split('.');

    if(parts.length > 1) {
      mHost =  parts.slice(parts.length-2).join('.');
    }
    parts = paymentHost.split('.');

    let pHost = paymentHost;

    if(parts.length > 1) {
      pHost =  parts.slice(parts.length-2).join('.')
    }
    consoleLog(`paymentPlatform pHost ${pHost} mHost ${mHost}`)
    if(pHost != mHost) {
      consoleLog(`paymentPlatform returns ${paymentHost}`)

      return paymentHost;
    }
  }
  return null;
}

function installScript(tab, frame) {
  consoleLog(`installScript for frame ${frame.frameId} ${frame.url}`);

  chrome.tabs.sendMessage(tab.id, {id:'payment status'}, {frameId: frame.frameId})
  .then( response => {
    consoleLog(`response ${response.payment} from frame ${frame.frameId} ${frame.url}`);
    consoleLog(response);
    gotPaymentStatus(tab, frame, response);
  })
  .catch( err =>{
    consoleLog(`catch69 frame: ${frame.frameId}`);
    consoleLog(err);
    // consoleLog(frame);

    chrome.scripting.executeScript(
      {
        target: {tabId: tab.id, frameIds: [frame.frameId]},
        files: ['contentScript.js'],
      })
      .then( injectionResult => {
        consoleLog('injectionResult');
        consoleLog(injectionResult);

        chrome.tabs.sendMessage(tab.id,  {id:'payment status'}, {frameId: frame.frameId})
        .then( response =>  {
          consoleLog(`response from frame ${frame.frameId} after executeScript/sendMessage`);
          consoleLog(response);
          gotPaymentStatus(tab, frame, response);
        })
        .catch(err => {
          consoleLog(`catch70 frame: ${frame.frameId} ${frame.url}`);
          consoleLog(err);
          gotPaymentStatus(tab, frame, {payment: "not valid frame"});
        })
      })
      .catch( err => {
        consoleLog(`catch71 frame: ${frame.frameId} ${frame.url}`);
        consoleLog(err);
        if(frame.frameId == 0) {
          notRegularPage(activeTab.url);
        } 
        gotPaymentStatus(tab, frame, {payment: "not valid frame"});
      })
  })
}

function notRegularPage(url, protocol = "") {
  document.getElementById('not-a-regular-page').style.display='block';

  if(protocol == "http:") {
    document.getElementById('not-a-regular-page-text').innerText = "Not a secure HTTPS page";
  } else {
    document.getElementById('not-a-regular-page-text').innerText = "Not a regular page";
  }
  document.getElementById('not-a-regular-page-url').innerText = url;          
}

chrome.tabs.query({active: true, currentWindow: true})
.then(tabs => {
  activeTab = tabs[0];
  consoleLog('activeTab');  
  consoleLog(activeTab);
  
  let mainURL = new URL(activeTab.url);
  consoleLog('mainURL');
  consoleLog(mainURL);


  if((mainURL.host == "") || (mainURL.protocol != "https:")) {
    notRegularPage(activeTab.url, mainURL.protocol);
    return;
  }

  let mainUrlFrames = [];  // do we need it?

  chrome.webNavigation.getAllFrames( {tabId:activeTab.id} )
  .then(frameList => {
    consoleLog(`frameList with ${frameList.length} frames`);
    for(let frame of frameList) {
      consoleLog(`${frame.frameId} ${frame.url}`)
      let frameURL = new URL(frame.url);
      if((frameURL.host !== "") || (frameURL.protocol == "https:")) {
        validFrames.push(frame);
        if(frameURL.host == mainURL.host) {
          mainUrlFrames.push(frame);
        }
      }
    }
    consoleLog('mainUrlFrames');
    consoleLog(mainUrlFrames);

    if(mainUrlFrames.length == 0) {
      notRegularPage(activeTab.url);
      return;
    }

    consoleLog('Sending message "payment status"');
    for(let frame of validFrames) {
      installScript(activeTab, frame)
    }
  })
  .catch(err => {
    consoleLog('catch 105');
    consoleLog(err);

  })
});  

let found = [];

function renderAccounts(m) {

  const passhubInstanceDiv = document.getElementById('passhub-instance');
  if(('passhubInstance' in m) && (m.passhubInstance != "passhub.net") && (m.passhubInstance != "www.passhub.net")) {
    if(m.passhubInstance.startsWith("www.")) {
      passhubInstanceDiv.innerText = m.passhubInstance.substring(4);
    } else {
      passhubInstanceDiv.innerText = m.passhubInstance;
    }
    passhubInstanceDiv.style.display = 'block';
  } else {
    passhubInstanceDiv.innerText = '';
    passhubInstanceDiv.style.display = 'none';
  }

  if(paymentHost) {
    let platform = paymentPlatform();
    consoleLog(`platform ${platform}`)
    if(platform) {
      consoleLog(`platform1 ${platform}`);
      document.getElementById('paygate').style.display='block';
      document.getElementById('paygate-url').innerText=platform;
    }
  }
  
    found = m.found;
    consoleLog('renderAccount found: ' + m.found.length);
  
    if(found.length === 0) {
      const notFound = document.getElementById('not-found');
      notFound.style.display = 'block';
      if(m.id === "payment") {
        document.getElementById("not-found-password").style.display = "none";
        document.getElementById("not-found-payment-card").style.display = "block";
      } else {
        document.getElementById("not-found-password").style.display = "block";
        document.getElementById("not-found-payment-card").style.display = "none";
        const notFoundHostName = document.getElementById("not-found-hostname");
        notFoundHostName.innerText = m.hostname;
      }
      return;
    }

    const p = document.querySelector('#advice');
    consoleLog('renderAccount in advice');
    try {
      for (let i = 0; i < found.length; i++) {
        consoleLog('rendering ' + i +1);
        const d = document.createElement('div');
        d.setAttribute('data-row', `${i}`);
        d.setAttribute('class', 'found-entry');
        d.onclick = advItemClick;
  
        const titleDiv = document.createElement('div');
        titleDiv.setAttribute('class', 'found-title');
        titleDiv.innerText = found[i].title;
        d.appendChild(titleDiv);
    
        const safeDiv = document.createElement('div');
        safeDiv.setAttribute('class', 'found-safe');
        safeDiv.innerText = found[i].safe;
        d.appendChild(safeDiv);
    
        p.appendChild(d);
        consoleLog('22');
      }
    } catch (e) {
      consoleLog('catch 193');
      consoleLog(e);
    }
    p.style.display = 'block';
    consoleLog('renderAccount advise rendered');
}
  
function advItemClick(e) {
  consoleLog('in dvItemClick');
  consoleLog(paymentStatus);
  const row = parseInt(this.getAttribute('data-row'));
  consoleLog(`clicked ${row} row`);

  chrome.tabs.query({active: true, currentWindow: true})
  .then(tabs => {

    if(paymentStatus == "payment page") {
      consoleLog(`paymentHost ${paymentHost}`)
      if(paymentHost) {
        consoleLog('paymentFrames');
        consoleLog(paymentFrames);

        for(let frame of paymentFrames ) {
          consoleLog('frame');
          consoleLog(frame);
          chrome.tabs.sendMessage(
            tabs[0].id,
              {
                id: 'card',
                card: found[row]. card,
              },  
              {frameId: frame.frameId})
            .then (response => {
              consoleLog('response');
              consoleLog(response);
              window.close();
            })
            .catch(err => {
              consoleLog('catched 169');
              consoleLog(err);
            })
        }
      }
      return;            
    }

    for(let frame of sameUrlFrames) {
      consoleLog('frame');
      consoleLog(frame);
      chrome.tabs.sendMessage(
        tabs[0].id,
          {
            id: 'loginRequest',
            username: found[row].username,
            password: found[row].password,
          },  
          {frameId: frame.frameId}
        )
        .then (response => {
          consoleLog('response');
          consoleLog(response);
          window.close();
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

  chrome.tabs.query({ url: urlList,  currentWindow: true }, tabs => {
    for(let tab of tabs) {
      if (tab.url.includes('/doc/browser-extension')) {
        chrome.tabs.update(tab.id, { active: true });
        return;
      }
    }
    window.open('https://passhub.net/doc/browser-extension', 'target="_blank"');
  });
}
  
document.querySelector('.help').onclick = activatePassHubDocTab;
  
function activatePassHubTab() {
  const manifest = chrome.runtime.getManifest();
  const urlList = manifest.externally_connectable.matches;

  chrome.tabs.query({ url: urlList,  currentWindow: true }, passHubTabs => {
    for(let tab of passHubTabs) {
      if(tab.url.includes('doc')) {
        continue;
      }
      chrome.tabs.update(tab.id, { active: true });
      return;
    }
    window.open('https://passhub.net/', 'target="_blank"');
  });
}

document.querySelector('.close-popup').onclick = () => window.close();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  consoleLog('popup got message');
  consoleLog(request);
  consoleLog(sender);

  if((request.id === "advise")||(request.id === "payment")) {
    sendResponse({ response: 'Bye' })
    renderAccounts(request);
    return;
  }
});
