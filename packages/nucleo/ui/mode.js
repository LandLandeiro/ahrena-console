// The mode of the console (#754): Dev or Projeto. The button of the sidebar foot switches it; the choice is kept in the
// localStorage like the theme (theme.js) and theme-init.js sets `data-mode` on <html> before the first paint. The labels
// of the states (state-labels.js) and the Exibir choice (display.js) follow the mode; a screen that wants to redraw
// in place asks the shell for `ctx.onModeChange`, and the shell opens the screen again for one that does not.

import { icon } from './dom.js';
import { pageStorage } from './theme.js';
import { setStateLabelMode } from './state-labels.js';
import { setDisplayMode } from './display.js';

export const MODE_KEY = 'ahrena-console-mode';
export const MODES = Object.freeze(['dev', 'project']);
// The label says what the click does (#754).
const LABELS = Object.freeze({ dev: 'Ver como Projeto', project: 'Ver como Dev' });

let current = 'dev';
const listeners = new Set();

/** The current mode, `dev` or `project`. */
export const appMode = () => current;

/** Tells `listener(mode)` after every switch; returns the function that stops it. */
export function onModeChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The saved mode; `dev` for a missing or unknown value or a denied storage. */
export function readMode(storage = pageStorage()) {
  try {
    const saved = storage?.getItem(MODE_KEY);
    return MODES.includes(saved) ? saved : 'dev';
  } catch {
    return 'dev';
  }
}

/** Sets the mode on the page, the state labels and the display, and keeps it; `false` (and the mode stays) for anything else. */
export function setAppMode(value, { root = globalThis.document?.documentElement, storage = pageStorage(), persist = true } = {}) {
  if (!MODES.includes(value)) return false;
  current = value;
  root?.setAttribute('data-mode', value);
  setStateLabelMode(value);
  setDisplayMode(value);
  if (persist) {
    try {
      storage?.setItem(MODE_KEY, value);
    } catch {
      // ADR-0028, like the theme: a full or denied storage still switches the page.
    }
  }
  for (const l of [...listeners]) l(value);
  return true;
}

/** Wires `button` to switch the mode of `root`, and applies the saved one at once, before the first draw. */
export function createModeButton({ button, root = globalThis.document?.documentElement, storage = pageStorage() }) {
  function draw() {
    button.setAttribute('aria-label', LABELS[current]);
    button.setAttribute('title', LABELS[current]);
    button.replaceChildren(icon('briefcase'));
  }
  button.setAttribute('type', 'button');
  setAppMode(readMode(storage), { root, storage, persist: false });
  button.addEventListener('click', () => {
    setAppMode(current === 'dev' ? 'project' : 'dev', { root, storage });
    draw();
  });
  draw();
}
