// The menu of "Opções da conta" (ADR-0028): the link to Conexões and the port of the core.
// It also holds the arrow of the outdated núcleo (#754, decision 0029): one link per remote whose núcleo is older than the app, with the
// arrow and the words, and a dot on the button that the name of the button says too (the dot is not only a color).

import { el, icon } from './dom.js';
import { CORE_OUTDATED_LABEL } from './screens/machine-core-format.js';

const BUTTON_NAME = 'Opções da conta';
const MACHINE_ROUTE = /^\/ui\/machines\/[a-z0-9][a-z0-9-]{0,63}$/;

export function createAccountMenu({ button, menu, doc = document }) {
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', menu.id);
  const dot = button.querySelector?.('.cc-ibtn-dot') ?? null;

  const isOpen = () => !menu.hidden;

  function set(open) {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }

  function open() {
    set(true);
  }

  function close({ restoreFocus = true } = {}) {
    if (!isOpen()) return;
    set(false);
    if (restoreFocus) button.focus();
  }

  button.addEventListener('click', () => (isOpen() ? close() : open()));
  doc.addEventListener('click', (ev) => {
    if (!isOpen() || !(ev.target instanceof Element) || menu.contains(ev.target) || button.contains(ev.target)) return;
    close({ restoreFocus: false });
  });
  // ADR-0028: a focusout with nowhere to go is a click Safari does not focus, not a Tab, so only Tab closes the menu.
  let tabbed = false;
  for (const node of [button, menu]) node.addEventListener('keydown', (ev) => void (tabbed = ev.key === 'Tab'));
  function left(ev) {
    const to = ev.relatedTarget;
    const byTab = tabbed;
    tabbed = false;
    if (!isOpen()) return;
    if (to instanceof Element ? menu.contains(to) || button.contains(to) : !byTab) return;
    close({ restoreFocus: false });
  }
  button.addEventListener('focusout', left);
  menu.addEventListener('focusout', left);
  // ADR-0028: inside the drawer it closes right after and takes the focus to its own button.
  menu.addEventListener('click', (ev) => {
    if (ev.target instanceof Element && ev.target.closest('a[href]')) close();
  });
  /** Draws the remotes whose núcleo is older than the app (`[{ id, label, route }]`) before the other items; the focus stays on the link of the same machine. */
  function setCoreOutdated(list) {
    const rows = (Array.isArray(list) ? list : []).filter((m) => m && typeof m.id === 'string' && typeof m.route === 'string' && MACHINE_ROUTE.test(m.route));
    const held = menu.contains(doc.activeElement) ? doc.activeElement.getAttribute?.('data-core-outdated') : null;
    const links = rows.map((m) => {
      const name = typeof m.label === 'string' && m.label ? m.label : 'Máquina remota';
      return el(
        'a',
        { class: 'cc-menu-item cc-menu-outdated', href: m.route, 'data-core-outdated': m.id },
        icon('arrow-up-circle'),
        el('span', { class: 'cc-menu-name', title: name }, name),
        el('span', { class: 'cc-menu-note' }, CORE_OUTDATED_LABEL),
      );
    });
    menu.replaceChildren(...links, ...[...menu.children].filter((node) => !node.hasAttribute?.('data-core-outdated')));
    if (held !== null && held !== undefined) links.find((a) => a.getAttribute('data-core-outdated') === held)?.focus({ preventScroll: true });
    if (dot) dot.hidden = links.length === 0;
    button.setAttribute('aria-label', links.length ? `${BUTTON_NAME}, ${CORE_OUTDATED_LABEL.toLowerCase()}` : BUTTON_NAME);
  }

  return { isOpen, open, close, setCoreOutdated };
}
