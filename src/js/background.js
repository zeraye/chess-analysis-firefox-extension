/**
 * Manage displaying loading animation.
 * @param {boolean} active
 * @param {number} tabId
 */
const setLoadingState = async (active, tabId) => {
  // Sometimes content_script won't load at all. Omit all errors that uses loading div (.cal-loading)
  try {
    await browser.tabs.executeScript(tabId, {
      code: `document.querySelector(".cal-loading").style.display = ${active} ? "flex" : "none";`,
    });
  } catch {}
};

/**
 * Send logs to browser console.
 * @param {string} message
 * @param {number} tabId
 */
const sendLogMessage = async (message, tabId) => {
  await browser.tabs.executeScript(tabId, {
    code: `console.log("[Chess.com analyse at lichess]: ${message}");`,
  });
};

/**
 * Wrapper for fetch api with error support.
 * @param {string} url
 * @param {number} tabId
 * @returns {Promise<any>|null}
 */
const fetchJSON = async (url, tabId) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Error when attempting to fetch resource.");
    }
    return response.json();
  } catch (error) {
    sendLogMessage(error, tabId);
    return null;
  }
};

/**
 * Portable Game Notation (PGN) is a standard plain text format
 * for recording chess games, which can be read by humans
 * and is also supported by most chess software.
 * Try to get gamePGN by searching all player's games.
 * @param {string} playerName
 * @param {string} gameId
 * @param {number} tabId
 * @param {number} timeLimit
 * @param {number} prefetchSize
 * @returns {Promise<string>|null}
 */
const getPGN = async (
  playerName,
  gameId,
  tabId,
  timeLimit = 3000,
  prefetchSize = 3
) => {
  const startTime = +new Date();
  try {
    const archives = (
      await fetchJSON(
        `https://api.chess.com/pub/player/${playerName}/games/archives`,
        tabId
      )
    ).archives;
    /*
     * Archives are given from the oldest to the most recet games.
     * Thus iterating from the last one (the most recent) is usually better,
     * because players usually want to analyse their most recent games.
     * Probably, you will find wanted game within last N game archives.
     */
    const gameArchivesFetchesLastN = archives
      .slice(-prefetchSize)
      .map((url) => fetchJSON(url, tabId));
    const gameArchivesFetchesRest = archives
      .slice(0, -prefetchSize)
      .map((url) => fetchJSON(url, tabId));

    /*
     * Try to find the game within last N game archives.
     */
    const gameArchivesLastN = await Promise.all(gameArchivesFetchesLastN);
    let pgn = findGameInGameArchives(
      gameArchivesLastN,
      gameId,
      startTime,
      timeLimit
    );
    if (pgn) {
      return pgn;
    }

    /*
     * Wanted game wasn't within last N game archives.
     * Search the rest of the game archives.
     */
    const gameArchivesRest = await Promise.all(gameArchivesFetchesRest);
    pgn = findGameInGameArchives(
      gameArchivesRest,
      gameId,
      startTime,
      timeLimit
    );
    return pgn;
  } catch (error) {
    sendLogMessage(error, tabId);
    return null;
  }
};

/**
 * Portable Game Notation (PGN) is a standard plain text format
 * for recording chess games, which can be read by humans
 * and is also supported by most chess software.
 * Try to get gamePGN by opening share element on the page.
 * This should be user after `getPGN()` fails.
 * @param {number} tabId
 * @returns {Promise<string>|null}
 */
const getPGNManual = async (tabId) => {
  await waitAndClick(".share", tabId);
  await waitAndClick(".board-tab-item-underlined-component", tabId);

  if (await waitForElement(".share-menu-tab-pgn-toggle", tabId)) {
    await browser.tabs.executeScript(tabId, {
      code: `document.querySelector(".share-menu-tab-pgn-toggle input").checked = true;`,
    });
  }

  if (await waitForElement("[name='pgn']", tabId)) {
    const [pgn] = await browser.tabs.executeScript(tabId, {
      code: `document.querySelector("[name='pgn']").value;`,
    });
    await waitAndClick(".ui_outside-close-component", tabId);

    return pgn;
  }

  return null;
};

/**
 * Click element on the page.
 * @param {string} querySelector
 * @param {number} tabId
 */
const clickElement = async (querySelector, tabId) => {
  await browser.tabs.executeScript(tabId, {
    code: `document.querySelector("${querySelector}").click();`,
  });
};

/**
 * Wait for element to appear on the page.
 * @param {string} querySelector
 * @param {number} tabId
 * @param {number} timeLeft
 * @param {number} retryDelay
 * @returns {Promise<boolean>|null}
 */
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

  if (!isElement) {
    sendLogMessage(`Cannot find \`${querySelector}\` element!`, tabId);
  }

  return isElement;
};

/**
 * Wait for element and click on it when found
 * @param {string} querySelector
 * @param {number} tabId
 */
const waitAndClick = async (querySelector, tabId) => {
  if (await waitForElement(querySelector, tabId)) {
    await clickElement(querySelector, tabId);
  }
};

/**
 * Analyse PGN on the lichess page.
 * @param {number} tabId
 * @param {string} pgn
 * @param {boolean} flipToBlack
 */
const lichessAnalyse = async (tabId, pgn, flipToBlack = false) => {
  if (!waitForElement("[name='analyse']", tabId)) {
    return;
  }

  const [loggedIn] = await browser.tabs.executeScript(tabId, {
    code: `!document.querySelector("[name='analyse']").disabled;`,
  });
  if (loggedIn) {
    await waitAndClick("[name='analyse']", tabId);
  }

  if (!waitForElement("[name='pgn']", tabId)) {
    return;
  }

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
    status = (await browser.tabs.get(tabId)).status;
  }

  if (waitForElement("#analyse-toggle-ceval", tabId)) {
    const [localEval] = await browser.tabs.executeScript(tabId, {
      code: `document.querySelector("#analyse-toggle-ceval").checked;`,
    });
    if (!localEval) {
      await waitAndClick("[for='analyse-toggle-ceval']", tabId);
    }
  }

  // If the user played as black, flip the board (by opening /black)
  if (!flipToBlack) {
    return;
  }
  browser.tabs.get(tabId).then((tab) => {
    const newUrl = tab.url + "/black";
    browser.tabs.update(tab.id, { url: newUrl });
  });
};

/**
 * Extract the game ID using the regex for URL.
 * @param {string} url
 * @returns {number|null}
 */
const extractGameId = (url) => {
  /* Regular expression to match the game ID */
  const regex = /https?:\/\/(?:[^./?#]+\.)*chess\.com\/(?:[^./?#]+\/)*(\d+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
};

/**
 * Find game by ID in the game archives.
 * @param {object} gameArchives
 * @param {string} gameId
 * @param {number} startTime
 * @param {number} timeLimit
 * @returns {string|null}
 */
const findGameInGameArchives = (gameArchives, gameId, startTime, timeLimit) => {
  for (let i = 0; i < gameArchives.length; i++) {
    const games = gameArchives[i].games;
    for (let j = 0; j < games.length; j++) {
      if (extractGameId(games[j].url) === gameId) {
        return games[j].pgn;
      }
    }
    const currentTime = +new Date();
    if (currentTime - startTime > timeLimit) {
      throw new Error("Exceeded time limit!");
    }
  }
  return null;
};

/**
 * Get black player username.
 * @param {string} pgn
 * @returns {string|null}
 */
const getBlackPlayer = (pgn) => {
  const blackPlayerRegex = /\[Black\s+"([^"]+)"\]/;
  const match = pgn.match(blackPlayerRegex);

  return match && match.length > 1 ? match[1] : null;
};

/**
 * Set of tabIds that are in analysing state
 * @type {Set<boolean,number>}
 */
let analysingState = new Set();

/**
 * Get chess.com game and analyse in on lichess.
 * @param {number} tab
 */
const analyseGame = async (tab) => {
  /* After clicking on pageAction twice, second call won't be executed */
  if (analysingState.has(tab.id)) {
    return;
  }
  analysingState.add(tab.id);

  try {
    await setLoadingState(true, tab.id);

    const [topPlayerName] = await browser.tabs.executeScript(tab.id, {
      code: `document.querySelector('.user-username-component').textContent;`,
    });

    const gameURL = tab.url.split("?")[0];
    const gameId = extractGameId(gameURL);
    let pgn = null;

    if (gameId) {
      pgn = await getPGN(topPlayerName, gameId, tab.id);
    }

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
      return;
    }

    let lichessTab = await browser.tabs.create({
      url: "https://lichess.org/paste",
    });
    await lichessAnalyse(
      lichessTab.id,
      pgn,
      getBlackPlayer(pgn) !== topPlayerName
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
