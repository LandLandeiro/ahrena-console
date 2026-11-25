// The drawer (issue 750): below 860 px the bar leaves the frame and comes on top when the menu button asks.
// Open: the background is inert, the scrim shows and the focus goes to the first item. Closed: the bar is inert,
// so it is out of the tab. Any link of the bar closes it, and so does a route change of the shell (app.js). Crossing 860 px clears the state and takes no focus.

export const DRAWER_QUERY = '(max-width: 859px)';

export function createDrawer({ button, side, scrim, background, media = globalThis.matchMedia(DRAWER_QUERY), firstItem = () => side.querySelector('#nav a[href]') }) {
  let opened = false;

  function paint() {
    // Wide: a plain column, nothing inert. Narrow: the bar is reachable only while open.
    side.inert = media.matches && !opened;
    if (opened) side.setAttribute('data-open', '');
    else side.removeAttribute('data-open');
    for (const node of background) node.inert = opened;
    scrim.hidden = !opened;
    button.setAttribute('aria-expanded', String(opened));
  }

  function open() {
    if (!media.matches || opened) return;
    opened = true;
    paint();
    firstItem()?.focus();
  }

  /** `restoreFocus` is false when the window has just become wide: the person's focus stays where it is. */
  function close({ restoreFocus = true } = {}) {
    if (!opened) return;
    opened = false;
    paint();
    if (restoreFocus) button.focus();
  }

  button.addEventListener('click', () => (opened ? close() : open()));
  scrim.addEventListener('click', () => close());
  side.addEventListener('click', (ev) => {
    if (ev.target instanceof Element && ev.target.closest('a[href]')) close();
  });
  media.addEventListener?.('change', () => {
    opened = false;
    paint();
  });
  paint();
  return { isOpen: () => opened, open, close };
}
