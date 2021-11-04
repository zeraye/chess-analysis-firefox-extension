browser.pageAction.onClicked.addListener(async () => {
  await browser.tabs.executeScript({
    code: `document.getElementsByClassName("download")[0].click();`,
  });

  await new Promise(r => setTimeout(r, 500));

  await browser.tabs.executeScript({
    code: `document.getElementsByClassName("board-tab-item-underlined-component share-menu-tab-selector-tab")[0].click();`,
  });

  await browser.tabs.executeScript({
    code: `e = document.querySelector("[name='isComputerAnalysisEnabled']"); if (e !== null) e.click();`,
  });

  setTimeout(async () => {
    const [pgn] = await browser.tabs.executeScript({
      code: `document.querySelector("[name='pgn']").value;`,
    });
    
    await browser.tabs.executeScript({
      code: `document.getElementsByClassName("icon-font-chess x ui_outside-close-icon")[0].click();`,
    });

    await browser.tabs.create({ url: "https://lichess.org/paste" });

    await new Promise(r => setTimeout(r, 500));

    const [logged] = await browser.tabs.executeScript({
      code: `!document.getElementById("form3-analyse").disabled;`
    });

    if (logged)
      await browser.tabs.executeScript({
        code: `document.getElementById("form3-analyse").click();`
      });

    await browser.tabs.executeScript({
      code:
        "document.getElementById('form3-pgn').value = `" + pgn + "`; document.getElementsByClassName('submit')[0].click();",
    });

    await new Promise(r => setTimeout(r, 2000));

    await browser.tabs.executeScript({
      code: `document.querySelector("[for='analyse-toggle-ceval']").click();`,
    });
  }, 500);
});
