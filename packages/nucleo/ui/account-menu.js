// The small menu of "Opções da conta" (issue 750): the link to Conexões and the port of the core. Nothing else.
// Closing by Escape is in escape.js, which gives the focus back to the button through `close()`.

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

  /** `restoreFocus` is false when the person already moved on by clicking somewhere else. */
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
  // Tab (or Shift+Tab) out of the menu and the button closes it; the focus stays where the person put it. A focusout with
  // nowhere to go is a click on a button the browser does not focus (Safari), not a Tab, so it keeps the menu open.
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
  // A link of the menu closes it and the focus goes back to the button; inside the drawer the drawer closes right after and takes it to its own button (#750).
  menu.addEventListener('click', (ev) => {
    if (ev.target instanceof Element && ev.target.closest('a[href]')) close();
  });
  return { isOpen, open, close };
}
