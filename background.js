const showMessage = async message => {
  await browser.tabs.executeScript({code: `
    closeBtn = document.createElement("span");
    closeBtn.textContent = "×";
    closeBtn.setAttribute("style", "font-weight:bold;float:right;font-size:20px;line-height:18px;cursor:pointer;padding-left:15px;");
    closeBtn.setAttribute("onclick", "this.parentElement.style.display='none';");
    alertBox = document.createElement("div");
    alertBox.setAttribute("style", "padding: 20px;background-color:#f44336;color:white;margin-bottom:15px;transition: opacity 0.3s linear 2s;opacity:0.83;");
    alertBox.textContent = "${message}";
    alertBox.appendChild(closeBtn);
    document.querySelector(".caal-alerts").appendChild(alertBox);
  `});
}

const clickElement = async querySelector => {
  await browser.tabs.executeScript({code: `
    if (document.querySelector("${querySelector}"))
      document.querySelector("${querySelector}").click();
      console.log("Clicked ${querySelector}");
  `});
}

const waitForElement = async querySelector => {
  const elementFoundScript = `document.querySelector("${querySelector}") !== null;`;
  const retryDelay = 100;

  let timeLeft = 1000;
  let [isElement] = await browser.tabs.executeScript({code: `document.querySelector("${querySelector}") !== null;`});

  while (!isElement && timeLeft > 0) {
    await new Promise(r => setTimeout(r, retryDelay));
    [isElement] = await browser.tabs.executeScript({code: elementFoundScript});
    timeLeft -= retryDelay;
  }

  if (!isElement)
    showMessage(`Cannot find \`${querySelector}\` element!`);

  return isElement;
}

const waitAndClick = async querySelector => {
  if (await waitForElement(querySelector))
    await clickElement(querySelector);
}

browser.pageAction.onClicked.addListener(async () => {
  await browser.tabs.executeScript({code: `
    if (!document.querySelector(".caal-alerts")) {
      alerts = document.createElement("div")
      alerts.setAttribute("class", "caal-alerts");
      alerts.setAttribute("style", "position:absolute;");
      document.body.appendChild(alerts);
    }
  `});

  await waitAndClick(".download");

  await waitAndClick(".board-tab-item-underlined-component");

  if (await waitForElement("[name='pgn']")) {
    const [pgn] = await browser.tabs.executeScript({code: `document.querySelector("[name='pgn']").value;`});

    await waitAndClick("[data-cy='share-menu-close']");

    await browser.tabs.create({url: "https://lichess.org/paste"});

    if (await waitForElement("[name='analyse']")) {
      const [loggedIn] = await browser.tabs.executeScript({code: `!document.querySelector("[name='analyse']").disabled;`});

      if (loggedIn)
        await waitAndClick("[name='analyse']");

      if (await waitForElement("[name='pgn']")) {
        await browser.tabs.executeScript({code: `document.querySelector("[name='pgn']").value = \`${pgn}\`;`});

        await waitAndClick(".submit");

        await waitAndClick("[for='analyse-toggle-ceval']");
      }
    }
  }
});
