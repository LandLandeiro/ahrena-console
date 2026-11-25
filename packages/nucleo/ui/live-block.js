// The "Ao vivo" block of the bar footer (issue 750): the state line (the live region), and the note "N máquinas · versão X".
//
// The nodes are built once and only their text and attributes change. A live region that is built again is not announced,
// and a button that is built again loses the focus the person is on (the version button opens the update panel).

import { el } from './dom.js';

export const LIVE_LABELS = { connecting: 'Conectando', live: 'Ao vivo', offline: 'Sem conexão' };

export const machinesText = (n) => (n === 1 ? '1 máquina' : `${n} máquinas`);

/**
 * `onVersion` is the click of the version button. `draw({ state, machines, version })` takes the state of the live
 * stream, the machine count (or null) and the version button's `{ label, title, fresh, expanded }` (or null).
 */
export function createLiveBlock({ node, onVersion = () => {}, doc = document }) {
  const dot = el('span', { class: 'cc-live-dot', 'aria-hidden': 'true' });
  const region = el('b', { 'aria-live': 'polite' }, LIVE_LABELS.connecting);
  const machinesNode = el('span');
  const label = el('span', { class: 'up-label' });
  const button = el('button', { type: 'button', class: 'version up-version', 'aria-haspopup': 'dialog', onClick: () => onVersion() }, label);
  let hasVersion = false;
  const note = el('div', { class: 'cc-live-note', hidden: true });
  node.replaceChildren(el('div', { class: 'cc-live-line' }, dot, region), note);
  let shape = '';

  function setText(target, text) {
    if (target.textContent !== text) target.textContent = text;
  }

  function setAttribute(target, name, value) {
    if (value === null || value === undefined || value === false) target.removeAttribute(name);
    else if (target.getAttribute(name) !== String(value === true ? '' : value)) target.setAttribute(name, value === true ? '' : String(value));
  }

  function drawVersion(version) {
    // The new-version dot goes before the label and is added or taken away.
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
    // The note's children change only when its shape does; the focus the person has on the button is kept through it.
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

  return { draw, focusVersion: () => hasVersion && button.focus() };
}
