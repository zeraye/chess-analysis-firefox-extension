(() => {
  const loadingDiv = document.createElement("div");
  loadingDiv.textContent = "🔍 Analysing game...";
  loadingDiv.setAttribute("class", "cal-loading");
  document.body.appendChild(loadingDiv);
})();

/* Why this line is necessary? */
/* https://stackoverflow.com/a/44774834 */
undefined;
