/*
 * loadingDiv is a global variable, because I wasn't able
 * to check if typeof loadingDiv === "undefined".
 * Normally typeof don't need variable to be initialized,
 * but for some reason I got an error that there is
 * no such variable as loadingDiv.
 * Firefox version: 106.0.2 (64-bit) on Ubuntu 20.04.1
 */
(() => {
  const loadingDiv = document.createElement("div");
  loadingDiv.textContent = "🔍 Analysing game...";
  loadingDiv.setAttribute("class", "cal-loading");
  document.body.appendChild(loadingDiv);
})();

/* Why this line is necessary? */
/* https://stackoverflow.com/a/44774834 */
undefined;
