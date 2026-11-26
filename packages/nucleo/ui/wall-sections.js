// ADR-0028: the sections of the wall and the sentence of its header. No DOM: one function says where a session
// goes, and the sections, the filter and the sentence all read it (ADR-0028).

import { isBlocked, isIdle } from './attention.js';
import { stateOfSession } from './state-icon.js';

/** The sections in the order they are drawn. */
export const SECTION_IDS = ['blocked', 'active', 'idle', 'completed'];

/** The section of a card: blocked (an error included) first, then idle, then completed, else active. */
export function sectionOf(card) {
  if (isBlocked(card.attention) || stateOfSession({ attention: card.attention, status: card.status }).kind === 'error') return 'blocked';
  if (isIdle(card.attention)) return 'idle';
  return card.status === 'completed' ? 'completed' : 'active';
}

/** The cards by section, each in the order the core sent them. */
export function sectionsOf(cards) {
  const by = Object.fromEntries(SECTION_IDS.map((id) => [id, []]));
  for (const c of cards ?? []) by[sectionOf(c)].push(c);
  return by;
}

/** How many cards each section holds: the nested children are not cards of the wall and never count. */
export function countsOf(cards) {
  return Object.fromEntries(Object.entries(sectionsOf(cards)).map(([id, list]) => [id, list.length]));
}

const many = (n, one, other) => `${n} ${n === 1 ? one : other}`;

/** The sentence under the title: `lead` (bold) and `rest`; both empty without counts (before the first read). */
export function summaryOf(counts) {
  if (!counts) return { lead: '', rest: '' };
  const lead = counts.blocked > 0 ? `${many(counts.blocked, 'sessão precisa', 'sessões precisam')} de você.` : 'Nada precisa de você agora.';
  const parts = [counts.active > 0 ? many(counts.active, 'ativa', 'ativas') : null, counts.idle > 0 ? many(counts.idle, 'ociosa', 'ociosas') : null, counts.completed > 0 ? many(counts.completed, 'concluída', 'concluídas') : null].filter(Boolean);
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : (parts[0] ?? '');
  return { lead, rest: text ? `${text}.` : '' };
}

/** The whole sentence as one text, the one the live region reads. */
export const summaryText = ({ lead, rest }) => (rest ? `${lead} ${rest}` : lead);

/** HH:MM of the person's clock, or an empty text for a date that is not one. */
export function clockOf(iso) {
  const at = typeof iso === 'string' && iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/**
 * Where each row of the two-column list lands, in the core's order: `left`, `right` or `full` (a row with its tree
 * open spans both), plus a `filler` where a row would leave a hole. `first` and `last` mark the first and the last
 * grid row, for the corners and the dividers. `spans[i]` says whether row i spans both columns.
 */
export function duoCells(spans) {
  const cells = [];
  let col = 0;
  const fill = () => (cells.push({ i: null, side: 'filler' }), (col = 0));
  spans.forEach((span, i) => {
    if (span || spans.length === 1) {
      if (col === 1) fill();
      cells.push({ i, side: 'full' });
    } else {
      cells.push({ i, side: col === 0 ? 'left' : 'right' });
      col ^= 1;
    }
  });
  if (col === 1) fill();
  let row = -1;
  const rowOf = cells.map((c) => (c.side === 'left' || c.side === 'full' || row < 0 ? ++row : row));
  return cells.map((c, k) => ({ ...c, first: rowOf[k] === 0, last: rowOf[k] === row }));
}
