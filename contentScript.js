// GPL: https://github.com/passff/passff

// const consoleLog = console.log;
const consoleLog = () => {};

function fireEvent(el, name) {
  el.dispatchEvent(
    new Event(name, {
      bubbles: true,
      composed: true,
      cancelable: true,
    })
  );
}

function setInputValue(input, value) {
  input.value = value;
  fireEvent(input, 'input');
  fireEvent(input, 'change');
}

let fillCounter = 0;
let intervalID = null;
let usernameID = null;

function  initFillCredentials() {
  fillCounter = 0
  usernameID = null;

  clearInterval(intervalID);
  intervalID = null;
}

function isUsernameCandidate(input) {
  if(input.id.toLowerCase().search('search') != -1) {
    return false;
  }
  if(input.placeholder.toLowerCase().search('search') != -1) {
    return false;
  }
  return true;
}

function fillCredentials(loginData = null) {
  if(!loginData) {

    clearInterval(intervalID);
    intervalID =null;
    return;
  }

  let usernameInput = null;
  let passwordInput = null;

  const inputs = document.querySelectorAll('input');

  fillCounter++;

  if(fillCounter < 200) {
    consoleLog(inputs.length);
  } else {
    clearInterval(intervalID);
    intervalID =null;
    return;
  }


  for(let input of inputs) {
    if(input.offsetParent === null) {
      continue;
    }
    if(input.disabled === true) {
      continue;
    }
    if(window.getComputedStyle(input).visibility == 'hidden') {
      continue;
    }
    const itype = input.type.toLowerCase();
    if(itype === 'text' && passwordInput == null) {
      if(isUsernameCandidate(input)) usernameInput = input;
    }
    if(itype === 'email' && passwordInput == null) {
      usernameInput = input;
    }

    if(itype === 'password') {
      passwordInput = input;
    }

    if(usernameInput && passwordInput) {
      break;
    }
  }

  if(usernameInput && passwordInput) {
    consoleLog('contentScript done: username & password');
    setInputValue(usernameInput, loginData.username);
    setInputValue(passwordInput, loginData.password);

    clearInterval(intervalID);
    intervalID = null;
    return;
  }
  if(passwordInput) {
    consoleLog('contentScript done: password');
    setInputValue(passwordInput, loginData.password);

    clearInterval(intervalID);
    intervalID = null;
    return;
  }

  if(usernameInput) {
    if(
      usernameID != null &&
      typeof usernameInput.id != 'undefined' &&
      usernameInput.id == usernameID
    ) {
      // do nothing, already set
      return false;
    }
    consoleLog('contentScript: username only');
    setInputValue(usernameInput, loginData.username);

    if(typeof usernameInput.id != 'undefined') {
      usernameID = usernameInput.id;
    }
    return false;
  }

  if(usernameInput == null && passwordInput == null) {
    if(fillCounter > 20) {
      consoleLog('contentScript nothing found');
      clearInterval(intervalID);
      intervalID = null;
      return;
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    consoleLog(message);
    consoleLog(sender.tab ?
                "from a content script:" + sender.tab.url :
                "from the extension");
    if(message.id === "loginRequest") {
      initFillCredentials();
//      fillCredentials(message);
      intervalID = setInterval(() => {
          fillCredentials(message); 
          consoleLog(`fillCounter ${fillCounter}`)
        },
       100);
        sendResponse({farewell: "Ok"});
      return;
    }

    if(message.id === "card") {
      fillCardData(message.card);
      sendResponse({farewell: "Ok"});
      return;
    }

    if(message.id === "payment status") {
      const ccNumber = document.querySelectorAll('[autocomplete="cc-number"]');
      const ccName = document.querySelectorAll('[autocomplete="cc-name"]');
      const ccCSC = document.querySelectorAll('[autocomplete="cc-csc"]');
      const paymentStatus = { payment: ccNumber.length + ccName.length + ccCSC.length > 0 ?  "payment page": "not a payment page"  }
      consoleLog('response');
      consoleLog(paymentStatus);
      sendResponse(paymentStatus);
      return;
    }
    sendResponse({farewell: "goodbye"});
  }
);

function fillCardData(card) {
  const cardnum= document.querySelectorAll('[autocomplete="cc-number"]');
  if(cardnum.length > 0) {
    setInputValue(cardnum[0], card[3]);    
  }

  let name= document.querySelectorAll('[autocomplete="cc-name"]');
  if(name.length > 0) {
    setInputValue(name[0], card[4]);    
  } else {
    name= document.querySelectorAll('[autocomplete="ccname"]');
    if(name.length > 0) {
      setInputValue(name[0], card[4]);    
    }
  }

  let exp= document.querySelectorAll('[autocomplete="cc-exp"]');
  if(exp.length > 0) {
    setInputValue(exp[0], `${card[5]}/${card[6]}`);    
  } else {
    let month = document.querySelectorAll('[autocomplete="cc-exp-month"]');
    if(month.length > 0) {
      setInputValue(month[0], card[5]);
    }
    let year = document.querySelectorAll('[autocomplete="cc-exp-year"]');
    if(year.length > 0) {
      let twoDigitYear = card[6];
      if(card[6].length > 2) {
        twoDigitYear = card[6]
      }
      setInputValue(year[0], card[6]);
    }
  }

  const csc= document.querySelectorAll('[autocomplete="cc-csc"]');
  if(csc.length > 0) {
    setInputValue(csc[0], card[7]);    
  }
}

