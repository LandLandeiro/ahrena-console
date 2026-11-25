// The state icon and tag, eight shapes with the label always written, colour only in state-icon.css (ADR-0028).

import { el } from './dom.js';
import { ATTENTION_LABEL, ATTENTION_REASONS, attentionOf, statusWithoutAttention } from './attention.js';

const SVG = 'http://www.w3.org/2000/svg';

export const STATE_KINDS = ['needs', 'permission', 'working', 'queued', 'paused', 'completed', 'error', 'answered'];


// Today's labels, kept until the names change (ADR-0028).
const KIND_LABEL = {
  needs: ATTENTION_LABEL.blocked,
  permission: ATTENTION_REASONS.permission.label,
  working: 'Ativa',
  queued: 'Na fila',
  paused: ATTENTION_LABEL.idle,
  completed: 'Concluída',
  error: ATTENTION_REASONS.error.label,
  answered: 'Respondida',
};
const STATUS_TEXT = { completed: 'Concluída', abandoned: 'Abandonada' };

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

/** The tag of a state: the icon and the label in words, no fill. Without `label`, the kind says its own. */
export function stateTag({ kind, label = null, fraction = 0 } = {}) {
  const text = typeof label === 'string' && label ? label : (KIND_LABEL[kind] ?? '');
  return el('span', { class: 'state-tag', 'data-state-kind': kind }, stateIcon(kind, { fraction }), el('span', { class: 'state-tag-label' }, text));
}

/** The kind and the label of a session by its attention and its status, with today's words. */
export function stateOfSession({ attention = null, status = null } = {}) {
  const a = attentionOf(attention);
  if (a?.level === 'blocked') {
    const reason = a.reason && ATTENTION_REASONS[a.reason]?.level === 'blocked' ? a.reason : null;
    if (reason === 'permission' || reason === 'error') return { kind: reason, label: ATTENTION_REASONS[reason].label };
    return { kind: 'needs', label: reason ? ATTENTION_REASONS[reason].label : ATTENTION_LABEL.blocked };
  }
  if (a?.level === 'idle') return { kind: 'paused', label: ATTENTION_LABEL.idle };
  const s = statusWithoutAttention(status);
  if (s === 'completed') return { kind: 'completed', label: STATUS_TEXT.completed };
  if (s === 'error') return { kind: 'error', label: KIND_LABEL.error };
  if (s === 'abandoned') return { kind: 'paused', label: STATUS_TEXT.abandoned };
  return { kind: 'working', label: KIND_LABEL.working };
}
