const setLoadingState = async (active, tabId) => {
  const [calExist] = await browser.tabs.executeScript(tabId, {
    code: `document.querySelector(".cal-loading") !== null;`,
  });

  if (!calExist) {
    await browser.tabs.executeScript(tabId, {
      file: "/src/js/createLoading.js",
    });
    await browser.tabs.insertCSS(tabId, { file: "/src/css/createLoading.css" });
  }

  await browser.tabs.executeScript(tabId, {
    code: `document.querySelector(".cal-loading").style.display = ${active} ? "flex" : "none";`,
  });
};

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

  if (await waitForElement("[name='pgn']", tabId)) {
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

const lichessAnalyse = async (tabId, pgn, flipToBlack = false) => {
  if (await waitForElement("[name='analyse']", tabId)) {
    const [loggedIn] = await browser.tabs.executeScript(tabId, {
      code: `!document.querySelector("[name='analyse']").disabled;`,
    });
    if (loggedIn) await waitAndClick("[name='analyse']", tabId);

    if (await waitForElement("[name='pgn']", tabId)) {
      await browser.tabs.executeScript(tabId, {
        code: `document.querySelector("[name='pgn']").value = \`${pgn}\`;`,
      });
      await waitAndClick(".submit", tabId);

      /*
       * Bugfix where status was loading and firefox threw
       * an error about invalid host permissions
       */
      let status = "loading";
      while (status === "loading") {
        let getting = await browser.tabs.get(tabId);
        status = getting.status;
      }

      if (await waitForElement("#analyse-toggle-ceval", tabId)) {
        const [localEval] = await browser.tabs.executeScript(tabId, {
          code: `document.querySelector("#analyse-toggle-ceval").checked;`,
        });
        if (!localEval)
          await waitAndClick("[for='analyse-toggle-ceval']", tabId);
      }

      // If the user played as black, flip the board (by opening /black)
      if (flipToBlack) {
        browser.tabs
          .get(tabId)
          .then((tab) => {
            const newUrl = tab.url + "/black";
            browser.tabs.update(tab.id, { url: newUrl });
          })
          .catch((error) => {
            console.error("Error:", error);
          });
      }
    }
  }
};

const getBlackPlayer = (pgn) => {
  const blackPlayerRegex = /\[Black\s+"([^"]+)"\]/;
  const match = pgn.match(blackPlayerRegex);

  return match && match.length > 1 ? match[1] : null;
};

/* Set of tabIds that are in analysing state */
let analysingState = new Set();

const analyseGame = async (tab) => {
  /* After clicking on pageAction twice, second call won't be executed */
  if (analysingState.has(tab.id)) return;
  analysingState.add(tab.id);

  try {
    await setLoadingState(true, tab.id);

    const [playerName] = await browser.tabs.executeScript(tab.id, {
      code: `document.querySelector('[data-test-element="user-tagline-username"]').textContent;`,
    });

    // get logged in user (needed to flip the board if the logged in user is black)
    const [loggedInUser] = await browser.tabs
      .executeScript({
        code: `document.getElementById('notifications-request')?.getAttribute("username") || null;`,
      })
      .catch(console.error);

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
      analysingState.delete(tab.id);
    }

    let lichessTab = await browser.tabs.create({
      url: "https://lichess.org/paste",
    });
    await lichessAnalyse(
      lichessTab.id,
      pgn,
      getBlackPlayer(pgn) === loggedInUser
    );
  } catch (error) {
    sendLogMessage(error, tab.id);
  }

  try {
    await setLoadingState(false, tab.id);
  } catch (error) {
    sendLogMessage(error, tab.id);
  } finally {
    analysingState.delete(tab.id);
  }
};

browser.pageAction.onClicked.addListener(analyseGame);
