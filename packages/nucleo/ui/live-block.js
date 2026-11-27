// The "Ao vivo" block (ADR-0028): nodes are built once, because a rebuilt live region is not announced and a rebuilt button loses the focus.

import { el } from './dom.js';

export const LIVE_LABELS = { connecting: 'Conectando', live: 'Ao vivo', offline: 'Sem conexão' };

/** Two blinks of the dot are at least this far apart. */
const BLINK_EVERY_MS = 2000;

export const machinesText = (n) => (n === 1 ? '1 máquina' : `${n} máquinas`);

/**
 * `onVersion` is the click of the version button. `draw({ state, machines, version })` takes the state of the live
 * stream, the machine count (or null) and the version button's `{ label, title, fresh, expanded }` (or null).
 */
export function createLiveBlock({ node, onVersion = () => {}, doc = document, now = Date.now }) {
  const dot = el('span', { class: 'cc-live-dot', 'aria-hidden': 'true' });
  const region = el('b', { 'aria-live': 'polite' }, LIVE_LABELS.connecting);
  const machinesNode = el('span');
  const label = el('span', { class: 'up-label' });
  const button = el('button', { type: 'button', class: 'version up-version', 'aria-haspopup': 'dialog', onClick: () => onVersion() }, label);
  let hasVersion = false;
  const note = el('div', { class: 'cc-live-note', hidden: true });
  node.replaceChildren(el('div', { class: 'cc-live-line' }, dot, region), note);
  let shape = '';
  let blinkedAt = -Infinity;

  function setText(target, text) {
    if (target.textContent !== text) target.textContent = text;
  }

  function setAttribute(target, name, value) {
    if (value === null || value === undefined || value === false) target.removeAttribute(name);
    else if (target.getAttribute(name) !== String(value === true ? '' : value)) target.setAttribute(name, value === true ? '' : String(value));
  }

  function drawVersion(version) {
    setText(label, version.label);
    const dot = button.querySelector('.up-dot');
    if (version.fresh && !dot) button.insertBefore(el('span', { class: 'up-dot', role: 'img', 'aria-label': 'versão nova' }), label);
    else if (!version.fresh && dot) dot.remove();
    setAttribute(button, 'title', version.title);
    setAttribute(button, 'aria-expanded', String(Boolean(version.expanded)));
    setAttribute(button, 'data-new', Boolean(version.fresh));
  }

  function draw({ state, machines, version }) {
    node.dataset.state = state;
    setText(region, LIVE_LABELS[state] ?? LIVE_LABELS.connecting);
    const hasMachines = Number.isInteger(machines) && machines > 0;
    if (hasMachines) setText(machinesNode, machinesText(machines));
    if (version) drawVersion(version);
    hasVersion = Boolean(version);
    const next = `${hasMachines}|${hasVersion}`;
    if (next !== shape) {
      shape = next;
      const focused = doc.activeElement === button;
      const parts = [...(hasMachines ? [machinesNode] : []), ...(version ? [button] : [])];
      note.replaceChildren(...parts.flatMap((p, i) => (i ? [' · ', p] : [p])));
      note.hidden = parts.length === 0;
      if (focused && version) button.focus();
    }
  }

  /**
   * The dot blinks once for an event of the live stream (motion 11), at most one blink every `BLINK_EVERY_MS`, and only
   * while live. The mark is taken off and put back after a layout read, so a second blink restarts the animation even when
   * the first left its mark (under reduced motion there is no animation, so no `animationend` to clean up).
   */
  function blink() {
    if (node.dataset.state !== 'live' || now() - blinkedAt < BLINK_EVERY_MS) return false;
    blinkedAt = now();
    dot.removeAttribute('data-blink');
    void dot.offsetWidth;
    dot.setAttribute('data-blink', '');
    return true;
  }

  return { draw, blink, focusVersion: () => hasVersion && button.focus() };
}
