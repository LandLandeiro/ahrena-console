// The theme button (#750, ADR-0028): light, dark, or the system's until the person chooses.
// The choice is kept in localStorage and put on <html> as `data-theme`; theme-init.js does the same before the first paint.

import { icon } from './dom.js';

export const THEME_KEY = 'ahrena-console-theme';
const LABELS = { dark: 'Usar tema claro', light: 'Usar tema escuro' };

const isTheme = (value) => value === 'light' || value === 'dark';

/** The storage of the page, or `null` when the browser denies it. */
export function pageStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Wires `button` to switch the theme of `root`. The label says what the click does ("Usar tema claro" on the dark
 * theme) and follows the system while there is no choice.
 */
export function createTheme({ button, root = document.documentElement, storage = pageStorage(), media = globalThis.matchMedia?.('(prefers-color-scheme: dark)') ?? { matches: true } }) {
  let choice = null;
  try {
    const saved = storage?.getItem(THEME_KEY);
    if (isTheme(saved)) choice = saved;
  } catch {
    // Denied: the choice lives in memory until the page closes.
  }

  const effective = () => choice ?? (media.matches ? 'dark' : 'light');

  function draw() {
    if (choice) root.setAttribute('data-theme', choice);
    else root.removeAttribute('data-theme');
    const now = effective();
    button.setAttribute('aria-label', LABELS[now]);
    button.setAttribute('title', LABELS[now]);
    button.replaceChildren(icon(now === 'dark' ? 'sun' : 'moon'));
  }

  button.setAttribute('type', 'button');
  button.addEventListener('click', () => {
    choice = effective() === 'dark' ? 'light' : 'dark';
    try {
      storage?.setItem(THEME_KEY, choice);
    } catch {
      // Full or denied: the page still switches.
    }
    draw();
  });
  media.addEventListener?.('change', draw);
  draw();
  return { effective };
}
