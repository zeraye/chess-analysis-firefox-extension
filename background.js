const setLoadingState = async (active) => {
  const activeCss = `.caal-loading {
    display: flex;
  }`;

  const inactiveCss = `.caal-loading {
    display: none;
  }`;

  browser.tabs.insertCSS({ code: active ? activeCss : inactiveCss });
};

const fetchJSON = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error("Error when attempting to fetch resource.");
    return response.json();
  } catch (error) {
    sendLogMessage(error);
    return null;
  }
};

// Portable Game Notation (PGN) is a standard plain text format for
// recording chess games, which can be read by humans and is also
// supported by most chess software
const getPGN = async (playerName, gameUrl) => {
  try {
    const archives = (
      await fetchJSON(
        `https://api.chess.com/pub/player/${playerName}/games/archives`
      )
    ).archives;

    // Archives are given from the oldest to the most recet games.
    // Thus iterating from the last one (the most recent) is usually
    // better, because players usually want to analyse their most recent
    // games. So you will make less fetches
    for (let i = archives.length - 1; i >= 0; i--) {
      const games = (await fetchJSON(archives[i])).games;
      for (let j = games.length - 1; j >= 0; j--) {
        if (games[j].url === gameUrl) {
          return games[j].pgn;
        }
      }
    }
  } catch (error) {
    sendLogMessage(error);
    return null;
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
  const gameId = tab.url.split("?")[0];

  const pgn = await getPGN(playerName, gameId);

  await setLoadingState(false);

  if (!pgn) {
    sendLogMessage(`Game with id ${gameId} not found!`);
    return;
  }

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
