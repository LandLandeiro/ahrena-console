// #751: the wall redraws on every read; the keyboard focus, the open popovers and the scroll stay where the person left them.
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { ElementoFalso, documentoFalso, instalarDomFalso } from './fake-dom.ts';

instalarDomFalso();
Object.assign(globalThis, {
  location: { pathname: '/ui/wall', search: '', hash: '' },
  history: { state: null, replaceState: () => {}, pushState: () => {} },
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
});

// The fake focus ignores its options: record them, to hold every focus of the redraw to `preventScroll`.
const focusLog: { node: ElementoFalso; options: unknown }[] = [];
const realFocus = ElementoFalso.prototype.focus;
ElementoFalso.prototype.focus = function (this: ElementoFalso, options?: unknown) {
  focusLog.push({ node: this, options });
  realFocus.call(this);
} as typeof realFocus;

// @ts-expect-error: browser module, plain JavaScript
const wall = await import('../../ui/screens/wall.js');
// @ts-expect-error: idem
const { resetOpenStates } = await import('../../ui/open-action.js');
// @ts-expect-error: idem
const { resetMachineChoice } = await import('../../ui/machine-filter.js');

const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('did not happen in time');
    await new Promise((r) => setTimeout(r, 5));
  }
};
const active = () => documentoFalso.activeElement;
const one = (root: ElementoFalso, selector: string) => root.querySelector(selector)!;

type Card = Record<string, unknown>;
const open = { target: 'desktop', command: null };
const session = (id: string, extra: Card = {}): Card => ({
  id,
  title: `Sessão ${id}`,
  status: 'active',
  state: 'active',
  since: '2026-10-20T12:00:00Z',
  activity: { type: 'tool', text: 'Rodar a bateria' },
  plan: { done: 1, total: 4, current: 'x' },
  context: { pct: 31 },
  open,
  ...extra,
});
const blocked = (id: string, extra: Card = {}) => session(id, { status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'question' }, ...extra });
const kid = (id: string): Card => ({ id, title: `Filha ${id}`, status: 'active', state: 'active', attention: null, since: '2026-10-20T11:00:00Z', parked: false, children: [] });
const parkedItem = (id: string): Card => session(id, { status: 'completed', state: 'completed', activity: { type: 'completed', text: '' } });

function wallOf(cards: Card[], extra: Card = {}) {
  return { version: 1, count: { all: cards.length, blocked: 1, idle: 0 }, cards, ...extra };
}

function start(initial: Card) {
  resetOpenStates();
  resetMachineChoice();
  const area = new ElementoFalso('main');
  const state = { wall: initial, reads: 0, failOpen: false };
  const leave = new AbortController();
  const changes: (() => void)[] = [];
  const ctx = {
    params: {},
    signal: leave.signal,
    read: async (route: string) => {
      if (route.startsWith('/api/new-session/folders')) return { folders: [{ path: '/x/a', name: 'a' }, { path: '/x/b', name: 'b' }], targets: {} };
      state.reads++;
      return structuredClone(state.wall);
    },
    write: async () => {
      if (state.failOpen) throw Object.assign(new Error('Não deu para abrir a sessão.'), { body: {} });
      return { ok: true, opened: 'desktop' };
    },
    onChange: (f: () => void) => changes.push(f),
    onRestart: () => {},
    counter: () => {},
    title: () => {},
    navigate: () => {},
    liveState: () => 'live',
  };
  // Like the browser, the scroll of a container that loses children falls back to the top.
  let scroll = 0;
  Object.defineProperty(area, 'scrollTop', { get: () => scroll, set: (v: number) => void (scroll = v) });
  const realReplace = area.replaceChildren.bind(area);
  area.replaceChildren = (...nodes) => (realReplace(...nodes), (scroll = 0));
  const realRemove = ElementoFalso.prototype.remove;
  const removed: ElementoFalso[] = [];
  return {
    area,
    state,
    mounted: wall.mount(area, ctx) as Promise<() => void>,
    scrolled: () => scroll,
    scrollTo: (v: number) => (scroll = v),
    resetScrollOnRemove: () => {
      ElementoFalso.prototype.remove = function (this: ElementoFalso) {
        if (this.parentNode === area) scroll = 0;
        removed.push(this);
        realRemove.call(this);
      };
    },
    restoreRemove: () => {
      ElementoFalso.prototype.remove = realRemove;
    },
    leave,
    // A re-read through the Atualizar button, resolved when the redraw is done.
    async refresh() {
      const before = state.reads;
      focusLog.length = 0;
      one(area, '[data-action="refresh"]').click();
      await until(() => state.reads > before);
      await new Promise((r) => setTimeout(r, 20));
    },
  };
}

let cleanup: (() => void) | null = null;
afterEach(async () => {
  ElementoFalso.prototype.remove = ElementoFalso.prototype.remove;
  documentoFalso.activeElement = null;
  cleanup?.();
  cleanup = null;
});

async function mountWith(initial: Card) {
  const s = start(initial);
  s.resetScrollOnRemove();
  cleanup = () => {
    s.restoreRemove();
    s.leave.abort();
  };
  await s.mounted;
  await until(() => s.area.querySelectorAll('[data-session]').length > 0);
  return s;
}

describe('#751: the redraw of the wall keeps the focus', () => {
  test('the header controls: the filter, Atualizar and Nova sessão keep their node and their focus', async () => {
    const s = await mountWith(wallOf([blocked('c1'), session('r1')]));
    const head = s.area.firstChild;
    for (const selector of ['[data-filter="idle"]', '[data-action="refresh"]', '.ns-button']) {
      const control = one(s.area, selector);
      control.focus();
      await s.refresh();
      assert.equal(active(), control, `${selector} keeps the focus`);
      assert.equal(s.area.firstChild, head, 'the header is the same node');
    }
    assert.ok(focusLog.every((f) => (f.options as { preventScroll?: boolean } | undefined)?.preventScroll === true), 'every focus of the redraw is preventScroll');
  });

  test('the filter: Enter on Ociosas keeps the focus on it while the list redraws', async () => {
    const s = await mountWith(wallOf([blocked('c1'), session('r1')]));
    const idle = one(s.area, '[data-filter="idle"]');
    idle.focus();
    idle.click();
    assert.equal(active(), idle);
    assert.equal(one(s.area, '[data-filter="idle"]').getAttribute('aria-pressed'), 'true');
  });

  test('the popover of Nova sessão stays open with its select focused and untouched', async () => {
    const s = await mountWith(wallOf([blocked('c1')]));
    one(s.area, '.ns-button').click();
    await until(() => s.area.querySelector('select.ns-folder') !== null);
    const select = one(s.area, 'select.ns-folder');
    select.focus();
    await s.refresh();
    assert.equal(one(s.area, '.ns-pop').getAttribute('hidden'), null, 'the popover is still open');
    assert.equal(one(s.area, 'select.ns-folder'), select, 'the same select');
    assert.equal(active(), select);
    assert.equal(focusLog.filter((f) => f.node === select).length, 0, 'the select was not focused again');
  });

  test('the machine selector keeps the focus on the chosen machine', async () => {
    const machines = [
      { id: 'local', label: 'Esta máquina', state: 'connected', reason: null, lastReadAt: '2026-10-22T23:00:00Z' },
      { id: 'ws', label: 'Workstation', state: 'connected', reason: null, lastReadAt: '2026-10-22T23:00:00Z' },
    ];
    const s = await mountWith(wallOf([blocked('c1')], { machines }));
    const ws = one(s.area, '[data-machine="ws"]');
    ws.focus();
    ws.click();
    await until(() => s.state.reads >= 2);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(active()?.getAttribute('data-machine'), 'ws');
    await s.refresh();
    assert.equal(active()?.getAttribute('data-machine'), 'ws');
  });

  test('the open action of a card: the focus goes back to its button, in the new node, never scrolling', async () => {
    const s = await mountWith(wallOf([blocked('c1'), blocked('c2')]));
    const button = s.area.querySelector('[data-key="local:c2"] .open-button')!;
    button.focus();
    await s.refresh();
    const now = s.area.querySelector('[data-key="local:c2"] .open-button')!;
    assert.notEqual(now, button, 'the card was drawn again');
    assert.equal(active(), now);
    assert.deepEqual(focusLog.at(-1)?.options, { preventScroll: true });
  });

  test('a card that becomes a row keeps the focus on its open button, and so the other way', async () => {
    const s = await mountWith(wallOf([blocked('c1'), session('c2')]));
    s.area.querySelector('[data-key="local:c1"] .open-button')!.focus();
    s.state.wall = wallOf([session('c1'), blocked('c2')]);
    await s.refresh();
    assert.equal(active(), s.area.querySelector('[data-key="local:c1"].wall-row .open-icon'), 'the row has the icon of the same session');
    s.area.querySelector('[data-key="local:c1"].wall-row .open-icon')!.focus();
    s.state.wall = wallOf([blocked('c1'), session('c2')]);
    await s.refresh();
    assert.equal(active(), s.area.querySelector('[data-key="local:c1"].wall-card .open-button'));
  });

  test('without the open button any more the focus falls to the link of the same session, never to the body', async () => {
    const s = await mountWith(wallOf([blocked('c1')]));
    s.area.querySelector('[data-key="local:c1"] .open-button')!.focus();
    s.state.wall = wallOf([blocked('c1', { open: { target: 'none', command: null } })]);
    await s.refresh();
    assert.equal(active(), s.area.querySelector('[data-key="local:c1"] a.wall-link'));
  });

  test('the link of a child and the link of a row of Paradas go back to the same link', async () => {
    const leader = blocked('lider', { tree: { total: 1, blocked: 0, active: 1, parked: 0 }, children: [kid('k1')] });
    const s = await mountWith(wallOf([leader], { parked: { total: 2, items: [parkedItem('p1'), parkedItem('p2')] } }));
    one(s.area, '[data-tree="lider"]').click();
    one(s.area, '[data-parked="toggle"]').click();
    const kidLink = s.area.querySelector('[data-child="k1"] a')!;
    kidLink.focus();
    await s.refresh();
    assert.equal(active(), s.area.querySelector('[data-child="k1"] a'));
    assert.notEqual(active(), kidLink);
    s.area.querySelector('[data-parked-row="p2"] a')!.focus();
    await s.refresh();
    assert.equal(active(), s.area.querySelector('[data-parked-row="p2"] a'));
    assert.ok(focusLog.every((f) => (f.options as { preventScroll?: boolean } | undefined)?.preventScroll === true));
  });

  test('a child or a parked row that is gone leaves the focus nowhere to invent', async () => {
    const leader = blocked('lider', { tree: { total: 1, blocked: 0, active: 1, parked: 0 }, children: [kid('k1')] });
    const s = await mountWith(wallOf([leader]));
    one(s.area, '[data-tree="lider"]').click();
    s.area.querySelector('[data-child="k1"] a')!.focus();
    s.state.wall = wallOf([{ ...leader, children: [] }]);
    await s.refresh();
    assert.notEqual(active()?.getAttribute('data-child'), 'k1');
  });

  test('the scroll of the container stays', async () => {
    const s = await mountWith(wallOf([blocked('c1'), session('r1')]));
    s.scrollTo(420);
    one(s.area, '[data-filter="idle"]').focus();
    await s.refresh();
    assert.equal(s.scrolled(), 420);
    s.state.wall = wallOf([session('c1'), blocked('r1')]);
    await s.refresh();
    assert.equal(s.scrolled(), 420);
  });

  test('the failure popover of the open action survives the redraw', async () => {
    const s = await mountWith(wallOf([session('r1')]));
    s.state.failOpen = true;
    const icon = s.area.querySelector('[data-key="local:r1"] .open-icon')!;
    icon.focus();
    icon.click();
    await until(() => s.area.querySelector('.open-fail') !== null);
    await s.refresh();
    assert.ok(s.area.querySelector('.open-fail'), 'the failure is still beside the icon');
    assert.equal(active(), s.area.querySelector('[data-key="local:r1"] .open-icon'));
  });
});
