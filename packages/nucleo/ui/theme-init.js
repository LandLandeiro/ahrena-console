// #750: classic script, loaded in <head> before the style sheets (the content policy forbids an inline one).
// It puts the saved theme on <html> before the first paint; without a choice the page follows the system.
(function () {
  try {
    var saved = localStorage.getItem('ahrena-console-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) {
    // localStorage is off or denied: the page follows the system.
  }
})();
