// The tab row of a merged screen (decision 0029, #754): links to routes that already exist, at the top of the screen that
// received the merge. The shell mounts it in `#screen-tabs`, above the screen, so a screen redraws its own area without
// losing it; `tabsFor` (screens.js) says which tabs a screen has. A landmark with a label, `aria-current` on the current tab.

import { el } from './dom.js';

/** The row in `host`; `draw(tabs)` takes what `tabsFor` returns, and `null` empties and hides it. */
export function createScreenTabs({ host }) {
  function draw(set) {
    if (!set || !set.tabs?.length) {
      host.replaceChildren();
      host.hidden = true;
      return;
    }
    const links = set.tabs.map((t) => el('a', { class: 'cc-tab', href: t.route, 'aria-current': t.current ? 'page' : null }, t.label));
    host.replaceChildren(el('nav', { class: 'cc-tabs', 'aria-label': `Abas de ${set.label}` }, ...links));
    host.hidden = false;
  }
  return { draw };
}
