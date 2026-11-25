// #750: what the sidebar says about each item. The Mural says how many sessions wait for the person ("3 esperam",
// yellow outline); Quadro do trabalho says how many cards are queued (an orange number). The shell reads them: GET
// /api/attention and GET /api/work, the second one costly, so only at the start, when the core comes back, and after a
// change that concerns the board, debounced, and never with refresh=1. No browser: the fake DOM and a manual timer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { ElementoFalso, instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();

// @ts-expect-error: browser modules, plain JavaScript
import { ATTENTION_CHANGES, createCounts, WORK_CHANGES, WORK_ROUTE } from '../../ui/counts.js';
// @ts-expect-error: idem
import { apiPath } from '../../ui/screens/work-board-state.js';
// @ts-expect-error: idem
import { createNav } from '../../ui/nav.js';
// @ts-expect-error: idem
import { SCREENS, SECTIONS } from '../../ui/screens.js';

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
    const { counts, reads, timers } = rig({ '/api/attention': async () => ({ blocked: 2 }), '/api/work': async () => work(1) });
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
    await third.catch(() => {});
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
    assert.deepEqual(SECTIONS.map((s: { label: string | null }) => s.label), ['Agora', 'Entrega', 'Decisões', 'Máquinas', 'Controle']);
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
