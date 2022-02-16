const clickElement = async querySelector => {
  await browser.tabs.executeScript({code: `
    if (document.querySelector("${querySelector}"))
      document.querySelector("${querySelector}").click();
  `});
}

const waitForElement = async querySelector => {
  let [isElement] = await browser.tabs.executeScript({code: `document.querySelector("${querySelector}") !== null;`});
  let timeLeft = 1000;

  while (!isElement && timeLeft > 0) {
    await new Promise(r => setTimeout(r, 100));
    [isElement] = await browser.tabs.executeScript({code: `document.querySelector("${querySelector}") !== null;`});
    timeLeft -= 100;
  }

  return isElement;
}

const waitAndClick = async querySelector => {
  if (await waitForElement(querySelector))
    await clickElement(querySelector);
}

browser.pageAction.onClicked.addListener(async () => {
  await waitAndClick(".download");

  await waitAndClick(".board-tab-item-underlined-component");

  if (await waitForElement("[name='pgn']")) {
    const [pgn] = await browser.tabs.executeScript({code: `document.querySelector("[name='pgn']").value;`});

    await waitAndClick("[data-cy='share-menu-close']");

    await browser.tabs.create({url: "https://lichess.org/paste"});

    if (await waitForElement("[name='analyse']")) {
      const [logged] = await browser.tabs.executeScript({code: `!document.querySelector("[name='analyse']").disabled;`});

      if (logged)
        await waitAndClick("[name='analyse']");

      if (await waitForElement("[name='pgn']")) {
        await browser.tabs.executeScript({code: `document.querySelector("[name='pgn']").value = \`${pgn}\`;`});

        await waitAndClick(".submit");

        await waitAndClick("[for='analyse-toggle-ceval']");
      }
    }
  }
});
