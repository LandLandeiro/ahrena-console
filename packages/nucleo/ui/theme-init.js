// ADR-0028: classic script in <head>, because the content policy forbids an inline one; it sets the saved theme and the saved mode (#754) before the first paint.
(function () {
  try {
    var saved = localStorage.getItem('ahrena-console-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) {
    // ADR-0028: no localStorage, the page follows the system.
  }
  try {
    var mode = localStorage.getItem('ahrena-console-mode');
    if (mode === 'dev' || mode === 'project') document.documentElement.setAttribute('data-mode', mode);
  } catch (e) {
    // #754: no localStorage, the page opens in Dev.
  }
})();
