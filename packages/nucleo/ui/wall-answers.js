// #767: answering from a card of the Mural. What the keys A, N and 1-9 mean, the buttons of a card, the hint of the keys (Dev only),
// #767: the copy of the command and the words of the toast. No DOM state here: wall.js owns what was answered and the undo.
// #767: "Segurar para confirmar" is not here on purpose: the declaration of the commands that ask for it is not built yet.

import { el, icon } from './dom.js';
import { leavesKeys } from './wall-keys.js';

/** Same as `--motion-move`: how long the card takes to leave before it is taken out of "Precisam de você". */
export const LEAVE_MS = 220;
/** How long the copied command says "Copiado" before the icon comes back. */
export const COPIED_MS = 1200;
export const MAX_OPTIONS = 9;

const COPY = 'Copiar comando';
const COPIED = 'Copiado';

/** Whether the person asked for less motion: then nothing slides and everything swaps. */
export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

/** What a card can be answered with, from its data: an allow and a deny for a permission, the options of a question. */
export function choicesOf(card) {
  const reason = card?.attention?.reason;
  if (reason === 'permission') return [{ kind: 'allow', label: 'Permitir', done: 'Permitido', verb: 'permitiu', key: 'A' }, { kind: 'deny', label: 'Negar', done: 'Negado', verb: 'negou', key: 'N' }];
  const options = Array.isArray(card?.activity?.options) ? card.activity.options.filter((o) => typeof o === 'string' && o.trim()).slice(0, MAX_OPTIONS) : [];
  if (reason === 'question') return options.map((label, i) => ({ kind: 'option', n: i + 1, label, done: 'Enviado', verb: 'escolheu', key: String(i + 1) }));
  return [];
}

/** The choice a keydown means, `{ kind: 'allow' | 'deny' }` or `{ kind: 'option', n }`, else `null`; never while typing or with a modifier. */
export function answerKeyOf(ev) {
  if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing || leavesKeys(ev.target)) return null;
  if (ev.key === 'a' || ev.key === 'A') return { kind: 'allow' };
  if (ev.key === 'n' || ev.key === 'N') return { kind: 'deny' };
  return /^[1-9]$/.test(ev.key) ? { kind: 'option', n: Number(ev.key) } : null;
}

/** The sentence of the toast: "Você permitiu em <title>", "Você escolheu <option> em <title>". */
export const toastText = (choice, title) => (choice.kind === 'option' ? `Você ${choice.verb} ${choice.label} em ${title}` : `Você ${choice.verb} em ${title}`);

/** The buttons of the card, one per choice; `on(choice, button)` runs the answer. */
export function answerButtons(choices, on) {
  return choices.map((c) => {
    const attrs = { type: 'button', class: 'btn outline wall-answer', 'data-answer': c.kind, 'aria-keyshortcuts': c.key };
    if (c.kind === 'option') attrs['data-option'] = String(c.n);
    const b = el('button', attrs, c.label);
    b.addEventListener('click', () => on(c, b));
    return b;
  });
}

/** The hint at the corner of the card; it is drawn only in Dev. */
export function keyHint(choices) {
  if (!choices.length) return null;
  const options = choices[0].kind === 'option';
  const parts = options ? [el('kbd', { class: 'wall-key' }, '1'), ' a ', el('kbd', { class: 'wall-key' }, String(choices.length))] : [el('kbd', { class: 'wall-key' }, 'A'), ' permite · ', el('kbd', { class: 'wall-key' }, 'N'), ' nega'];
  return el('span', { class: 'wall-hint', 'aria-hidden': 'true' }, ...parts);
}

/** The icon on the command block: copies `text`, becomes a check with "Copiado" for COPIED_MS, then returns. */
export function copyButton(text) {
  const label = el('span', { class: 'wall-copy-text' });
  const b = el('button', { type: 'button', class: 'btn ghost sm wall-copy', 'aria-label': COPY, title: COPY }, icon('copy'), label);
  let timer = null;
  const back = () => {
    b.removeAttribute('data-copied');
    b.setAttribute('aria-label', COPY);
    b.setAttribute('title', COPY);
    label.textContent = '';
    b.replaceChildren(icon('copy'), label);
  };
  b.addEventListener('click', async () => {
    let said = COPIED;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      said = 'Não deu para copiar';
    }
    clearTimeout(timer);
    b.setAttribute('data-copied', said === COPIED ? 'true' : 'false');
    b.setAttribute('aria-label', said);
    b.setAttribute('title', said);
    label.textContent = said;
    b.replaceChildren(icon(said === COPIED ? 'done' : 'error'), label);
    timer = setTimeout(back, COPIED_MS);
    timer?.unref?.();
  });
  return b;
}
