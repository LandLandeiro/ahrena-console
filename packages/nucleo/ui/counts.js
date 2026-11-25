// The Mural tag and the orange number of Quadro do trabalho (ADR-0028): /api/work is costly, so it is read rarely and never forced.

import { attentionOfItem, isBlocked } from './attention.js';

const ATTENTION_ROUTE = '/api/attention';
/** The board the screen opens on (`apiPath({ level: 'item' })` of the work board), read without `refresh`: the core answers from its cache. */
export const WORK_ROUTE = '/api/work?level=item';

/** The changes that move who waits for the person. */
export const ATTENTION_CHANGES = new Set(['needs-you', 'session', 'state', 'permission']);
/** The changes that move the board: the repositories of the project and the GitHub connection. */
export const WORK_CHANGES = new Set(['repos', 'connections']);

const DEBOUNCE_MS = 1000;
const QUEUE_REREAD_MS = 30_000;

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
export function createCounts({ read, nav, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) {
  // Whether the last number read of the board was above zero; an error leaves it as it was (ADR-0028), so the window still reads.
  let hadQueue = false;
  function reader(route, id, tagOf, count) {
    let latest = 0;
    return async function load() {
      const mine = ++latest;
      let tag = null;
      let n = 0;
      let answered = false;
      try {
        n = count(await read(route));
        tag = tagOf(n);
        answered = true;
      } catch {
        // ADR-0028: a failure (409, 502, 503, offline) is no number, the tag goes away.
      }
      if (mine !== latest) return;
      if (id === 'work' && answered) hadQueue = n > 0;
      nav.tag(id, tag);
    };
  }
  const loadAttention = reader(ATTENTION_ROUTE, 'wall', waitingTag, waitingCount);
  const loadWork = reader(WORK_ROUTE, 'work', queuedTag, queuedCount);

  const timers = new Map();
  function later(key, load) {
    if (timers.has(key)) return;
    timers.set(key, setTimer(() => (timers.delete(key), load()), DEBOUNCE_MS));
  }
  let queueReadAt = -Infinity;
  let tail;
  function readTail() {
    tail = undefined;
    if (!hadQueue || timers.has('work')) return;
    queueReadAt = now();
    loadWork();
  }

  return {
    refresh: () => Promise.all([loadAttention(), loadWork()]).then(() => {}),
    changed(changes) {
      if (!Array.isArray(changes)) return;
      const types = new Set(changes.map((c) => c?.type));
      if ([...types].some((t) => ATTENTION_CHANGES.has(t))) later('attention', loadAttention);
      if ([...types].some((t) => WORK_CHANGES.has(t))) later('work', loadWork);
      // ADR-0028: the queue moves by itself, so while it is above zero a session change reads it, once per window.
      if (types.has('session') && hadQueue) {
        if (now() - queueReadAt >= QUEUE_REREAD_MS) {
          queueReadAt = now();
          later('work', loadWork);
        } else if (tail === undefined) {
          tail = setTimer(readTail, queueReadAt + QUEUE_REREAD_MS - now());
        }
      }
    },
    wrote(route) {
      if (typeof route === 'string' && (route === '/api/work' || route.startsWith('/api/work/'))) later('work', loadWork);
    },
  };
}

/** The shell's `write` that tells the counts after a write that succeeded; a failure passes through and reads nothing. */
export function afterWrite(write, counts) {
  return async (route, body, options) => {
    const answer = await write(route, body, options);
    counts.wrote(route);
    return answer;
  };
}
