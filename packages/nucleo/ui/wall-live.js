/* ADR-0028, #758-wall-polish: what a read of the wall changed since the one before it, without DOM. A session that changed section is
   highlighted for a moment; a new request and a finished session also say so in the corner. Nothing else does. */

import { itemKey, LOCAL, machineIdOf } from './machine-filter.js';
import { sectionOf } from './wall-sections.js';

/**
 * What the next read is compared with: the section and whether it was completed, by session key (`sessions`), and the machines that
 * answered (`up`). `up` is null when the answer does not list machines, and then every machine counts as answering.
 */
export const snapshotOf = (cards, machines) => ({
  sessions: new Map((cards ?? []).map((c) => [itemKey(c), { section: sectionOf(c), completed: c.status === 'completed' }])),
  up: Array.isArray(machines) ? new Set([LOCAL, ...machines.filter((m) => m?.state === 'connected').map((m) => m.id)]) : null,
});

/**
 * `moved`: the keys of the sessions that were on the wall and now sit in another section. `notices`: `{ kind, key, card }` with
 * kind `request` (a card that now needs the person and did not before, a new session included) or `done` (a known session
 * that is now completed). Without a `before` (the first read, or a new choice of machine) nothing changed. A session of a machine that
 * did not answer the read before is not new: the core leaves a machine that is down or slow out of the answer, and its old sessions
 * come back with it.
 */
export function liveChanges(before, cards) {
  const moved = new Set();
  const notices = [];
  if (!before) return { moved, notices };
  for (const card of cards ?? []) {
    if (before.up && !before.up.has(machineIdOf(card))) continue;
    const key = itemKey(card);
    const was = before.sessions.get(key);
    const section = sectionOf(card);
    if (was && was.section !== section) moved.add(key);
    if (section === 'blocked' && was?.section !== 'blocked') notices.push({ kind: 'request', key, card });
    else if (was && card.status === 'completed' && !was.completed) notices.push({ kind: 'done', key, card });
  }
  return { moved, notices };
}
