// ADR-0028: classic script in <head>, because the content policy forbids an inline one; it sets the saved theme before the first paint.
(function () {
  try {
    var saved = localStorage.getItem('ahrena-console-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) {
    // ADR-0028: no localStorage, the page follows the system.
  }
})();
