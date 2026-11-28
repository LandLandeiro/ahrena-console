// ADR-0028, #758-wall-polish: what a read of the wall changed since the one before it, without DOM. A session that changed section is
// highlighted for a moment; a new request and a finished session also say so in the corner. Nothing else does.

import { itemKey } from './machine-filter.js';
import { sectionOf } from './wall-sections.js';

/** What the next read is compared with: the section and whether it was completed, by session key. */
export const snapshotOf = (cards) => new Map((cards ?? []).map((c) => [itemKey(c), { section: sectionOf(c), completed: c.status === 'completed' }]));

/**
 * `moved`: the keys of the sessions that were on the wall and now sit in another section. `notices`: `{ kind, key, card }` with
 * kind `request` (a card that now needs the person and did not before, a new session included) or `done` (a known session
 * that is now completed). Without a `before` (the first read, or a new choice of machine) nothing changed.
 */
export function liveChanges(before, cards) {
  const moved = new Set();
  const notices = [];
  if (!before) return { moved, notices };
  for (const card of cards ?? []) {
    const key = itemKey(card);
    const was = before.get(key);
    const section = sectionOf(card);
    if (was && was.section !== section) moved.add(key);
    if (section === 'blocked' && was?.section !== 'blocked') notices.push({ kind: 'request', key, card });
    else if (was && card.status === 'completed' && !was.completed) notices.push({ kind: 'done', key, card });
  }
  return { moved, notices };
}
