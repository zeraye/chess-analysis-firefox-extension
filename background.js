const setLoadingState = async (active) => {
  const activeCss = `.caal-loading {
    position: absolute;
    display: flex;
    background: #85a94e;
    padding: 1em;

    transform: translateX(-50%);
    left: 50%;
    margin-top: 40vh;

    z-index: 2000;

    box-shadow: 0 var(--borderHeight) 0 0 var(--borderColor),0 .7rem .95rem .05rem var(--secondaryBorderColor);
    border-radius: var(--borderRadius,.5rem);

    color: #fff;
    font-family: var(--globalSecondaryFont);
    font-size: 3rem;
    line-height: 1;
    font-weight: 700;
    text-shadow: 0 .1rem 0 rgba(0,0,0,.4);
  }`;

  const deactiveCss = `.caal-loading {
    display: none;
  }`;

  browser.tabs.insertCSS({ code: active ? activeCss : deactiveCss });
};

const fetchField = async (url, field) => {
  const response = await fetch(url);
  const data = await response.json();
  return data[field];
};

const getPGN = async (playerName, gameUrl) => {
  const archives = await fetchField(
    `https://api.chess.com/pub/player/${playerName}/games/archives`,
    "archives"
  );

  for (let i = archives.length - 1; i >= 0; i--) {
    games = await fetchField(archives[i], "games");
    for (let j = games.length - 1; j >= 0; j--) {
      if (games[j]["url"] === gameUrl) {
        return games[j]["pgn"];
      }
    }
  }

  return null;
};

const sendLogMessage = async (message) => {
  await browser.tabs.executeScript({
    code: `console.log("[Chess.com analyse at lichess]: ${message}");`,
  });
};

const clickElement = async (querySelector) => {
  await browser.tabs.executeScript({
    code: `document.querySelector("${querySelector}").click();`,
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

browser.pageAction.onClicked.addListener(async (tab) => {
  browser.tabs.executeScript({
    code: `
      if (!document.querySelector(".caal-loading")) {
        const loading = document.createElement("div");
        loading.textContent = "Analysing chess game...";
        loading.setAttribute("class", "caal-loading");
        document.body.appendChild(loading);
      }
    `,
  });

  await setLoadingState(true);

  const [playerName] = await browser.tabs.executeScript({
    code: `document.querySelector('[data-test-element="user-tagline-username"]').textContent;`,
  });

  const pgn = await getPGN(playerName, tab.url.split("?")[0]);

  await setLoadingState(false);

  await browser.tabs.create({ url: "https://lichess.org/paste" });

  if (await waitForElement("[name='analyse']")) {
    const [loggedIn] = await browser.tabs.executeScript({
      code: `!document.querySelector("[name='analyse']").disabled;`,
    });

    if (loggedIn) await waitAndClick("[name='analyse']");

    if (await waitForElement("[name='pgn']")) {
      await browser.tabs.executeScript({
        code: `document.querySelector("[name='pgn']").value = \`${pgn}\`;`,
      });

      await waitAndClick(".submit");

      await waitAndClick("[for='analyse-toggle-ceval']");
    }
  }
});
