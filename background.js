const sendLogMessage = async (message) => {
  await browser.tabs.executeScript({
    code: `console.log("[Chess.com analyse at lichess]: ${message}");`,
  });
};

const clickElement = async (querySelector) => {
  await browser.tabs.executeScript({
    code: `
    if (document.querySelector("${querySelector}"))
      document.querySelector("${querySelector}").click();
  `,
  });
};

const waitForElement = async (querySelector) => {
  const elementFoundScript = `document.querySelector("${querySelector}") !== null;`;
  const retryDelay = 100;

  let timeLeft = 5000;
  let [isElement] = await browser.tabs.executeScript({
    code: elementFoundScript,
  });

  while (!isElement && timeLeft > 0) {
    await new Promise((r) => setTimeout(r, retryDelay));
    [isElement] = await browser.tabs.executeScript({
      code: elementFoundScript,
    });
    timeLeft -= retryDelay;
  }

  if (!isElement) sendLogMessage(`Cannot find \`${querySelector}\` element!`);

  return isElement;
};

const waitAndClick = async (querySelector) => {
  if (await waitForElement(querySelector)) await clickElement(querySelector);
};

browser.pageAction.onClicked.addListener(async () => {
  await browser.tabs.executeScript({
    code: `
    if (!document.querySelector(".caal-alerts")) {
      alerts = document.createElement("div")
      alerts.setAttribute("class", "caal-alerts");
      alerts.setAttribute("style", "position:absolute;");
      document.body.appendChild(alerts);
    }
  `,
  });

  await waitAndClick('.share');

  await waitAndClick('.board-tab-item-underlined-component');

  if (await waitForElement("[name='pgn']")) {
    const [pgn] = await browser.tabs.executeScript({
      code: `document.querySelector("[name='pgn']").value;`,
    });

    await waitAndClick("[data-cy='share-menu-close']");

    await browser.tabs.create({ url: 'https://lichess.org/paste' });

    if (await waitForElement("[name='analyse']")) {
      const [loggedIn] = await browser.tabs.executeScript({
        code: `!document.querySelector("[name='analyse']").disabled;`,
      });

      if (loggedIn) await waitAndClick("[name='analyse']");

      if (await waitForElement("[name='pgn']")) {
        await browser.tabs.executeScript({
          code: `document.querySelector("[name='pgn']").value = \`${pgn}\`;`,
        });

        await waitAndClick('.submit');

        await waitAndClick("[for='analyse-toggle-ceval']");
      }
    }
  }
});
