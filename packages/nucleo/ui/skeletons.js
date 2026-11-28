// The skeleton of a screen (issue 765): only its shape, the sections and the heights of a card and of a row, so the
// page does not jump when the data arrives. It does not move (no animation, so nothing to turn off for reduced motion).

import { el } from './dom.js';

// The kind of each screen; one that is not here gets rows, the commonest shape.
const SHAPES = { wall: 'cards', dashboard: 'stats', kanban: 'columns', work: 'columns', 'session-detail': 'detail' };

/** The shape of a screen by its id: `cards`, `stats`, `columns`, `detail` or `rows`. */
export const shapeOf = (screenId) => SHAPES[screenId] ?? 'rows';

const many = (n, cls) => Array.from({ length: n }, () => el('div', { class: cls }));

const BODIES = {
  cards: () => [el('div', { class: 'sk-bar' }), el('div', { class: 'sk-grid' }, ...many(6, 'sk-card'))],
  stats: () => [el('div', { class: 'sk-grid sk-grid-stats' }, ...many(3, 'sk-stat')), el('div', { class: 'sk-card' }), el('div', { class: 'sk-grid sk-grid-two' }, ...many(2, 'sk-card'))],
  columns: () => [el('div', { class: 'sk-columns' }, ...many(4, 'sk-column'))],
  detail: () => [el('div', { class: 'sk-head' }), el('div', { class: 'sk-notice' }), ...many(4, 'sk-block')],
  rows: () => [el('div', { class: 'sk-bar' }), ...many(8, 'sk-row')],
};

/** A node with the shape of the screen: the title row, then its sections. */
export function skeleton(screenId) {
  const shape = shapeOf(screenId);
  return el('div', { class: 'sk', 'data-shape': shape }, el('div', { class: 'sk-title' }), ...BODIES[shape]());
}
