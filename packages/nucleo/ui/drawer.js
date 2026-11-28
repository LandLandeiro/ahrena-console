// The drawer (ADR-0028): below 860 px the bar is out of the tab until the menu button opens it; crossing 860 px clears the state and takes no focus.

export const DRAWER_QUERY = '(max-width: 859px)';

export function createDrawer({ button, side, scrim, background, closeButton = null, count = button.querySelector?.('.cc-nav-tag') ?? null, media = globalThis.matchMedia(DRAWER_QUERY), firstItem = () => side.querySelector('#nav a[href]') }) {
  let opened = false;

  function paint() {
    side.inert = media.matches && !opened;
    if (opened) side.setAttribute('data-open', '');
    else side.removeAttribute('data-open');
    for (const node of background) node.inert = opened;
    scrim.hidden = !opened;
    button.setAttribute('aria-expanded', String(opened));
  }

  function open({ keyboard = false } = {}) {
    if (!media.matches || opened) return;
    opened = true;
    paint();
    // ADR-0028: a pointer open keeps the list where it was; whoever opened by keyboard (a click with detail 0) gets the first item in view.
    firstItem()?.focus({ preventScroll: !keyboard });
  }

  function close() {
    if (!opened) return;
    opened = false;
    paint();
    button.focus();
  }

  // ADR-0028: the same waiting tag of the Mural, on the button while the bar is out of sight; the name says it once.
  function waiting(next) {
    const text = next?.text ?? '';
    if (count) {
      count.textContent = text;
      count.hidden = !text;
    }
    button.setAttribute('aria-label', text ? `Menu, ${text}` : 'Menu');
  }

  button.addEventListener('click', (ev) => (opened ? close() : open({ keyboard: ev.detail === 0 })));
  closeButton?.addEventListener('click', () => close());
  scrim.addEventListener('click', () => close());
  side.addEventListener('click', (ev) => {
    if (ev.target instanceof Element && ev.target.closest('a[href]')) close();
  });
  media.addEventListener?.('change', () => {
    opened = false;
    paint();
  });
  paint();
  return { isOpen: () => opened, open, close, waiting };
}
