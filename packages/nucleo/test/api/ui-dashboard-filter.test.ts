// #765 (M6): the machine filter of the Dashboard keeps the content on screen until the new one arrives, and a redraw
// puts the keyboard focus back where it was, the way the Mural does.
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { ElementoFalso, documentoFalso, instalarDomFalso } from './fake-dom.ts';

instalarDomFalso();
Object.assign(globalThis, {
  location: { pathname: '/ui', search: '', hash: '' },
  history: { state: null, replaceState: () => {}, pushState: () => {} },
  ResizeObserver: class { observe() {} disconnect() {} },
  reportError: (e: unknown) => { throw e; },
});

// @ts-expect-error: browser module, plain JavaScript
const dashboard = await import('../../ui/screens/dashboard.js');
// @ts-expect-error: idem
const { resetMachineChoice } = await import('../../ui/machine-filter.js');

const machines = [{ id: 'local', label: 'Esta máquina', state: 'connected' }, { id: 'lab-01', label: 'Laboratório', state: 'connected' }];
const numbers = (n: number) => ({
  sessions: { total: n, active: n, blocked: 0, idle: 0 },
  agents: { active: 1, sessions: 1 },
  subagents: { active: 0, sessions: 0 },
  events: { today: 3, lastHour: 1, total: 9 },
  cost: { usd: 1.5, days: 7, unpriced: [] },
});
const row = (id: string, text: string) => ({ session: id, status: 'active', attention: null, text, project: 'demo', at: new Date().toISOString(), machine: null });
const body = (n: number, rows = [row('s1', 'Rodar a bateria')]) => ({ numbers: numbers(n), agents: [], activity: rows, machines });
const attention = { blocked: 0, idle: 0, items: [] };

function gate<T>() {
  let release!: (v: T) => void;
  const promise = new Promise<T>((r) => (release = r));
  return { promise, release };
}
const stops: (() => void)[] = [];
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('did not happen in time');
    await tick(5);
  }
};

function rig(answer: (route: string) => unknown | Promise<unknown>) {
  const leave = new AbortController();
  const reads: string[] = [];
  const ctx = {
    params: {},
    signal: leave.signal,
    read: async (route: string) => (reads.push(route), route === '/api/attention' ? attention : route.startsWith('/api/dashboard') ? answer(route) : { available: true }),
    write: async () => ({}),
    onChange: () => {},
    onRestart: () => {},
    counter: () => {},
    title: () => {},
    navigate: () => {},
    liveState: () => 'live',
  };
  const area = new ElementoFalso('main');
  return { ctx, area, reads, leave };
}
const segment = (area: ElementoFalso, id: string) => area.querySelectorAll('[data-machine]').find((b) => b.getAttribute('data-machine') === id)!;
const loadingShown = (area: ElementoFalso) => area.children.some((c) => c.getAttribute('aria-busy') === 'true');

describe('Dashboard: the machine filter keeps the content (#765, M6)', () => {
  afterEach(() => (stops.splice(0).forEach((s) => s()), resetMachineChoice(), (documentoFalso.activeElement = null)));

  test('choosing a machine keeps the current content and marks the area busy until the new one arrives', async () => {
    const slow = gate<unknown>();
    const { ctx, area, leave } = rig((route) => (route.includes('machine=lab-01') ? slow.promise : body(5)));
    stops.push(await dashboard.mount(area, ctx));
    assert.ok(area.querySelector('[data-card="working-now"]'), 'the first content is there');
    segment(area, 'lab-01').dispatchEvent({ type: 'click', stopPropagation() {} } as never);
    await tick(10);
    assert.ok(area.querySelector('[data-card="working-now"]'), 'the old content stays while the read is out');
    assert.equal(loadingShown(area), false, 'no skeleton swaps the content');
    assert.equal(area.getAttribute('aria-busy'), 'true');
    slow.release(body(2));
    await until(() => area.getAttribute('aria-busy') !== 'true');
    assert.match(area.querySelector('[data-card="working-now"]')!.textContent, /2 sessões/);
    leave.abort();
  });

  test('the segment that was pressed keeps the focus through the redraw', async () => {
    const { ctx, area, leave } = rig(() => body(5));
    stops.push(await dashboard.mount(area, ctx));
    const pressed = segment(area, 'lab-01');
    pressed.focus();
    pressed.dispatchEvent({ type: 'click', stopPropagation() {} } as never);
    await until(() => area.getAttribute('aria-busy') !== 'true');
    const now = documentoFalso.activeElement;
    assert.ok(now && area.contains(now), 'the focus is on something on screen');
    assert.equal(now!.getAttribute('data-machine'), 'lab-01');
    leave.abort();
  });

  test('the header and the filter row are the same nodes after a redraw, so nothing that holds the focus is replaced', async () => {
    const { ctx, area, leave } = rig(() => body(5));
    stops.push(await dashboard.mount(area, ctx));
    const before = [...area.childNodes].slice(0, 2);
    area.querySelector('.btn')!.dispatchEvent({ type: 'click', stopPropagation() {} } as never);
    await tick(20);
    assert.deepEqual([...area.childNodes].slice(0, 2), before);
    leave.abort();
  });

  test('a link of the recent activity that is rebuilt gets the focus back by its session', async () => {
    const { ctx, area, leave } = rig(() => body(5, [row('s1', 'Rodar a bateria'), row('s2', 'Ler o log')]));
    stops.push(await dashboard.mount(area, ctx));
    const link = area.querySelectorAll('a.row').find((a) => a.getAttribute('data-session') === 's2')!;
    link.focus();
    assert.equal(documentoFalso.activeElement, link);
    area.querySelector('.btn')!.dispatchEvent({ type: 'click', stopPropagation() {} } as never);
    await tick(30);
    const now = documentoFalso.activeElement!;
    assert.ok(area.contains(now), 'the focus is on screen');
    assert.equal(now.getAttribute('data-session'), 's2');
    assert.notEqual(now, link, 'the node was rebuilt');
    leave.abort();
  });

  test('when what held the focus is gone, it goes to the Atualizar button, not to the page', async () => {
    let n = 0;
    const { ctx, area, leave } = rig(() => body(5, n++ === 0 ? [row('s1', 'Rodar a bateria'), row('s2', 'Ler o log')] : [row('s1', 'Rodar a bateria')]));
    stops.push(await dashboard.mount(area, ctx));
    const link = area.querySelectorAll('a.row').find((a) => a.getAttribute('data-session') === 's2')!;
    link.focus();
    area.querySelector('.btn')!.dispatchEvent({ type: 'click', stopPropagation() {} } as never);
    await tick(30);
    const now = documentoFalso.activeElement!;
    assert.ok(now && area.contains(now));
    assert.match(now.textContent, /Atualizar/);
    leave.abort();
  });

  test('the first draw still shows the loading card, since there is nothing to keep', async () => {
    const slow = gate<unknown>();
    const { ctx, area, leave } = rig(() => slow.promise);
    const mounted = dashboard.mount(area, ctx).then((s: () => void) => stops.push(s));
    await tick(10);
    assert.ok(loadingShown(area));
    slow.release(body(1));
    await mounted;
    leave.abort();
  });
});
