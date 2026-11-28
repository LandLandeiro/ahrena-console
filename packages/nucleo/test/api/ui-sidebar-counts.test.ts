// #750: the Mural tag and the orange number; /api/work is read rarely and never with refresh=1. Fake DOM and a manual timer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { ElementoFalso, instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();

// @ts-expect-error: browser modules, plain JavaScript
import { ATTENTION_CHANGES, afterWrite, createCounts, WORK_CHANGES, WORK_ROUTE } from '../../ui/counts.js';
// @ts-expect-error: idem
import { apiPath } from '../../ui/screens/work-board-state.js';
// @ts-expect-error: idem
import { createNav } from '../../ui/nav.js';
// @ts-expect-error: idem
import { SCREENS, SECTIONS } from '../../ui/screens.js';
// @ts-expect-error: idem
import { createScreenGate, createShellLoad, shareReads } from '../../ui/shell-load.js';

type Tag = { tone: string; text: string; note?: string } | null;

function manualTimers() {
  const pending = new Map<number, () => void>();
  let next = 0;
  return {
    setTimer: (f: () => void) => (pending.set(++next, f), next),
    clearTimer: (id: number) => void pending.delete(id),
    get waiting() { return pending.size; },
    flush() { const all = [...pending.values()]; pending.clear(); all.forEach((f) => f()); },
  };
}

function rig(answers: Record<string, () => Promise<unknown>>) {
  const reads: string[] = [];
  const shown: Record<string, Tag[]> = { wall: [], work: [] };
  const timers = manualTimers();
  const nav = { tag: (id: string, tag: Tag) => void shown[id]!.push(tag) };
  const read = (route: string) => {
    reads.push(route);
    const key = Object.keys(answers).find((k) => route.startsWith(k));
    if (!key) throw new Error(`unexpected read ${route}`);
    return answers[key]!();
  };
  const counts = createCounts({ read, nav, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  const last = (id: string) => shown[id]!.at(-1);
  return { counts, reads, shown, timers, last };
}
const work = (queued: number, other = 4) => ({
  total: queued + other,
  columns: [
    { id: 'planning', cards: Array.from({ length: other }, (_, i) => ({ key: `p${i}`, column: 'planning' })) },
    { id: 'queued', cards: Array.from({ length: queued }, (_, i) => ({ key: `q${i}`, column: 'queued' })) },
  ],
});
const flushPromises = () => new Promise((r) => setImmediate(r));

describe('#750 the yellow tag of the Mural', () => {
  test('it says "N esperam" with the blocked number of /api/attention, "1 espera" for one, and disappears with zero', async () => {
    let blocked = 3;
    const { counts, last } = rig({ '/api/attention': async () => ({ blocked, items: [] }), '/api/work': async () => work(0) });
    await counts.refresh();
    assert.deepEqual(last('wall'), { tone: 'waiting', text: '3 esperam' });
    blocked = 1;
    await counts.refresh();
    assert.deepEqual(last('wall'), { tone: 'waiting', text: '1 espera' });
    blocked = 0;
    await counts.refresh();
    assert.equal(last('wall'), null);
  });

  test('without the blocked number it counts the blocked items; an idle item does not count', async () => {
    const items = [{ attention: { level: 'blocked', reason: 'question' } }, { attention: { level: 'idle', reason: 'turn_ended' } }, { attention: { level: 'blocked', reason: 'permission' } }];
    const { counts, last } = rig({ '/api/attention': async () => ({ items }), '/api/work': async () => work(0) });
    await counts.refresh();
    assert.deepEqual(last('wall'), { tone: 'waiting', text: '2 esperam' });
  });

  test('an error, junk or a negative number takes the tag away', async () => {
    for (const answer of [() => Promise.reject(new Error('503')), async () => null, async () => ({ blocked: -2 }), async () => ({ blocked: 'três' }), async () => 'x']) {
      const { counts, last } = rig({ '/api/attention': answer, '/api/work': async () => work(0) });
      await counts.refresh();
      assert.equal(last('wall'), null);
    }
  });
});

describe('#750 the orange number of Quadro do trabalho', () => {
  test('it counts the cards of the queued column of /api/work and says "na fila" to a screen reader', async () => {
    const { counts, last, reads } = rig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': async () => work(2) });
    await counts.refresh();
    assert.deepEqual(last('work'), { tone: 'active', text: '2', note: 'na fila' });
    assert.ok(reads.some((r) => r.startsWith('/api/work')));
  });

  test('zero queued, an empty board and junk take it away', async () => {
    for (const answer of [async () => work(0), async () => ({ columns: [] }), async () => ({}), async () => null, async () => ({ columns: [{ cards: null }, null, { cards: [{ column: 'planning' }] }] })]) {
      const { counts, last } = rig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': answer });
      await counts.refresh();
      assert.equal(last('work'), null);
    }
  });

  test('409, 502, 503 and a core that does not answer take it away: no number, no error on the sidebar', async () => {
    for (const status of [409, 502, 503, 0]) {
      let fail = false;
      const { counts, last } = rig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': () => (fail ? Promise.reject(Object.assign(new Error('x'), { status })) : Promise.resolve(work(2))) });
      await counts.refresh();
      assert.equal(last('work')?.text, '2');
      fail = true;
      await counts.refresh();
      assert.equal(last('work'), null, String(status));
    }
  });

  test('the read is the board the screen shows by default, never forced: no refresh=1', async () => {
    const { counts, reads, timers } = rig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': async () => work(1) });
    await counts.refresh();
    counts.changed([{ type: 'repos' }]);
    timers.flush();
    await flushPromises();
    const works = reads.filter((r) => r.startsWith('/api/work'));
    assert.equal(works.length, 2);
    for (const r of works) assert.doesNotMatch(r, /refresh/);
    assert.deepEqual([...new Set(works)], ['/api/work?level=item']);
  });
});

describe('#750 which changes read again', () => {
  const total = (reads: string[], prefix: string) => reads.filter((r) => r.startsWith(prefix)).length;

  test('the start and the core coming back read both once; nothing else reads before a relevant change', async () => {
    const { counts, reads, timers } = rig({ '/api/attention': async () => ({ blocked: 1 }), '/api/work': async () => work(1) });
    await counts.refresh();
    assert.deepEqual([total(reads, '/api/attention'), total(reads, '/api/work')], [1, 1]);
    assert.equal(timers.waiting, 0);
  });

  test('a change that is not about the board or the waiting sessions reads nothing and arms nothing', async () => {
    const { counts, reads, timers } = rig({ '/api/attention': async () => ({ blocked: 1 }), '/api/work': async () => work(1) });
    await counts.refresh();
    const before = reads.length;
    counts.changed([{ type: 'activity' }, { type: 'alert' }, { type: 'connector' }, { type: 'app-update' }, { type: 'tools' }, { type: 'adrs' }, { type: 'plan' }, null, {}, { type: 7 }]);
    counts.changed('nada');
    counts.changed(undefined);
    assert.equal(timers.waiting, 0);
    timers.flush();
    await flushPromises();
    assert.equal(reads.length, before);
  });

  test('a session that needs you reads /api/attention only, and a burst becomes one read after the debounce', async () => {
    const { counts, reads, timers } = rig({ '/api/attention': async () => ({ blocked: 2 }), '/api/work': async () => work(0) });
    await counts.refresh();
    const before = reads.length;
    for (const type of ['needs-you', 'session', 'state', 'permission', 'needs-you']) counts.changed([{ type }, { type: 'activity' }]);
    assert.equal(reads.length, before, 'not before the debounce');
    timers.flush();
    await flushPromises();
    assert.deepEqual(reads.slice(before), ['/api/attention']);
  });

  test('a GitHub change reads /api/work only: the repositories and the connection', async () => {
    const { counts, reads, timers } = rig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': async () => work(3) });
    await counts.refresh();
    const before = reads.length;
    counts.changed([{ type: 'repos', key: 'lista' }, { type: 'repos', key: 'a/b' }, { type: 'connections', key: 'github' }]);
    timers.flush();
    await flushPromises();
    assert.deepEqual(reads.slice(before), ['/api/work?level=item']);
  });

  test('the sets are the ones the board and the attention depend on', () => {
    assert.deepEqual([...ATTENTION_CHANGES].sort(), ['needs-you', 'permission', 'session', 'state']);
    assert.deepEqual([...WORK_CHANGES].sort(), ['connections', 'repos']);
    assert.equal(WORK_ROUTE, apiPath({ level: 'item' }), 'the shell reads the board the screen opens on');
    assert.doesNotMatch(readFileSync(`${UI_FOLDER}counts.js`, 'utf8'), /refresh=1|refresh: true/);
  });
});

describe('#750 a slow answer never overwrites a newer one', () => {
  test('an older read that lands after the newer one is dropped, for the number and for the error', async () => {
    const waiting: ((v: unknown) => void)[] = [];
    const failing: ((e: unknown) => void)[] = [];
    let call = 0;
    const { counts, last } = rig({
      '/api/attention': () => {
        call++;
        return new Promise((resolve, reject) => (waiting.push(resolve), failing.push(reject)));
      },
      '/api/work': async () => work(0),
    });
    const first = counts.refresh();
    const second = counts.refresh();
    assert.equal(call, 2);
    waiting[1]!({ blocked: 5 });
    await second;
    assert.deepEqual(last('wall'), { tone: 'waiting', text: '5 esperam' });
    waiting[0]!({ blocked: 1 });
    await first;
    assert.deepEqual(last('wall'), { tone: 'waiting', text: '5 esperam' }, 'the older answer is ignored');
    const third = counts.refresh();
    const fourth = counts.refresh();
    waiting[3]!({ blocked: 2 });
    await fourth;
    failing[2]!(new Error('late failure'));
    await third;
    assert.deepEqual(last('wall'), { tone: 'waiting', text: '2 esperam' }, 'an older failure does not clear the newer number');
  });

  test('the same for the work board', async () => {
    const resolvers: ((v: unknown) => void)[] = [];
    const { counts, last } = rig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': () => new Promise((r) => resolvers.push(r)) });
    const a = counts.refresh();
    const b = counts.refresh();
    await flushPromises();
    resolvers[1]!(work(4));
    await b;
    resolvers[0]!(work(1));
    await a;
    assert.equal(last('work')?.text, '4');
  });
});

describe('#750 the sidebar draws the tag and the number', () => {
  const nav = () => new ElementoFalso('nav');
  const draw = (n: ElementoFalso) => createNav({ nav: n, read: async () => [], screens: SCREENS });

  test('the Mural item shows a yellow tag, and the number-only items show mono text; both survive a redraw', () => {
    const n = nav();
    const bar = draw(n);
    bar.tag('wall', { tone: 'waiting', text: '3 esperam' });
    bar.tag('work', { tone: 'active', text: '2', note: 'na fila' });
    bar.counter('repos', 4);
    const wall = n.querySelector('[data-screen="wall"] .cc-nav-tag')!;
    assert.equal(wall.getAttribute('data-tone'), 'waiting');
    assert.equal(texto(wall), '3 esperam');
    const queued = n.querySelector('[data-screen="work"] .cc-nav-tag')!;
    assert.equal(queued.getAttribute('data-tone'), 'active');
    assert.equal(texto(queued), '2 na fila');
    assert.equal(queued.getAttribute('title'), '2 na fila');
    assert.equal(texto(queued.querySelector('.cc-sr-only')), 'na fila');
    assert.equal(texto(n.querySelector('[data-screen="repos"] .cc-nav-count')), '4');
    bar.draw();
    assert.equal(texto(n.querySelector('[data-screen="wall"] .cc-nav-tag')), '3 esperam');
    assert.equal(texto(n.querySelector('[data-screen="repos"] .cc-nav-count')), '4');
    assert.equal(n.querySelector('.q'), null, 'the old pill is gone');
  });

  test('null takes the tag away; zero takes the number away; an item has at most one thing on the right', () => {
    const n = nav();
    const bar = draw(n);
    bar.tag('wall', { tone: 'waiting', text: '3 esperam' });
    bar.tag('wall', null);
    assert.equal(n.querySelector('[data-screen="wall"] .cc-nav-tag'), null);
    bar.counter('repos', 4);
    bar.counter('repos', 0);
    assert.equal(n.querySelector('[data-screen="repos"] .cc-nav-count'), null);
    bar.tag('wall', { tone: 'waiting', text: '3 esperam' });
    bar.counter('wall', 9);
    const right = n.querySelector('[data-screen="wall"]')!.querySelectorAll('.cc-nav-tag, .cc-nav-count');
    assert.equal(right.length, 1, 'a tag wins over a plain number');
  });

  test('a tag for an item that does not exist is kept for when it appears and breaks nothing', () => {
    const n = nav();
    const bar = draw(n);
    assert.doesNotThrow(() => bar.tag('nada', { tone: 'waiting', text: '1 espera' }));
  });

  test('the first block is called Agora; the other titles do not change', () => {
    assert.deepEqual(SECTIONS.map((s: { label: string | null }) => s.label), ['Agora', 'Entrega', 'Máquinas', null]);
    const n = nav();
    draw(n);
    assert.equal(texto(n.querySelector('[data-section="main"] .cc-nav-title')), 'Agora');
    assert.equal(n.querySelector('[data-section="main"]')!.getAttribute('role'), 'group');
  });

  test('the Dashboard no longer puts a number on the sidebar', () => {
    const dashboard = readFileSync(`${UI_FOLDER}screens/dashboard.js`, 'utf8');
    assert.doesNotMatch(dashboard, /ctx\.counter\(/);
    const app = readFileSync(`${UI_FOLDER}app.js`, 'utf8');
    assert.match(app, /createCounts\(/);
    assert.match(app, /counts\.changed\(changes\)/);
    assert.doesNotMatch(app, /refresh=1/);
  });
});

function clock() {
  let now = 0;
  let next = 0;
  const pending = new Map<number, { at: number; f: () => void }>();
  return {
    now: () => now,
    pendingCount: () => pending.size,
    setTimer: (f: () => void, ms: number) => (pending.set(++next, { at: now + ms, f }), next),
    clearTimer: (id: number) => void pending.delete(id),
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].f();
        await flushPromises();
      }
      now = end;
    },
  };
}
function timedRig(answers: Record<string, () => Promise<unknown>>) {
  const reads: string[] = [];
  const shown: Record<string, Tag[]> = { wall: [], work: [] };
  const time = clock();
  const read = (route: string) => {
    reads.push(route);
    return answers[Object.keys(answers).find((k) => route.startsWith(k))!]!();
  };
  const counts = createCounts({ read, nav: { tag: (id: string, tag: Tag) => void shown[id]!.push(tag) }, setTimer: time.setTimer, clearTimer: time.clearTimer, now: time.now });
  return { counts, reads, time, shown, last: (id: string) => shown[id]!.at(-1) };
}
const total = (reads: string[], prefix: string) => reads.filter((r) => r.startsWith(prefix)).length;

describe('#750 a steady stream of changes does not starve the read', () => {
  test('batches every 500 ms for 5 s read, and never more than once per window', async () => {
    const { counts, reads, time } = timedRig({ '/api/attention': async () => ({ blocked: 2 }), '/api/work': async () => work(0) });
    await counts.refresh();
    const before = total(reads, '/api/attention');
    for (let t = 0; t < 5000; t += 500) {
      counts.changed([{ type: 'session' }]);
      await time.advance(500);
    }
    await time.advance(1000);
    const n = total(reads, '/api/attention') - before;
    assert.ok(n >= 4, `the stream must read (read ${n} times)`);
    assert.ok(n <= 6, `at most one read per window of 1 s (read ${n} times)`);
  });

  test('a batch that arrives while the read is pending joins it: one read, at the first batch plus the debounce', async () => {
    const { counts, reads, time } = timedRig({ '/api/attention': async () => ({ blocked: 2 }), '/api/work': async () => work(0) });
    await counts.refresh();
    const before = total(reads, '/api/attention');
    counts.changed([{ type: 'state' }]);
    await time.advance(900);
    counts.changed([{ type: 'state' }]);
    await time.advance(150);
    assert.equal(total(reads, '/api/attention') - before, 1, 'the second batch did not move the read');
  });
});

describe('#750 the orange number does not go stale', () => {
  test('a successful write to /api/work/... reads the board again, debounced; another route reads nothing', async () => {
    const { counts, reads, time } = timedRig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': async () => work(1) });
    await counts.refresh();
    const before = total(reads, '/api/work');
    counts.wrote('/api/work/queue');
    counts.wrote('/api/work/retry');
    counts.wrote('/api/sessions');
    counts.wrote('/api/workflows');
    assert.equal(total(reads, '/api/work') - before, 0, 'not before the debounce');
    await time.advance(1100);
    assert.equal(total(reads, '/api/work') - before, 1, 'two writes, one read');
    assert.equal(total(reads, '/api/attention'), 1);
  });

  test('afterWrite wraps the shell write: a success asks for the read, a failure does not, and the answer or the error pass through', async () => {
    const asked: string[] = [];
    const counts = { wrote: (route: string) => void asked.push(route) };
    const ok = afterWrite(async (route: string) => ({ route }), counts);
    assert.deepEqual(await ok('/api/work/queue', { a: 1 }), { route: '/api/work/queue' });
    assert.deepEqual(asked, ['/api/work/queue']);
    const boom = new Error('409');
    const bad = afterWrite(async () => { throw boom; }, counts);
    await assert.rejects(() => bad('/api/work/queue', {}), (e: unknown) => e === boom);
    assert.deepEqual(asked, ['/api/work/queue'], 'a failed write does not read again');
    assert.match(readFileSync(`${UI_FOLDER}app.js`, 'utf8'), /afterWrite\(write, counts\)/);
  });

  test('while the number shown is above zero a session change reads the board too, at most once every 30 s', async () => {
    const { counts, reads, time } = timedRig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': async () => work(2) });
    await counts.refresh();
    let before = total(reads, '/api/work');
    counts.changed([{ type: 'session' }]);
    await time.advance(1100);
    assert.equal(total(reads, '/api/work') - before, 1);
    counts.changed([{ type: 'session' }]);
    await time.advance(10_000);
    assert.equal(total(reads, '/api/work') - before, 1, 'inside the 30 s window it does not read');
    await time.advance(25_000);
    counts.changed([{ type: 'session' }]);
    await time.advance(1100);
    assert.equal(total(reads, '/api/work') - before, 2);
    before = total(reads, '/api/attention');
    assert.ok(before >= 3, 'the attention reads as before');
  });

  test('a session change inside the 30 s window reads once at the end of it (the tail read), and the first change opened the window', async () => {
    const { counts, reads, time } = timedRig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': async () => work(2) });
    await counts.refresh();
    const before = total(reads, '/api/work');
    counts.changed([{ type: 'session' }]);
    await time.advance(1100);
    counts.changed([{ type: 'session' }]);
    await time.advance(20_000);
    assert.equal(total(reads, '/api/work') - before, 1, 'still inside the window: no read');
    await time.advance(10_000);
    assert.equal(total(reads, '/api/work') - before, 2, 'one read at the end of the window');
    await time.advance(60_000);
    assert.equal(total(reads, '/api/work') - before, 2, 'the tail reads once and schedules nothing more');
  });

  test('several session changes inside the window make one tail read, not one each', async () => {
    const { counts, reads, time } = timedRig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': async () => work(2) });
    await counts.refresh();
    const before = total(reads, '/api/work');
    counts.changed([{ type: 'session' }]);
    await time.advance(1100);
    for (let i = 0; i < 3; i++) {
      counts.changed([{ type: 'session' }]);
      await time.advance(3000);
    }
    await time.advance(30_000);
    assert.equal(total(reads, '/api/work') - before, 2, 'the first read plus one tail read');
  });

  test('when the number is zero at the end of the window the tail does not read', async () => {
    let queued = 2;
    const { counts, reads, time } = timedRig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': async () => work(queued) });
    await counts.refresh();
    const before = total(reads, '/api/work');
    counts.changed([{ type: 'session' }]);
    await time.advance(1100);
    counts.changed([{ type: 'session' }]);
    queued = 0;
    counts.changed([{ type: 'repos' }]);
    await time.advance(1100);
    assert.equal(total(reads, '/api/work') - before, 2, 'the board change read zero');
    await time.advance(60_000);
    assert.equal(total(reads, '/api/work') - before, 2, 'with zero nothing is read at the end');
  });

  test('a passing error of /api/work clears the number but remembers there was a queue: the window still reads again', async () => {
    let fail = false;
    const { counts, reads, time, last } = timedRig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': async () => (fail ? Promise.reject(new Error('503')) : work(2)) });
    await counts.refresh();
    assert.deepEqual(last('work'), { tone: 'active', text: '2', note: 'na fila' });
    const before = total(reads, '/api/work');
    fail = true;
    counts.changed([{ type: 'session' }]);
    await time.advance(1100);
    assert.equal(last('work'), null, 'the error took the number away');
    fail = false;
    counts.changed([{ type: 'session' }]);
    await time.advance(30_000);
    assert.equal(total(reads, '/api/work') - before, 2, 'the read at the end of the window happened');
    assert.deepEqual(last('work'), { tone: 'active', text: '2', note: 'na fila' });
  });

  test('an error with no queue before it, and a read of zero, keep the tail away', async () => {
    let fail = true;
    const { counts, reads, time } = timedRig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': async () => (fail ? Promise.reject(new Error('503')) : work(0)) });
    await counts.refresh();
    const before = total(reads, '/api/work');
    counts.changed([{ type: 'session' }]);
    await time.advance(1100);
    fail = false;
    await counts.refresh();
    counts.changed([{ type: 'session' }]);
    await time.advance(60_000);
    assert.equal(total(reads, '/api/work') - before, 1, 'only the explicit refresh read');
  });

  test('with the number at zero a session change schedules no timer at all', async () => {
    const { counts, time } = timedRig({ '/api/attention': async () => ({ blocked: 0 }), '/api/work': async () => work(0) });
    await counts.refresh();
    counts.changed([{ type: 'session' }]);
    counts.changed([{ type: 'session' }]);
    await time.advance(1100);
    assert.equal(time.pendingCount(), 0);
  });

  test('with zero queued a session change keeps reading /api/attention only', async () => {
    const { counts, reads, time } = timedRig({ '/api/attention': async () => ({ blocked: 1 }), '/api/work': async () => work(0) });
    await counts.refresh();
    const before = total(reads, '/api/work');
    counts.changed([{ type: 'session' }, { type: 'state' }]);
    await time.advance(2000);
    assert.equal(total(reads, '/api/work') - before, 0);
    assert.equal(total(reads, '/api/attention'), 2);
  });
});

describe('#750 M4: the shell reads each route once on cold load, after the screen has asked for its own', () => {
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
    return { promise, resolve, reject };
  };

  test('a shell read of a route already in flight shares its promise; once it settles the next one asks again', async () => {
    const asked: string[] = [];
    const pending = [deferred<string>(), deferred<string>(), deferred<string>()];
    const shared = shareReads((route: string) => (asked.push(route), pending[asked.length - 1]!.promise));
    const a = shared('/api/connectors');
    const b = shared('/api/connectors');
    assert.equal(a, b);
    assert.deepEqual(asked, ['/api/connectors']);
    const other = shared('/api/connections');
    assert.notEqual(other, a);
    assert.equal(asked.length, 2);
    pending[0]!.resolve('x');
    assert.equal(await a, 'x');
    const again = shared('/api/connectors');
    assert.notEqual(again, a);
    assert.equal(asked.length, 3);
  });

  test('a failure is shared by whoever was waiting, and does not stay in the table', async () => {
    let calls = 0;
    const boom = new Error('offline');
    const shared = shareReads(async () => {
      calls++;
      if (calls === 1) throw boom;
      return 'back';
    });
    const a = shared('/api/machines');
    const b = shared('/api/machines');
    await assert.rejects(a, (e: unknown) => e === boom);
    await assert.rejects(b, (e: unknown) => e === boom);
    assert.equal(await shared('/api/machines'), 'back');
  });

  test('a read that carries options (a screen with its own signal) is never shared', () => {
    const asked: unknown[] = [];
    const shared = shareReads((route: string, options: unknown) => (asked.push(options), Promise.resolve(route)));
    const signal = new AbortController().signal;
    shared('/api/attention', { signal });
    shared('/api/attention', { signal });
    assert.equal(asked.length, 2);
  });

  test('the gate opens when the first screen settles, or after 1 s at the most, whichever comes first', async () => {
    const t = manualTimers();
    const waits: number[] = [];
    const settle = (f: () => void, ms: number) => (waits.push(ms), t.setTimer(f));
    const byScreen = createScreenGate({ setTimer: settle, clearTimer: t.clearTimer });
    assert.deepEqual(waits, [1000]);
    let open = false;
    void byScreen.ready.then(() => (open = true));
    await flushPromises();
    assert.equal(open, false);
    byScreen.open();
    await flushPromises();
    assert.equal(open, true);
    assert.equal(t.waiting, 0, 'the 1 s timer is cleared');
    byScreen.open();

    const slow = createScreenGate({ setTimer: t.setTimer, clearTimer: t.clearTimer });
    let late = false;
    void slow.ready.then(() => (late = true));
    await flushPromises();
    assert.equal(late, false);
    t.flush();
    await flushPromises();
    assert.equal(late, true, 'a screen that never settles holds the shell for 1 s only');
  });

  test('the shell loads nothing before the gate, loads once at boot, and the connection\'s first restart does not load again', async () => {
    const t = manualTimers();
    const gate = createScreenGate({ setTimer: t.setTimer, clearTimer: t.clearTimer });
    let loaded = 0;
    const shell = createShellLoad({ gate, loaders: [() => void loaded++, () => Promise.resolve(void loaded++)] });
    const booted = shell.boot();
    await flushPromises();
    assert.equal(loaded, 0);
    assert.equal(shell.restart(), false, 'the first restart is the connection\'s: the screen has just read');
    assert.equal(loaded, 0);
    gate.open();
    await booted;
    assert.equal(loaded, 2);
    assert.equal(shell.restart(), true, 'a later restart makes the screens re-read');
    assert.equal(loaded, 4, 'and the shell reads everything again');
  });

  test('after a drop the next restart, even the first, reads everything again', async () => {
    const gate = { ready: Promise.resolve() };
    let loaded = 0;
    const shell = createShellLoad({ gate, loaders: [() => void loaded++] });
    await shell.boot();
    shell.dropped();
    assert.equal(shell.restart(), true);
    assert.equal(loaded, 2);
  });

  test('#750: a drop and a reconnect before the gate opens read nothing yet, and boot reads once, after the screen', async () => {
    const t = manualTimers();
    const gate = createScreenGate({ setTimer: t.setTimer, clearTimer: t.clearTimer });
    let loaded = 0;
    const shell = createShellLoad({ gate, loaders: [() => void loaded++] });
    const booted = shell.boot();
    shell.dropped();
    assert.equal(shell.restart(), true, 'the screens still re-read');
    await flushPromises();
    assert.equal(loaded, 0, 'the shell waits for the screen, even after a drop');
    gate.open();
    await booted;
    assert.equal(loaded, 1, 'boot reads once');
  });

  test('one loader that throws does not stop the others', async () => {
    const gate = { ready: Promise.resolve() };
    const ran: number[] = [];
    const shell = createShellLoad({ gate, loaders: [() => { throw new Error('x'); }, () => Promise.reject(new Error('y')), () => void ran.push(1)] });
    await shell.boot();
    assert.deepEqual(ran, [1]);
  });

  test('a cold load of the shell with the real sidebar and counts asks each route once, and only after the screen asked', async () => {
    const asked: string[] = [];
    const answer: Record<string, unknown> = {
      '/api/machines': [],
      '/api/connectors': [],
      '/api/connections': {},
      '/api/app-update': { app: false },
      '/api/overview': { version: '0.0.22' },
      '/api/attention': { blocked: 0 },
      '/api/work?level=item': work(0),
    };
    const slow = deferred<unknown>();
    const raw = (route: string) => {
      asked.push(route);
      return route === '/api/attention' ? slow.promise : Promise.resolve(answer[route]);
    };
    const shared = shareReads(raw);
    const nav = createNav({ nav: new ElementoFalso('nav'), read: shared });
    const counts = createCounts({ read: shared, nav: { tag() {} } });
    const t = manualTimers();
    const gate = createScreenGate({ setTimer: t.setTimer, clearTimer: t.clearTimer });
    const shell = createShellLoad({
      gate,
      loaders: [() => shared('/api/overview'), nav.readMachines, nav.readConnectors, () => shared('/api/connections'), () => shared('/api/app-update'), counts.refresh],
    });
    const booted = shell.boot();
    // #750: the screen's own reads go out first, through the raw read.
    raw('/api/wall?machine=all');
    await flushPromises();
    assert.deepEqual(asked, ['/api/wall?machine=all']);
    // #750: the connection's first restart arrives, and so does the screen.
    assert.equal(shell.restart(), false);
    gate.open();
    // #750: a second shell read of a route still in flight (the interval of the machines, the connectors...) shares it.
    nav.readMachines();
    nav.readConnectors();
    await flushPromises();
    slow.resolve({ blocked: 0 });
    await booted;
    const shellReads = asked.slice(1);
    assert.equal(new Set(shellReads).size, shellReads.length, `each route once: ${shellReads.join(', ')}`);
    assert.deepEqual([...shellReads].sort(), ['/api/app-update', '/api/attention', '/api/connections', '/api/connectors', '/api/machines', '/api/overview', '/api/work?level=item']);
  });

  test('app.js: the shell reads go through the shared read, the live loop starts before the screen, and the timers stay', () => {
    const app = readFileSync(`${UI_FOLDER}app.js`, 'utf8');
    assert.match(app, /const shellRead = shareReads\(read\)/);
    assert.match(app, /createNav\(\{\s*nav,\s*read: shellRead,/);
    assert.match(app, /createCounts\(\{ read: shellRead,/);
    assert.match(app, /createGithubFooter\(\{ node: document\.getElementById\('github'\), read: shellRead \}\)/);
    assert.match(app, /createAppUpdate\(\{ read: shellRead,/);
    assert.match(app, /await shellRead\('\/api\/overview'\)/);
    // #750: the screen's own reads are not shared: they carry the signal that leaving the screen aborts.
    assert.match(app, /read: \(route, options\) => read\(route, \{ signal: leave\.signal, \.\.\.options \}\)/);
    const restart = /function restart\(\) \{([^]*?)\n\}/.exec(app)![1]!;
    assert.doesNotMatch(restart, /read(Version|Machines|Connectors)|refresh\(\)/, 'the restart reads through the shell load, not by itself');
    assert.match(restart, /if \(!shell\.restart\(\)\) return;/);
    assert.ok(app.indexOf('startLive({') < app.lastIndexOf('\nopen();'), 'the cursor is taken before the screen reads');
    assert.match(app, /setInterval\(readMachines, 60_000\)/);
    assert.match(app, /setInterval\(readConnectors, 60_000\)/);
    assert.match(app, /setInterval\(\(\) => appUpdate\.tick\(\), 30_000\)/);
    assert.match(app, /if \(next\.state === 'offline'\) shell\.dropped\(\)/);
    assert.match(app, /gate\.open\(\)/);
  });
});
