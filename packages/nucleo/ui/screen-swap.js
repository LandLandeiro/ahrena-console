/* #765: the switch of screen. The screen that was open stays, inert, over the area until the new one has its
   data or 300 ms pass; only then does a skeleton with the shape of the new screen take its place. The new screen
   mounts in the real area underneath, so its focus, scroll and measures are the ones it always had. */

import { skeleton as shapeSkeleton } from './skeletons.js';

export const SWAP_DELAY_MS = 300;

/** #765: anything below the area that says it is still loading (Sessões and Histórico put it inside a body div) is not data, unless the screen marks what it painted with `data-swap-ready` (the seeded header of Detalhe). */
const hasData = (area) => area.children.length > 0 && (area.querySelector('[data-swap-ready]') !== null || !area.querySelector('[aria-busy="true"]'));

function watchArea(area, check) {
  if (typeof MutationObserver !== 'function') return () => {};
  const observer = new MutationObserver(check);
  observer.observe(area, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy'] });
  return () => observer.disconnect();
}

/** `begin(screenId)` when a screen starts to open; `mounted()` when its mount returned (it settles only if the area has data); `settle()` when it failed. `held()` says something else (the drawer) keeps the area inert. */
export function createScreenSwap({ area, skeleton = shapeSkeleton, setTimer = setTimeout, clearTimer = clearTimeout, delayMs = SWAP_DELAY_MS, observe = watchArea, held = () => false }) {
  let ghost = null;
  let timer = null;
  let stopWatching = () => {};
  let wanted = null;

  function settle() {
    if (!ghost) return;
    clearTimer(timer);
    stopWatching();
    ghost.remove();
    area.inert = held();
    ghost = timer = null;
    stopWatching = () => {};
  }

  function begin(screenId) {
    wanted = screenId;
    if (ghost) {
      // #765: still waiting for an earlier screen: the person keeps seeing the one they left, not a half-built one.
      area.replaceChildren();
      return;
    }
    area.inert = true;
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

  const mounted = () => { if (hasData(area)) settle(); };

  return { begin, settle, mounted };
}
