// The agent monogram: the initial in a circle, coloured by the agent's name (ADR-0028).

import { el } from './dom.js';

const COLOR_OF = { Athena: 'violet', Iris: 'blue', Argos: 'teal', Revisor: 'indigo' };

/** The colour of an agent's name (`violet`, `blue`, `teal`, `indigo`), or `null` for any other. */
export const agentColorOf = (name) => (typeof name === 'string' && Object.hasOwn(COLOR_OF, name) ? COLOR_OF[name] : null);

/** The circle with the first letter of `name`, in capitals; `?` when the name is empty. */
export function agentMonogram(name) {
  const initial = typeof name === 'string' ? (Array.from(name.trim())[0] ?? '') : '';
  const color = agentColorOf(name);
  return el('span', { class: `agent-monogram${color ? ` agent-monogram-${color}` : ''}`, 'aria-hidden': 'true' }, (initial || '?').toUpperCase());
}
