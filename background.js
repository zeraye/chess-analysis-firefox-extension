browser.pageAction.onClicked.addListener(async () => {
  await browser.tabs.executeScript({
    code: `document.getElementsByClassName("download")[0].click();`,
  });

  setTimeout(async () => {
    const [pgn] = await browser.tabs.executeScript({
      code: `document.getElementsByClassName("share-menu-tab-pgn-textarea")[0].value;`,
    });

    await browser.tabs.create({ url: "https://lichess.org/paste" });
    await browser.tabs.executeScript({
      code:
        "document.getElementById('form3-pgn').value = `" +
        pgn +
        "`; document.getElementsByClassName('submit')[0].click();",
    });
  }, 500);
});
