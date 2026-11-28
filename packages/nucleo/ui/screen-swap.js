// The switch of screen (issue 765): the screen that was open stays, inert, over the area until the new one has its
// data or 300 ms pass; only then does a skeleton with the shape of the new screen take its place. The new screen
// mounts in the real area underneath, so its focus, scroll and measures are the ones it always had.

import { skeleton as shapeSkeleton } from './skeletons.js';

export const SWAP_DELAY_MS = 300;

/** A direct child that says it is still loading is not data. */
const hasData = (area) => area.children.length > 0 && ![...area.children].some((c) => c.getAttribute('aria-busy') === 'true');

function watchArea(area, check) {
  if (typeof MutationObserver !== 'function') return () => {};
  const observer = new MutationObserver(check);
  observer.observe(area, { childList: true });
  return () => observer.disconnect();
}

/** `begin(screenId)` when a screen starts to open; `settle()` when it has mounted or failed. */
export function createScreenSwap({ area, skeleton = shapeSkeleton, setTimer = setTimeout, clearTimer = clearTimeout, delayMs = SWAP_DELAY_MS, observe = watchArea }) {
  let ghost = null;
  let timer = null;
  let stopWatching = () => {};
  let wanted = null;

  function settle() {
    if (!ghost) return;
    clearTimer(timer);
    stopWatching();
    ghost.remove();
    ghost = timer = null;
    stopWatching = () => {};
  }

  function begin(screenId) {
    wanted = screenId;
    if (ghost) {
      // Still waiting for an earlier screen: the person keeps seeing the one they left, not a half-built one.
      area.replaceChildren();
      return;
    }
    ghost = document.createElement('div');
    ghost.setAttribute('class', 'cc-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    ghost.style.setProperty('top', `${area.offsetTop ?? 0}px`);
    ghost.append(...area.childNodes);
    area.parentNode?.append(ghost);
    timer = setTimer(() => ghost?.replaceChildren(skeleton(wanted)), delayMs);
    stopWatching = observe(area, () => hasData(area) && settle());
  }

  return { begin, settle };
}
