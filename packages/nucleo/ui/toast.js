// #767: the toast of an answer: a text, one action ("Desfazer") and a line of 2 px that empties in TOAST_MS. It waits for who is
// #767: reading (WCAG 2.2.1): the mouse over it or the focus inside it pauses the clock, and leaving resumes with the time that was left.
// #767: the pause is the script's, so it holds with `prefers-reduced-motion` too, where the CSS hides the line. One toast at a time.

import { el } from './dom.js';

export const TOAST_MS = 6000;

/** The toast region over `host` (a status region) and its `push({ text, action: { label, onClick } })`. */
export function createToasts({ host }) {
  let current = null;

  function dismiss(entry) {
    if (!entry || entry.gone) return;
    entry.gone = true;
    clearTimeout(entry.timer);
    entry.node.remove();
    if (current === entry) current = null;
  }

  function push({ text, action = null, ms = TOAST_MS }) {
    dismiss(current);
    const undo = action ? el('button', { type: 'button', class: 'btn ghost sm wall-undo', 'data-toast': 'undo' }, action.label) : null;
    const node = el('div', { class: 'wall-notice wall-toast' }, el('span', { class: 'wall-notice-text' }, text), undo, el('span', { class: 'wall-toast-line', 'aria-hidden': 'true' }));
    node.style.setProperty('--toast-ms', `${ms}ms`);
    const entry = { node, timer: null, left: ms, from: 0, hover: false, focus: false, gone: false };

    const run = () => {
      entry.from = Date.now();
      entry.timer = setTimeout(() => dismiss(entry), entry.left);
      entry.timer?.unref?.();
    };
    const hold = () => {
      if (node.getAttribute('data-paused') === 'true') return;
      clearTimeout(entry.timer);
      entry.left = Math.max(0, entry.left - (Date.now() - entry.from));
      node.setAttribute('data-paused', 'true');
    };
    const release = () => {
      if (entry.hover || entry.focus || entry.gone) return;
      node.removeAttribute('data-paused');
      run();
    };
    node.addEventListener('mouseenter', () => ((entry.hover = true), hold()));
    node.addEventListener('mouseleave', () => ((entry.hover = false), release()));
    node.addEventListener('focusin', () => ((entry.focus = true), hold()));
    node.addEventListener('focusout', (ev) => {
      if (ev.relatedTarget && node.contains(ev.relatedTarget)) return;
      entry.focus = false;
      release();
    });
    undo?.addEventListener('click', () => {
      dismiss(entry);
      action.onClick();
    });
    current = entry;
    host.append(node);
    run();
    return { node, dismiss: () => dismiss(entry) };
  }

  return { push, clear: () => dismiss(current) };
}
