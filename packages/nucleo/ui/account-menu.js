// The menu of "Opções da conta" (ADR-0028): the link to Conexões and the port of the core.

export function createAccountMenu({ button, menu, doc = document }) {
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', menu.id);

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
  return { isOpen, open, close };
}
