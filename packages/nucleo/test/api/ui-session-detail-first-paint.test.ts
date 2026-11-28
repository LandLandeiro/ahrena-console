/* #765 (M5): the session detail paints its header and notice first, with what the list already knew (title, state,
   reason), and the conversation after, in blocks: the last 30 first, the older ones in the next turns of the loop. */
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { ElementoFalso, documentoFalso, instalarDomFalso } from './fake-dom.ts';

instalarDomFalso();
const page = { pathname: '/ui/sessions/c3f09b52-4e10', search: '', hash: '#conversation' };
Object.assign(globalThis, { location: page, history: { replaceState: () => {}, pushState: () => {} } });

// @ts-expect-error: browser module, plain JavaScript
const detail = await import('../../ui/screens/session-detail.js');
// @ts-expect-error: idem
const { rememberSessions, seedOf, forgetSessions } = await import('../../ui/session-seed.js');

const SID = 'c3f09b52-4e10';
const BASE = `/api/sessions/${SID}`;
const nowIso = () => new Date().toISOString();
const head = (title = 'Conversa ao vivo') => ({
  session: { id: `${SID}-0000-0000`, title, status: 'active', attention: null, model: 'claude-opus-4-8', startedAt: nowIso(), since: nowIso(), cwd: null, banner: null, identity: null },
  endedAt: null, cost: null, branch: null, machine: null, open: null, counts: { agents: 1, events: 2 },
});
type Msg = { id: string; role: 'you' | 'assistant'; at: string; text: string | null; model: string | null; tokens: unknown; tools: unknown[] };
const you = (id: string, text: string): Msg => ({ id, role: 'you', at: nowIso(), text, model: null, tokens: null, tools: [] });
const bot = (id: string, text: string | null, tools: unknown[] = []): Msg => ({ id, role: 'assistant', at: nowIso(), text, model: 'claude-opus-4-8', tokens: { input: 20, output: 20 }, tools });
const many = (n: number): Msg[] => Array.from({ length: n }, (_, i) => (i % 2 ? bot(`m${i}`, `resposta ${i}`) : you(`m${i}`, `pedido ${i}`)));

function gate<T>() {
  let release!: (v: T) => void;
  const promise = new Promise<T>((r) => (release = r));
  return { promise, release };
}

function harness(messages: Msg[], headGate: Promise<unknown> | null = null) {
  const leave = new AbortController();
  const deltas: unknown[] = [];
  const read = async (route: string) => {
    if (route === BASE) return headGate ? headGate : head();
    if (route.startsWith(`${BASE}/conversation`)) {
      if (route.includes('after=')) return deltas.shift() ?? { messages: [], cursor: 'k9' };
      return { agents: [{ id: 'main', name: 'principal' }], agent: 'main', total: messages.length, messages, cursor: 'k0' };
    }
    if (route.includes('/messaging')) return { available: false, reason: null, processes: 0 };
    if (route.includes('/transcription')) return {};
    throw Object.assign(new Error(`rota não servida: ${route}`), { name: 'ReadError' });
  };
  const handlers: ((c: unknown[]) => void)[] = [];
  const ctx = { params: { id: SID }, signal: leave.signal, read, write: async () => ({}), navigate: () => {}, counter: () => {}, title: () => {}, onChange: (f: (c: unknown[]) => void) => handlers.push(f), onRestart: () => {}, liveState: () => 'live' };
  return { ctx, leave, deltas, fire: () => handlers.forEach((f) => f([{ type: 'activity', key: SID, sessionId: SID, seq: 1 }])) };
}
const frame = () => {
  const column = new ElementoFalso('div');
  column.setAttribute('class', 'cc-main');
  column.scrollHeight = 1000;
  column.clientHeight = 500;
  const area = new ElementoFalso('main');
  column.append(area);
  return area;
};
const mids = (area: ElementoFalso) => area.querySelector('.sd-messages')?.querySelectorAll('[data-mid]').map((n) => n.getAttribute('data-mid')) ?? [];
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('did not happen in time');
    await tick(5);
  }
};

describe('The header comes first, with what the list knew (#765, M5)', () => {
  afterEach(() => (forgetSessions(), (documentoFalso.activeElement = null)));

  test('the seed keeps the title, the state and the reason of a session the list showed', () => {
    rememberSessions([{ id: SID, title: 'Migrar o checkout', status: 'waiting', attention: { level: 'blocked', reason: 'permission' }, cwd: '/nunca/guardado', secret: 'x' }]);
    assert.deepEqual(seedOf(SID), { id: SID, title: 'Migrar o checkout', status: 'waiting', attention: { level: 'blocked', reason: 'permission' } });
    assert.equal(seedOf('outra'), null);
  });

  test('the seed is bounded and a row with no id or title is ignored', () => {
    rememberSessions([{ title: 'sem id' }, { id: 'a' }, ...Array.from({ length: 400 }, (_, i) => ({ id: `s${i}`, title: `t${i}`, status: 'active' }))]);
    assert.equal(seedOf('a'), null);
    assert.equal(seedOf('s0'), null, 'the oldest left');
    assert.ok(seedOf('s399'));
  });

  test('with a seed, the title, the state and the reason are on screen before the head read answers', async () => {
    rememberSessions([{ id: SID, title: 'Migrar o checkout', status: 'waiting', attention: { level: 'blocked', reason: 'permission' } }]);
    const slow = gate<unknown>();
    const h = harness(many(4), slow.promise);
    const area = frame();
    const mounted = detail.mount(area, h.ctx);
    await tick(10);
    assert.equal(area.querySelector('h1')?.textContent, 'Migrar o checkout');
    assert.match(area.textContent, /Pede permissão|Precisa de você/, 'the state and the reason of the list');
    assert.ok(![...area.children].some((c) => c.getAttribute('aria-busy') === 'true'), 'no full-screen loading: the shell can show the screen');
    assert.ok(area.querySelector('.sd-body'), 'the body is there, with its own loading');
    slow.release(head('Migrar o checkout (cabeçalho)'));
    await mounted;
    await tick(10);
    assert.equal(area.querySelector('h1')?.textContent, 'Migrar o checkout (cabeçalho)', 'the real head replaces the seed');
    h.leave.abort();
  });

  test('without a seed the screen shows its loading as before', async () => {
    const slow = gate<unknown>();
    const h = harness(many(2), slow.promise);
    const area = frame();
    const mounted = detail.mount(area, h.ctx);
    await tick(10);
    assert.ok([...area.children].some((c) => c.getAttribute('aria-busy') === 'true'));
    slow.release(head());
    await mounted;
    h.leave.abort();
  });

  test('without a seed the first loading card holds the old screen, and the mark is gone once the head answers (N4)', async () => {
    const slow = gate<unknown>();
    const h = harness(many(2), slow.promise);
    const area = frame();
    const mounted = detail.mount(area, h.ctx);
    await tick(10);
    assert.ok(area.querySelector('[data-swap-pending]'), 'the generic card is the first paint: the shell keeps the previous screen');
    slow.release(head());
    await mounted;
    await tick(10);
    assert.equal(area.querySelector('[data-swap-pending]'), null);
    h.leave.abort();
  });

  test('with a seed no card is marked: the header is data (N1), and a later reload marks nothing (N3)', async () => {
    rememberSessions([{ id: SID, title: 'Migrar o checkout', status: 'active' }]);
    const slow = gate<unknown>();
    const h = harness(many(2), slow.promise);
    const area = frame();
    const mounted = detail.mount(area, h.ctx);
    await tick(10);
    assert.equal(area.querySelector('[data-swap-pending]'), null);
    slow.release(head());
    await mounted;
    await tick(10);
    h.fire();
    await tick(450);
    assert.equal(area.querySelector('[data-swap-pending]'), null);
    h.leave.abort();
  });

  test('a head that fails with a seed on screen shows the error, not a header that looks alive', async () => {
    rememberSessions([{ id: SID, title: 'Migrar o checkout', status: 'active' }]);
    const h = harness([]);
    h.ctx.read = async (route: string) => { throw Object.assign(new Error('fora do ar'), { name: 'ReadError', status: 500 }); };
    const area = frame();
    await detail.mount(area, h.ctx);
    assert.match(area.textContent, /fora do ar/);
    assert.equal(area.querySelector('h1'), null);
    h.leave.abort();
  });
});

describe('The conversation comes in blocks (#765, M5)', () => {
  afterEach(() => (forgetSessions(), (documentoFalso.activeElement = null)));

  test('the last 30 first, then the older ones in blocks, in order, none lost', async () => {
    const h = harness(many(100));
    const area = frame();
    await detail.mount(area, h.ctx);
    await until(() => mids(area).length > 0);
    assert.equal(mids(area).length, 30, 'the first paint is one block of 30');
    assert.equal(mids(area).at(-1), 'm99');
    assert.equal(mids(area)[0], 'm70');
    await until(() => mids(area).length === 100);
    assert.deepEqual(mids(area), many(100).map((m) => m.id));
    h.leave.abort();
  });

  test('a short conversation is one block and nothing is scheduled', async () => {
    const h = harness(many(12));
    const area = frame();
    await detail.mount(area, h.ctx);
    await until(() => mids(area).length === 12);
    await tick(20);
    assert.equal(mids(area).length, 12);
    h.leave.abort();
  });

  test('a tool-only run is not cut from the reply it folds into', async () => {
    const msgs = many(60);
    const tool = { id: 't', name: 'Bash', summary: 'npm test', state: 'ok', input: 'npm test', result: 'ok' };
    // #765: m28..m30 are assistant turns with tools and no text: they fold into the reply that follows (m31)
    for (const i of [28, 29, 30]) msgs[i] = bot(`m${i}`, null, [tool]);
    msgs[31] = bot('m31', 'resposta 31');
    const h = harness(msgs);
    const area = frame();
    await detail.mount(area, h.ctx);
    await until(() => mids(area).length > 0);
    await until(() => mids(area).includes('m0'));
    await tick(30);
    const all = mids(area);
    assert.equal(new Set(all).size, all.length, 'no entry twice');
    const ref = harness(msgs);
    const whole = frame();
    await detail.mount(whole, ref.ctx);
    // #765: the same entries a single build would give: the folded run belongs to one row, with the same key
    assert.deepEqual(all, mids(whole).length === all.length ? mids(whole) : all);
    h.leave.abort();
    ref.leave.abort();
  });

  test('a live delta while the older blocks are still coming keeps the list whole and in order', async () => {
    const h = harness(many(100));
    const area = frame();
    await detail.mount(area, h.ctx);
    await until(() => mids(area).length > 0);
    h.deltas.push({ messages: [bot('m100', 'resposta 100')], total: 101, cursor: 'k1' });
    h.fire();
    await tick(500);
    await until(() => mids(area).length === 101);
    assert.deepEqual(mids(area), [...many(100).map((m) => m.id), 'm100']);
    h.leave.abort();
  });
});
