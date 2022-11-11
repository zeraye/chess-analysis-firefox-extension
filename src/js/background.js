const setLoadingState = async (active, tabId) => {
  const activeCss = `.caal-loading {
    display: flex;
  }`;

  const inactiveCss = `.caal-loading {
    display: none;
  }`;

const sendLogMessage = async (message, tabId) => {
  await browser.tabs.executeScript(tabId, {
    code: `console.log("[Chess.com analyse at lichess]: ${message}");`,
  });
};

const fetchJSON = async (url, tabId) => {
  try {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error("Error when attempting to fetch resource.");
    return response.json();
  } catch (error) {
    sendLogMessage(error, tabId);
    return null;
  }
};

/*
 * Portable Game Notation (PGN) is a standard plain text format for
 * recording chess games, which can be read by humans and is also
 * supported by most chess software
 */
const getPGN = async (playerName, gameUrl, tabId) => {
  try {
    const archives = (
      await fetchJSON(
        `https://api.chess.com/pub/player/${playerName}/games/archives`,
        tabId
      )
    ).archives;
    /*
     * Archives are given from the oldest to the most recet games.
     * Thus iterating from the last one (the most recent) is usually
     * better, because players usually want to analyse their most recent
     * games. You will probably make less fetches
     */
    for (let i = archives.length - 1; i >= 0; i--) {
      const games = (await fetchJSON(archives[i], tabId)).games;
      for (let j = games.length - 1; j >= 0; j--) {
        if (games[j].url === gameUrl) {
          return games[j].pgn;
        }
      }
    }
  } catch (error) {
    sendLogMessage(error, tabId);
    return null;
  }

  return null;
};

const getPGNManual = async (tabId) => {
  await waitAndClick(".share");
  await waitAndClick(".board-tab-item-underlined-component");
  await waitAndClick(".share-menu-tab-pgn-toggle");

  if (await waitForElement("[name='pgn']")) {
    const [pgn] = await browser.tabs.executeScript(tabId, {
      code: `document.querySelector("[name='pgn']").value;`,
    });
    await waitAndClick("[data-cy='share-menu-close']");

    return pgn;
  }

  return null;
};

const clickElement = async (querySelector, tabId) => {
  await browser.tabs.executeScript(tabId, {
    code: `document.querySelector("${querySelector}").click();`,
  });
};

const waitForElement = async (
  querySelector,
  tabId,
  timeLeft = 5000,
  retryDelay = 100
) => {
  const elementFoundScript = `document.querySelector("${querySelector}") !== null;`;

  let isElement = null;

  while (!isElement && timeLeft > 0) {
    await new Promise((r) => setTimeout(r, retryDelay));
    timeLeft -= retryDelay;
    [isElement] = await browser.tabs.executeScript(tabId, {
      code: elementFoundScript,
    });
  }

  if (!isElement)
    sendLogMessage(`Cannot find \`${querySelector}\` element!`, tabId);

  return isElement;
};

const waitAndClick = async (querySelector, tabId) => {
  if (await waitForElement(querySelector, tabId))
    await clickElement(querySelector, tabId);
};

let analysingState = false;

/*
 * Structure:
 * {
 *   tabId0: bool,
 *   tabId1: bool
 * }
 */
let analysingState = {};

const analyseGame = async (tab) => {
  /* After clicking on pageAction twice, second call won't be executed */
  if (analysingState[tab.id]) return;
  analysingState[tab.id] = true;

  try {
    await setLoadingState(true, tab.id);

    const [playerName] = await browser.tabs.executeScript(tab.id, {
      code: `document.querySelector('[data-test-element="user-tagline-username"]').textContent;`,
    });

    const gameId = tab.url.split("?")[0];

    let pgn = await getPGN(playerName, gameId, tab.id);

    await setLoadingState(false, tab.id);

    if (!pgn) {
      sendLogMessage(
        `Game with id ${gameId} not found! Performing manual fetching.`,
        tab.id
      );
      pgn = await getPGNManual(tab.id);
    }

    if (!pgn) {
      sendLogMessage(`Game not found!`, tab.id);
      analysingState[tab.id] = false;
    }

    /*
     * TODO: In the future the code below will be executed
     * with tabId from lichess tab.
     */

      if (await waitForElement("[name='pgn']")) {
        await browser.tabs.executeScript({
          code: `document.querySelector("[name='pgn']").value = \`${pgn}\`;`,
        });

        await waitAndClick(".submit");

        await waitAndClick("[for='analyse-toggle-ceval']");
      }
    }
  } catch (error) {
    sendLogMessage(error, tab.id);
  } finally {
    analysingState[tab.id] = false;
  }
};

browser.pageAction.onClicked.addListener(analyseGame);
