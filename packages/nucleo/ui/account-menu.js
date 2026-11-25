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
  menu.addEventListener('click', (ev) => {
    if (ev.target instanceof Element && ev.target.closest('a[href]')) close({ restoreFocus: false });
  });
  return { isOpen, open, close };
}
