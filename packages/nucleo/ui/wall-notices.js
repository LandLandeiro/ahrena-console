// ADR-0028, issue 758: the notice in the corner of the Mural. A polite status region, built once; each notice stays NOTICE_MS,
// at most NOTICE_MAX are stacked (the oldest leaves first) and none of them takes the focus. The entrance is in wall.css and
// only runs without `prefers-reduced-motion`.

import { el } from './dom.js';

export const NOTICE_MS = 6000;
export const NOTICE_MAX = 3;

/** The region and its `push({ kind, text, href })`; `linkLabel` is the text of the link to the session. `clear` drops what is shown. */
export function createNotices({ linkLabel }) {
  const node = el('div', { class: 'wall-notices', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
  const shown = [];

  function drop(entry) {
    clearTimeout(entry.timer);
    entry.item.remove();
    const at = shown.indexOf(entry);
    if (at >= 0) shown.splice(at, 1);
  }

  function push({ kind, text, href = null }) {
    const item = el('div', { class: 'wall-notice', 'data-kind': kind }, el('span', { class: 'wall-notice-text' }, text), href ? el('a', { class: 'wall-notice-link', href }, linkLabel) : null);
    const entry = { item, timer: null };
    entry.timer = setTimeout(() => drop(entry), NOTICE_MS);
    shown.push(entry);
    node.append(item);
    while (shown.length > NOTICE_MAX) drop(shown[0]);
  }

  return { node, push, clear: () => [...shown].forEach(drop) };
}
