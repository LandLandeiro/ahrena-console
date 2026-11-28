// The state icon and tag, eight shapes with the label always written, colour only in state-icon.css (ADR-0028).

import { el } from './dom.js';
import { ATTENTION_REASONS, attentionOf, statusWithoutAttention } from './attention.js';
import { kindLabel, stateKind, stateLabel } from './state-labels.js';

const SVG = 'http://www.w3.org/2000/svg';

export const STATE_KINDS = ['needs', 'permission', 'working', 'queued', 'paused', 'completed', 'error', 'answered'];

// The label of each kind, and of each state this file names, is in state-labels.js (issue 760), read when the tag is drawn.

function part(tag, cls, attributes) {
  const node = document.createElementNS(SVG, tag);
  node.setAttribute('class', cls);
  for (const [k, v] of Object.entries(attributes)) node.setAttribute(k, v);
  return node;
}

const ring = (dash) => part('circle', 'si-ring', { cx: '8', cy: '8', r: '6.25', fill: 'none', 'stroke-width': '1.5', ...(dash ? { 'stroke-dasharray': dash } : {}) });
const disc = () => part('circle', 'si-disc', { cx: '8', cy: '8', r: '7' });
const stroked = (cls, d, width) => part('path', cls, { d, fill: 'none', 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });

function slice(fraction) {
  const f = Number.isFinite(fraction) ? fraction : 0;
  const a = Math.max(0.06, Math.min(0.999, f)) * 2 * Math.PI;
  const x = (8 + 3.5 * Math.sin(a)).toFixed(2);
  const y = (8 - 3.5 * Math.cos(a)).toFixed(2);
  return part('path', 'si-fill', { d: `M8 8V4.5A3.5 3.5 0 ${a > Math.PI ? 1 : 0} 1 ${x} ${y}Z` });
}

const SHAPES = {
  needs: () => [ring(), part('circle', 'si-dot', { cx: '8', cy: '8', r: '2.5' })],
  permission: () => [ring(), stroked('si-mark', 'M6.4 6.6V5.9a1.6 1.6 0 013.2 0v.7', '1.3'), part('rect', 'si-fill', { x: '5.4', y: '6.6', width: '5.2', height: '4', rx: '1' })],
  working: (fraction) => [ring(), slice(fraction)],
  queued: () => [ring(), stroked('si-mark', 'M8 5v3l2 1.3', '1.5')],
  paused: () => [ring('2.2 2.1')],
  completed: () => [disc(), stroked('si-cut', 'M5.3 8.2l1.8 1.8 3.6-3.8', '1.6')],
  error: () => [disc(), stroked('si-cut', 'M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4', '1.6')],
  answered: () => [ring(), stroked('si-mark', 'M5.6 8.2l1.6 1.6 3.2-3.4', '1.5')],
};

/** The icon of a kind, 16px, hidden from the reader (the label says it); `fraction` (0 to 1) only draws `working`. `null` for an unknown kind. */
export function stateIcon(kind, { fraction = 0 } = {}) {
  if (!Object.hasOwn(SHAPES, kind)) return null;
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 16 16', width: '16', height: '16', 'aria-hidden': 'true', focusable: 'false', class: `state-icon state-icon-${kind}` })) svg.setAttribute(k, v);
  svg.append(...SHAPES[kind](fraction));
  return svg;
}

/** The tag of a state: the icon and the label in words, no fill. Without `label`, the kind says its own (the label of the current mode). */
export function stateTag({ kind, label = null, fraction = 0 } = {}) {
  const text = typeof label === 'string' && label ? label : (kindLabel(kind) ?? '');
  return el('span', { class: 'state-tag', 'data-state-kind': kind }, stateIcon(kind, { fraction }), el('span', { class: 'state-tag-label', title: text }, text));
}

/** The kind and the label of a session by its attention and its status, in the words of the current mode: both come from the id in state-labels.js. */
export function stateOfSession({ attention = null, status = null } = {}) {
  const a = attentionOf(attention);
  let id = 'active';
  if (a?.level === 'blocked') id = a.reason && ATTENTION_REASONS[a.reason]?.level === 'blocked' ? a.reason : 'blocked';
  else if (a?.level === 'idle') id = 'idle';
  else {
    const s = statusWithoutAttention(status);
    if (s === 'completed' || s === 'error' || s === 'abandoned') id = s;
  }
  return { kind: stateKind(id), label: stateLabel(id) };
}
