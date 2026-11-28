// What a list already knew about a session (issue 765): title, state and reason. The session detail paints its header
// with it while its own read is out. Only these four fields are kept, and only the last 300 sessions.

const MAX = 300;
const seeds = new Map();

/** Remembers the sessions of a list answer; a row with no id or title is skipped. */
export function rememberSessions(items) {
  for (const s of Array.isArray(items) ? items : []) {
    if (!s || typeof s.id !== 'string' || typeof s.title !== 'string' || !s.title) continue;
    seeds.delete(s.id);
    seeds.set(s.id, { id: s.id, title: s.title, status: s.status ?? 'active', attention: s.attention ?? null });
    if (seeds.size > MAX) seeds.delete(seeds.keys().next().value);
  }
}

/** The header of a session as the list showed it, or null. */
export const seedOf = (id) => seeds.get(id) ?? null;

export const forgetSessions = () => seeds.clear();
