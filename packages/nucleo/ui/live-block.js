// The "Ao vivo" block of the bar footer (issue 750): the state line (the live region), and the note "N máquinas · versão X".

import { el, icon } from './dom.js';

export const LIVE_LABELS = { connecting: 'Conectando', live: 'Ao vivo', offline: 'Sem conexão' };

export const machinesText = (n) => (n === 1 ? '1 máquina' : `${n} máquinas`);

/**
 * Draws into `node`. `makeVersion()` builds the version button; it is built again only when `versionKey` changes, so
 * a redraw with the same inputs keeps the node (and the focus) the person is on.
 */
export function createLiveBlock({ node }) {
  let last = null;
  function draw({ state, machines, versionKey, makeVersion }) {
    node.dataset.state = state;
    const key = JSON.stringify([state, machines, versionKey]);
    if (key === last) return;
    last = key;
    const version = makeVersion();
    const parts = [];
    if (Number.isInteger(machines) && machines > 0) parts.push(el('span', {}, machinesText(machines)));
    if (version) parts.push(version);
    node.replaceChildren(
      el('div', { class: 'cc-live-line' }, icon(state === 'offline' ? 'offline' : 'live'), el('b', { 'aria-live': 'polite' }, LIVE_LABELS[state] ?? LIVE_LABELS.connecting)),
      ...(parts.length ? [el('div', { class: 'cc-live-note' }, ...parts.flatMap((p, i) => (i ? [' · ', p] : [p])))] : []),
    );
  }
  return { draw };
}
