// What the sidebar says about two items (issue 750): the Mural says how many sessions wait for the person
// (a yellow outline tag, "3 esperam") and Quadro do trabalho says how many cards are queued (an orange number).
//
// The shell reads `GET /api/attention` and `GET /api/work`. The second one is costly (it can reach GitHub), so it is read
// at the start, when the core comes back and after a change that concerns the board, debounced, and never forced.
// Each read keeps its own sequence: an answer that arrives after a newer read was sent is dropped, whether it is a number
// or an error. An error, zero or an answer of another shape takes the tag away: the sidebar never shows an error.

import { attentionOfItem, isBlocked } from './attention.js';

const ATTENTION_ROUTE = '/api/attention';
/** The board the screen opens on (`apiPath({ level: 'item' })` of the work board), read without `refresh`: the core answers from its cache. */
export const WORK_ROUTE = '/api/work?level=item';

/** The changes that move who waits for the person (the same ones the Dashboard and the Kanban re-read on). */
export const ATTENTION_CHANGES = new Set(['needs-you', 'session', 'state', 'permission']);
/** The changes that move the board: the repositories of the project and the GitHub connection. */
export const WORK_CHANGES = new Set(['repos', 'connections']);

/** Burst of changes becomes one read. */
const DEBOUNCE_MS = 1000;

/** How many sessions wait for the person: the `blocked` number of the route, or the blocked items. */
export function waitingCount(attention) {
  if (!attention || typeof attention !== 'object') return 0;
  if (Number.isInteger(attention.blocked)) return Math.max(0, attention.blocked);
  if (attention.blocked !== undefined) return 0;
  return Array.isArray(attention.items) ? attention.items.filter((item) => isBlocked(attentionOfItem(item))).length : 0;
}

/** How many cards of the board are in the queue (`column === 'queued'`). */
export function queuedCount(board) {
  const columns = Array.isArray(board?.columns) ? board.columns : [];
  let n = 0;
  for (const column of columns) for (const card of Array.isArray(column?.cards) ? column.cards : []) if (card?.column === 'queued') n++;
  return n;
}

const waitingTag = (n) => (n > 0 ? { tone: 'waiting', text: `${n} ${n === 1 ? 'espera' : 'esperam'}` } : null);
const queuedTag = (n) => (n > 0 ? { tone: 'active', text: String(n), note: 'na fila' } : null);

/**
 * `nav` is the sidebar (`tag(id, tag | null)`), `read` the shell's read layer. `refresh()` reads both now; `changed(changes)`
 * is called with every batch of the live stream and reads only what the batch moves.
 */
export function createCounts({ read, nav, setTimer = setTimeout, clearTimer = clearTimeout }) {
  function reader(route, id, tagOf, count) {
    let latest = 0;
    return async function load() {
      const mine = ++latest;
      let tag = null;
      try {
        tag = tagOf(count(await read(route)));
      } catch {
        // A failure (409, 502, 503, offline) is no number: the tag goes away.
      }
      if (mine === latest) nav.tag(id, tag);
    };
  }
  const loadAttention = reader(ATTENTION_ROUTE, 'wall', waitingTag, waitingCount);
  const loadWork = reader(WORK_ROUTE, 'work', queuedTag, queuedCount);

  const timers = new Map();
  function later(key, load) {
    if (timers.has(key)) clearTimer(timers.get(key));
    timers.set(key, setTimer(() => (timers.delete(key), load()), DEBOUNCE_MS));
  }

  return {
    refresh: () => Promise.all([loadAttention(), loadWork()]).then(() => {}),
    changed(changes) {
      if (!Array.isArray(changes)) return;
      const types = new Set(changes.map((c) => c?.type));
      if ([...types].some((t) => ATTENTION_CHANGES.has(t))) later('attention', loadAttention);
      if ([...types].some((t) => WORK_CHANGES.has(t))) later('work', loadWork);
    },
  };
}
