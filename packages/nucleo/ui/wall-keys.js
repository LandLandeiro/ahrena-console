// ADR-0028, issue 758: the keys of the Mural. J and K move the focus between the cards and the rows, Enter opens the one in focus
// (the focus lands on its link, which the platform opens) and ? shows the list. They never act while the person types (a field, a
// select, a text area, an editable area, a dialog) or with Ctrl, Meta or Alt, so the search on Cmd+K and the browser keep theirs.

import { el } from './dom.js';
import { openPopover, popoverFooter, trapFocus } from './popover.js';

/** The list the help shows: the keys and what each does. */
export const SHORTCUTS = [
  { keys: 'J', label: 'Próxima sessão' },
  { keys: 'K', label: 'Sessão anterior' },
  { keys: 'Enter', label: 'Abrir a sessão' },
  { keys: '?', label: 'Mostrar atalhos' },
];

const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Whether the key is the person's: the target is, or sits inside, a field, an editable area or a dialog. */
export function leavesKeys(target) {
  for (let n = target; n; n = n.parentNode) {
    if (FIELDS.has(n.tagName) || n.isContentEditable === true) return true;
    const editable = n.getAttribute?.('contenteditable');
    if (editable !== null && editable !== undefined && editable !== 'false') return true;
    const role = n.getAttribute?.('role');
    if (role === 'textbox' || role === 'dialog') return true;
  }
  return false;
}

/** `next`, `previous` or `help` for a keydown the Mural answers, else `null`. */
export function shortcutOf(ev) {
  if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return null;
  if (leavesKeys(ev.target)) return null;
  if (ev.key === '?') return 'help';
  if (ev.key === 'j' || ev.key === 'J') return 'next';
  if (ev.key === 'k' || ev.key === 'K') return 'previous';
  return null;
}

/** The index J or K lands on, from `at` (-1 when the focus is not on any item); it stops at the ends. */
export function stepIndex(count, at, step) {
  if (count <= 0) return -1;
  if (at < 0) return step > 0 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, at + step));
}

/** The "Atalhos" button and its popover; `toggle` is what the ? key calls. */
export function shortcutsButton() {
  const button = el('button', { type: 'button', class: 'btn outline', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-keyshortcuts': '?' }, 'Atalhos');
  const root = el('span', { class: 'ns' }, button);
  let handle = null;
  function toggle() {
    if (handle?.isOpen()) return handle.close();
    const list = el('dl', { class: 'pop-context wall-keys' }, ...SHORTCUTS.flatMap((s) => [el('dt', {}, el('kbd', { class: 'wall-key' }, s.keys)), el('dd', {}, s.label)]));
    const mine = openPopover({ trigger: button, host: root, title: 'Atalhos', label: 'Atalhos do mural', kind: 'shortcuts', content: [list], footer: popoverFooter({ cancel: { label: 'Fechar', onClick: () => handle?.close() } }), onClose: () => handle === mine && (handle = null) });
    handle = mine;
    trapFocus(mine.element);
  }
  button.addEventListener('click', toggle);
  return { node: root, toggle, close: () => handle?.close() };
}
