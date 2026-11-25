// The drawer (ADR-0028): below 860 px the bar is out of the tab until the menu button opens it; crossing 860 px clears the state and takes no focus.

export const DRAWER_QUERY = '(max-width: 859px)';

export function createDrawer({ button, side, scrim, background, media = globalThis.matchMedia(DRAWER_QUERY), firstItem = () => side.querySelector('#nav a[href]') }) {
  let opened = false;

  function paint() {
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

  function close() {
    if (!opened) return;
    opened = false;
    paint();
    button.focus();
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
