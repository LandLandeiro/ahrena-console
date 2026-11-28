/* "Planejar" on the work board (issue 467, issue 508, wireframes 465-2, 465-6 and 467-1): the planning parts of a
card and of the issue panel, the confirmation anchored on the card and the missing-folder popover.

Pure render functions: data and handlers in, nodes out. No fetch, no state: the screen decides when the
confirmation is open, calls POST /api/work/plan and hands the answer back. The styles are in
`work-board-issue-panel.css` (classes `wb-plan-`). */

import { el, icon } from '../dom.js';
import { OPEN_IN_KEY, OPEN_TARGETS, destinationLabel, popoverContext, popoverFooter, popoverShell, segmented } from '../popover.js';

/** The types "Planejar" is offered for: epics, initiatives and plan steps are planned elsewhere or not at all. */
export const PLANNABLE_TYPES = new Set(['story', 'task', 'bug', 'spike']);

const ref = (n) => `#${n}`;
const FAILED_FALLBACK = 'O planejamento terminou sem plano';
const FOLDER_TITLE = 'Falta a pasta do repositório nesta máquina';

/**
 * What the card offers: `hidden` (no action), `planning` ("planejando…"), `failed` (back to the action, with the reason),
 * `planned` (a plan is out) or `unplanned`.
 */
export function planState(card) {
  if (!PLANNABLE_TYPES.has(card?.type) || card.column !== 'planning') return 'hidden';
  if (card.planning?.state === 'running') return 'planning';
  if (card.planning?.state === 'failed') return 'failed';
  return card.plan?.steps > 0 ? 'planned' : 'unplanned';
}

/**
 * issue 595: the one line that takes the place of the plan and run actions on a repository the owner has not trusted.
 * `place` is `card` (the short form, where space is tight) or `panel` (the full form, naming the owner of the repository).
 */
export function untrustedLine(card, place = 'card') {
  const owner = String(card?.repo ?? '').split('/')[0] || 'Este dono';
  const text = place === 'panel' ? `Repositório fora da lista de confiança: ${owner} não pode Planejar nem Executar plano aqui` : 'Fora da lista de confiança: só leitura';
  return el('div', { class: 'wb-untrusted', role: 'note', 'data-state': 'untrusted' }, icon('lock'), el('span', {}, text));
}

/**
 * The planning parts of a card (and of the panel): `badge` ("planejando…"), `note` (the failure and its reason, in red)
 * and `actions` (Planejar as the one primary action, Replanejar as a link in the line below). `onPlan` and `onReplan`
 * get the card and the button pressed, to anchor the confirmation on it. While planning there is no action. `lead` is a node
 * placed before the links of a card with a plan: the primary action of that state (Executar plano, issue 532).
 */
export function cardPlanParts(card, { onPlan = null, onReplan = null, lead = null, place = 'card' } = {}) {
  const state = planState(card);
  const none = { badge: null, note: null, actions: null };
  if (state === 'hidden') return none;
  const number = ref(card.number);
  const act = (cls, action, label, name, handler, iconName = null) =>
    el('button', { type: 'button', class: cls, 'data-action': action, 'aria-label': name, onClick: (ev) => handler?.(card, ev.currentTarget) }, iconName ? icon(iconName) : null, label);
  if (state === 'planning') {
    const badge = el('span', { class: 'wb-pill wb-pill-active wb-session', role: 'status', 'data-state': 'planning' }, 'planejando…');
    return { ...none, badge };
  }
  // issue 595: on a repository that is not trusted the core refuses Planejar and Executar plano, so none is offered.
  if (card.trusted === false) return { ...none, actions: untrustedLine(card, place) };
  const note = state === 'failed' ? el('div', { class: 'wb-plan-note', role: 'alert' }, icon('alert'), el('span', {}, card.planning.reason || FAILED_FALLBACK)) : null;
  const hasPlan = card.plan?.steps > 0;
  const actions = hasPlan
    ? el('div', { class: 'wb-plan-acts' }, lead, el('div', { class: 'wb-plan-links' }, act('wb-plan-link', 'replan', 'Replanejar', `Replanejar a ${number}`, onReplan)))
    : el('div', { class: 'wb-plan-acts' }, act('btn filled sm wb-plan-act', 'plan', 'Planejar', `Planejar a ${number}`, onPlan, 'bot'));
  return { ...none, note, actions };
}

/**
 * The confirmation anchored on the card (465-6), drawn by the one popover (popover.js): repository, the current account
 * (read-only), where to open and the primary with the verb and the destination. `trigger` is the button that opened it, a
 * node or a function that finds it once drawn: the popover is placed on it and a click outside calls `onCancel`, as Esc does.
 * `replan` is the same confirmation worded for a replan.
 */
export function planConfirm({ repo, number, replan = false, target = 'desktop', account = null, busy = false, trigger = null, onTarget = null, onCancel = null, onConfirm = null }) {
  const verb = replan ? 'Replanejar' : 'Planejar';
  const title = `${verb} a ${ref(number)} com a Athena`;
  const hint = `${replan ? 'O plano atual vai para a sessão, que o substitui. ' : ''}O card fica em Planejamento com “planejando…” até o plano sair. Não conta no limite de execuções.`;
  return popoverShell({
    title,
    kind: replan ? 'replan' : 'plan',
    trigger,
    onDismiss: () => onCancel?.(),
    content: [
      popoverContext([{ label: 'Repositório', value: repo, mono: true, field: 'repo' }, account ? { label: 'Conta', value: account, field: 'account' } : null]),
      segmented({ label: 'Abrir em', options: OPEN_TARGETS, value: target, onChange: onTarget, storageKey: OPEN_IN_KEY }),
      el('p', { class: 'pop-note' }, hint),
    ],
    footer: popoverFooter({ cancel: { onClick: () => onCancel?.() }, primary: { label: destinationLabel(verb, target), busy, onClick: () => onConfirm?.() } }),
  });
}

/**
 * The repository is not on this machine (465-6), in the same popover: the message, the command to run and "Copiar comando". `message`
 * is the core's own text when it sent one; `copy` replaces the clipboard writer (tests); `trigger` is as in `planConfirm`.
 */
export function missingFolder({ repo, title = FOLDER_TITLE, message = null, command = null, copy = null, trigger = null, onClose = null }) {
  const text = message ?? `O Console não achou ${repo} em nenhuma pasta deste Mac. Clone e tente de novo; o card fica onde estava.`;
  const write = copy ?? ((value) => navigator.clipboard.writeText(value));
  const onCopy = async (ev) => {
    const button = ev.currentTarget;
    let done;
    try {
      await write(command);
      done = 'Copiado';
    } catch {
      done = 'Não deu para copiar';
    }
    button.replaceChildren(icon('copy'), done);
  };
  return popoverShell({
    title,
    kind: 'folder',
    trigger,
    onDismiss: () => onClose?.(),
    content: [el('p', { class: 'pop-note' }, text), command ? el('pre', { class: 'pop-code', role: 'note', 'aria-label': 'Comando' }, command) : null].filter(Boolean),
    footer: popoverFooter({
      cancel: { label: 'Fechar', action: 'close', onClick: () => onClose?.() },
      primary: command ? { label: 'Copiar comando', icon: 'copy', action: 'copy', onClick: onCopy } : null,
    }),
  });
}
