// #751: the wall redraws on every read; the keyboard focus, the open popovers and the scroll stay where the person left them.
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { ElementoFalso, documentoFalso, instalarDomFalso } from './fake-dom.ts';

instalarDomFalso();
Object.assign(globalThis, {
  reportError: (e: unknown) => { throw e; },
  location:{ pathname: '/ui/wall', search: '', hash: '' },
  history: { state: null, replaceState: () => {}, pushState: () => {} },
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
});

// #751: the fake focus ignores its options; record them to hold every focus of the redraw to preventScroll.
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

function start(initial: Card, failRead = false) {
  resetOpenStates();
  resetMachineChoice();
  const area = new ElementoFalso('main');
  const state = { wall: initial, reads: 0, attempts: 0, failRead, failOpen: false, failCommand: false, gate: null as Promise<void> | null };
  const leave = new AbortController();
  const changes: (() => void)[] = [];
  const ctx = {
    params: {},
    signal: leave.signal,
    read: async (route: string) => {
      if (route.startsWith('/api/new-session/folders')) return { folders: [{ path: '/x/a', name: 'a' }, { path: '/x/b', name: 'b' }], targets: {} };
      state.attempts++;
      if (state.gate) await state.gate;
      if (state.failRead) throw new Error('O núcleo não respondeu.');
      state.reads++;
      return structuredClone(state.wall);
    },
    write: async () => {
      if (state.failOpen) throw Object.assign(new Error('Não deu para abrir a sessão.'), { body: state.failCommand ? { command: 'claude --resume exemplo' } : {} });
      return { ok: true, opened: 'desktop' };
    },
    onChange: (f: () => void) => changes.push(f),
    onRestart: () => {},
    counter: () => {},
    title: () => {},
    navigate: () => {},
    liveState: () => 'live',
  };
  // #751: like the browser, the scroll of a container that loses children falls back to the top.
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
    removed,
    scrolled: () => scroll,
    scrollTo: (v: number) => (scroll = v),
    resetScrollOnRemove: () => {
      ElementoFalso.prototype.remove = function (this: ElementoFalso) {
        if (this.parentNode === area) scroll = 0;
        removed.push(this);
        // #751: like the browser, a node removed with the focus inside drops the focus.
        const focused = documentoFalso.activeElement;
        if (focused && this.contains(focused)) documentoFalso.activeElement = null;
        realRemove.call(this);
      };
    },
    restoreRemove: () => {
      ElementoFalso.prototype.remove = realRemove;
    },
    leave,
    // #752: asks for a re-read the way a change of the core does.
    poke: () => changes.forEach((f) => f()),
    // #751: a re-read like the one a change of the core asks for, resolved when the redraw is done.
    async refresh() {
      const before = state.reads;
      focusLog.length = 0;
      for (const f of changes) f();
      await until(() => state.reads > before);
      await new Promise((r) => setTimeout(r, 20));
    },
  };
}

let cleanup: (() => void) | null = null;
afterEach(async () => {
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
  test('the header controls: the state segments and Nova sessão keep their node and their focus', async () => {
    const s = await mountWith(wallOf([blocked('c1'), session('r1')]));
    const head = s.area.firstChild;
    for (const selector of ['[data-filter="idle"]', '[data-filter="active"]', '.ns-button']) {
      const control = one(s.area, selector);
      control.focus();
      await s.refresh();
      assert.equal(active(), control, `${selector} keeps the focus`);
      assert.equal(s.area.firstChild, head, 'the header is the same node');
      assert.ok(!s.removed.includes(head), 'the header is never taken out and put back');
    }
    assert.ok(focusLog.every((f) => (f.options as { preventScroll?: boolean } | undefined)?.preventScroll === true), 'every focus of the redraw is preventScroll');
  });

  test('the filter: Enter on Em pausa keeps the focus on it while the list redraws', async () => {
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
    assert.equal(s.area.querySelectorAll('.pop').length, 1, 'the popover is still open');
    assert.equal(one(s.area, 'select.ns-folder'), select, 'the same select');
    assert.equal(active(), select);
    assert.equal(focusLog.filter((f) => f.node === select).length, 0, 'the select was not focused again');
  });

  test('#752: the last remote goes while the focus is on the machine button: it falls to the pressed state segment, not to the body', async () => {
    const at = '2026-10-22T23:00:00Z';
    const local = { id: 'local', label: 'Esta máquina', state: 'connected', reason: null, lastReadAt: at };
    const remote = { id: 'ws', label: 'Workstation', state: 'connected', reason: null, lastReadAt: at };
    const s = await mountWith(wallOf([blocked('c1'), session('a1')], { machines: [local, remote] }));
    one(s.area, '[data-filter="active"]').click();
    const button = one(s.area, '[data-machine-menu]');
    button.focus();
    assert.equal(active(), button);
    s.state.wall = wallOf([blocked('c1'), session('a1')], { machines: [local] });
    await s.refresh();
    assert.equal(active(), one(s.area, '[data-filter="active"]'));
  });

  test('the machine menu keeps the focus on its button after a machine is chosen', async () => {
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

describe('#751: where the focus goes when the node it was on is gone', () => {
  const tree = { total: 1, blocked: 0, active: 1, parked: 0 };
  const ws = { id: 'ws', label: 'Workstation' };

  test('a child that became a card: the focus goes to its card link, not to the body', async () => {
    const leader = blocked('lider', { tree, children: [kid('k1')] });
    const s = await mountWith(wallOf([leader]));
    one(s.area, '[data-tree="lider"]').click();
    s.area.querySelector('[data-child="k1"] a')!.focus();
    s.state.wall = wallOf([{ ...leader, children: [], tree: null }, blocked('k1')]);
    await s.refresh();
    assert.equal(active(), s.area.querySelector('[data-key="local:k1"] a.wall-link'));
  });

  test('a child that is gone from the tree and from the wall: the focus goes to the link of its leader', async () => {
    const leader = blocked('lider', { tree, children: [kid('k1')] });
    const s = await mountWith(wallOf([leader]));
    one(s.area, '[data-tree="lider"]').click();
    s.area.querySelector('[data-child="k1"] a')!.focus();
    s.state.wall = wallOf([{ ...leader, children: [], tree: null }]);
    await s.refresh();
    assert.equal(active(), s.area.querySelector('[data-key="local:lider"] a.wall-link'));
  });

  test('a parked row whose session came back to the wall: the focus goes to its row link', async () => {
    const s = await mountWith(wallOf([blocked('c1')], { parked: { total: 1, items: [parkedItem('p1')] } }));
    one(s.area, '[data-parked="toggle"]').click();
    s.area.querySelector('[data-parked-row="p1"] a')!.focus();
    s.state.wall = wallOf([blocked('c1'), session('p1')]);
    await s.refresh();
    assert.equal(active(), s.area.querySelector('[data-key="local:p1"] a.wall-link'));
  });

  test('the open button of a row of Paradas keeps the focus through the redraw', async () => {
    const s = await mountWith(wallOf([blocked('c1')], { parked: { total: 1, items: [parkedItem('p1')] } }));
    one(s.area, '[data-parked="toggle"]').click();
    const button = s.area.querySelector('[data-parked-row="p1"] .btn')!;
    button.focus();
    await s.refresh();
    const now = s.area.querySelector('[data-parked-row="p1"] .btn')!;
    assert.notEqual(now, button);
    assert.equal(active(), now);
  });

  test('a session that left the wall: no focus is invented for its open button', async () => {
    const s = await mountWith(wallOf([blocked('c1'), blocked('c2')]));
    s.area.querySelector('[data-key="local:c2"] .open-button')!.focus();
    s.state.wall = wallOf([blocked('c1')]);
    await s.refresh();
    assert.equal(s.area.querySelector('[data-key="local:c2"]'), null);
    assert.notEqual(active()?.getAttribute?.('data-key'), 'local:c2');
  });

  test('two machines with the same child id: the focus stays on the child of its own machine', async () => {
    const local = blocked('lider', { tree, children: [kid('x')] });
    const remote = blocked('lider2', { tree, machine: ws, children: [kid('x')] });
    const s = await mountWith(wallOf([local, remote]));
    one(s.area, '[data-tree="lider"]').click();
    one(s.area, '[data-tree="lider2"]').click();
    const mine = s.area.querySelector('[data-key="ws:lider2"] [data-child="x"] a')!;
    mine.focus();
    await s.refresh();
    assert.equal(active(), s.area.querySelector('[data-key="ws:lider2"] [data-child="x"] a'));
  });

  test('two machines with the same parked id: the focus stays on the row of its own machine', async () => {
    const s = await mountWith(wallOf([blocked('c1')], { parked: { total: 2, items: [parkedItem('p1'), { ...parkedItem('p1'), machine: ws }] } }));
    one(s.area, '[data-parked="toggle"]').click();
    const rows = s.area.querySelectorAll('[data-parked-row="p1"]');
    assert.equal(rows.length, 2);
    rows[1]!.querySelector('a')!.focus();
    await s.refresh();
    assert.equal(active(), s.area.querySelectorAll('[data-parked-row="p1"]')[1]!.querySelector('a'));
  });
});

describe('#751: the retry and the notice link keep the focus through the redraw', () => {
  const machine = (state: string) => ({ id: 'ws', label: 'Workstation', state, reason: null, lastReadAt: '2026-10-22T23:00:00Z' });
  const local = { id: 'local', label: 'Esta máquina', state: 'connected', reason: null, lastReadAt: '2026-10-22T23:00:00Z' };

  async function retry(s: ReturnType<typeof start>, selector: string) {
    const before = s.state.attempts;
    one(s.area, selector).click();
    await until(() => s.state.attempts > before);
    await new Promise((r) => setTimeout(r, 20));
  }

  test('the retry of the band: the focus goes to the new button, and to the pressed state segment when the band is gone', async () => {
    const s = await mountWith(wallOf([blocked('c1')]));
    s.state.failRead = true;
    s.poke();
    await until(() => s.area.querySelector('.error-band') !== null);
    const first = one(s.area, '.error-band button');
    first.focus();
    await retry(s, '.error-band button');
    const again = one(s.area, '.error-band button');
    assert.notEqual(again, first, 'the band was drawn again');
    assert.equal(active(), again);
    again.focus();
    s.state.failRead = false;
    await retry(s, '.error-band button');
    assert.equal(s.area.querySelector('.error-band'), null);
    assert.equal(active(), one(s.area, '[data-filter="all"]'));
  });

  test('the retry of the full-screen error: the same, and the focus goes to the pressed state segment once the wall is read', async () => {
    const s = start(wallOf([blocked('c1')]), true);
    cleanup = () => {
      s.restoreRemove();
      s.leave.abort();
    };
    s.resetScrollOnRemove();
    await s.mounted;
    await until(() => s.area.querySelector('[role="alert"] button') !== null);
    const first = one(s.area, '[role="alert"] button');
    first.focus();
    await retry(s, '[role="alert"] button');
    const again = one(s.area, '[role="alert"] button');
    assert.notEqual(again, first);
    assert.equal(active(), again);
    s.state.failRead = false;
    await retry(s, '[role="alert"] button');
    await until(() => s.area.querySelector('[data-session]') !== null);
    assert.equal(active(), one(s.area, '[data-filter="all"]'));
  });

  test('the link of the notice of a machine that is down keeps the focus by its data-machine; when the notice is gone the focus goes to the machine menu button', async () => {
    const s = await mountWith(wallOf([blocked('c1')], { machines: [local, machine('unreachable')] }));
    const link = one(s.area, '.mf-notice[data-machine="ws"] .mf-notice-link');
    link.focus();
    await s.refresh();
    const now = one(s.area, '.mf-notice[data-machine="ws"] .mf-notice-link');
    assert.notEqual(now, link, 'the notice was drawn again');
    assert.equal(active(), now);
    s.state.wall = wallOf([blocked('c1')], { machines: [local, machine('connected')] });
    await s.refresh();
    assert.equal(s.area.querySelector('.mf-notice'), null);
    assert.equal(active(), one(s.area, '[data-machine-menu]'));
  });
});

describe('#751: a redraw does not take a focus nobody had', () => {
  test('a redraw with the focus on the body leaves it on the body, and no segment is focused', async () => {
    const s = await mountWith(wallOf([blocked('c1'), session('r1')]));
    documentoFalso.activeElement = null;
    await s.refresh();
    assert.equal(active(), null);
    assert.equal(focusLog.length, 0, 'no node was focused by the redraw');
  });

  test('a retry that resolves after the focus went elsewhere leaves the focus where it went', async () => {
    const s = await mountWith(wallOf([blocked('c1')]));
    s.state.failRead = true;
    s.poke();
    await until(() => s.area.querySelector('.error-band') !== null);
    one(s.area, '.error-band button').focus();
    let release = () => {};
    s.state.gate = new Promise<void>((resolve) => (release = resolve));
    s.state.failRead = false;
    const before = s.state.attempts;
    one(s.area, '.error-band button').click();
    await until(() => s.state.attempts > before);
    one(s.area, '[data-key="local:c1"] a.wall-link').focus();
    focusLog.length = 0;
    release();
    await until(() => s.area.querySelector('.error-band') === null);
    assert.equal(active(), one(s.area, '[data-key="local:c1"] a.wall-link'), 'the focus stayed on the link of the card');
    s.state.failRead = true;
    s.poke();
    await until(() => s.area.querySelector('.error-band') !== null);
    one(s.area, '.error-band button').focus();
    s.state.gate = new Promise<void>((resolve) => (release = resolve));
    s.state.failRead = false;
    const again = s.state.attempts;
    one(s.area, '.error-band button').click();
    await until(() => s.state.attempts > again);
    one(s.area, '[data-filter="all"]').focus();
    release();
    await until(() => s.area.querySelector('.error-band') === null);
    assert.equal(active(), one(s.area, '[data-filter="all"]'), 'the focus stayed on the segment');
  });
});

describe('#751: the rows "Mostrar mais" adds take the focus only from the button that asked for them', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => parkedItem(`p${i}`));
  const band = (n: number) => wallOf([blocked('c1')], { parked: { total: 30, items: items(n) } });

  test('a "Mostrar mais" that adds nothing: a row that arrives later does not take the focus from another control', async () => {
    const s = await mountWith(band(7));
    one(s.area, '[data-parked="toggle"]').click();
    one(s.area, '[data-parked="more"]').focus();
    const before = s.state.reads;
    one(s.area, '[data-parked="more"]').click();
    await until(() => s.state.reads > before);
    await new Promise((r) => setTimeout(r, 20));
    s.state.wall = band(8);
    one(s.area, '[data-parked="toggle"]').focus();
    await s.refresh();
    assert.equal(active(), one(s.area, '[data-parked="toggle"]'), 'a new parked row did not take the focus from the band header');
  });

  test('after the rows were added the focus goes to the first of them once, and the next redraw leaves it on "Mostrar mais"', async () => {
    const s = await mountWith(band(7));
    one(s.area, '[data-parked="toggle"]').click();
    one(s.area, '[data-parked="more"]').focus();
    s.state.wall = band(12);
    const before = s.state.reads;
    one(s.area, '[data-parked="more"]').click();
    await until(() => s.state.reads > before);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(active(), one(s.area, '[data-parked-row="p7"] a'));
    one(s.area, '[data-parked="more"]').focus();
    s.state.wall = band(13);
    await s.refresh();
    assert.equal(active(), one(s.area, '[data-parked="more"]'), 'the memory of the first click was cleared');
  });
});

describe('#751: the focus stays inside an open failure popover', () => {
  async function failed(selector: string, cards: Card[]) {
    const s = await mountWith(wallOf(cards));
    s.state.failOpen = true;
    s.state.failCommand = true;
    const trigger = s.area.querySelector(selector)!;
    trigger.focus();
    trigger.click();
    await until(() => s.area.querySelector('.open-fail') !== null);
    return s;
  }

  test('the copy button of a card keeps the focus in the new node, never the link', async () => {
    const s = await failed('[data-key="local:c1"] .open-button', [blocked('c1')]);
    const copy = one(s.area, '[data-key="local:c1"] .open-copy');
    copy.focus();
    await s.refresh();
    const now = one(s.area, '[data-key="local:c1"] .open-copy');
    assert.notEqual(now, copy, 'the card was drawn again');
    assert.equal(active(), now);
  });

  test('the close button of a row popover keeps the focus, and so does the copy one', async () => {
    const s = await failed('[data-key="local:r1"] .open-icon', [session('r1')]);
    for (const selector of ['[data-key="local:r1"] .open-close', '[data-key="local:r1"] .open-copy']) {
      const control = one(s.area, selector);
      control.focus();
      await s.refresh();
      assert.equal(active(), one(s.area, selector), selector);
      assert.notEqual(active(), control);
    }
  });

  test('the popover of the other session is not the one the focus goes to', async () => {
    const s = await failed('[data-key="local:c1"] .open-button', [blocked('c1'), blocked('c2')]);
    one(s.area, '[data-key="local:c2"] .open-button').click();
    await until(() => s.area.querySelectorAll('.open-fail').length === 2);
    const copy = one(s.area, '[data-key="local:c2"] .open-copy');
    copy.focus();
    await s.refresh();
    assert.equal(active(), one(s.area, '[data-key="local:c2"] .open-copy'));
  });

  test('the popover is gone: the focus falls to the open button of the same key, never to the link', async () => {
    const s = await failed('[data-key="local:c1"] .open-button', [blocked('c1')]);
    one(s.area, '[data-key="local:c1"] .open-copy').focus();
    resetOpenStates();
    await s.refresh();
    assert.equal(s.area.querySelector('.open-fail'), null);
    assert.equal(active(), one(s.area, '[data-key="local:c1"] .open-button'));
  });

  test('#752: the session loses only the open action: the focus falls to the link of the session, not to the body', async () => {
    const none = { target: 'none', command: null };
    const cases: [string, string, (id: string, extra?: Card) => Card][] = [
      ['.open-copy', 'row', session],
      ['.open-close', 'row', session],
      ['.open-copy', 'card', blocked],
    ];
    for (const [where, shape, make] of cases) {
      const s = await failed(`[data-key="local:m1"] ${shape === 'row' ? '.open-icon' : '.open-button'}`, [make('m1'), session('z1')]);
      one(s.area, `[data-key="local:m1"] ${where}`).focus();
      s.state.wall = wallOf([make('m1', { open: none }), session('z1')]);
      await s.refresh();
      assert.equal(s.area.querySelector('[data-key="local:m1"] .open-icon, [data-key="local:m1"] .open-button'), null, `${shape} ${where}: the open action is gone`);
      assert.equal(active(), one(s.area, '[data-key="local:m1"] a.wall-link'), `${shape} ${where}: the focus is on the link of the session`);
      cleanup?.();
      cleanup = null;
    }
  });
});

describe('#751: the focus follows a session that became a nested child, a parked row, or the rows "Mostrar mais" adds', () => {
  const tree = { total: 1, blocked: 0, active: 1, parked: 0 };
  const treeOf = (n: number) => ({ total: n, blocked: 0, active: n, parked: 0 });

  test('a row that became a nested child of a leader with the tree open: the focus goes to the link of that child', async () => {
    const leader = blocked('lider', { tree, children: [kid('k1')] });
    const s = await mountWith(wallOf([leader, session('x')]));
    one(s.area, '[data-tree="lider"]').click();
    s.state.wall = wallOf([{ ...leader, tree: treeOf(2), children: [kid('k1'), kid('x')] }]);
    for (const selector of ['[data-key="local:x"] a.wall-link', '[data-key="local:x"] .open-icon']) {
      s.state.wall = wallOf([leader, session('x')]);
      await s.refresh();
      s.area.querySelector(selector)!.focus();
      s.state.wall = wallOf([{ ...leader, tree: treeOf(2), children: [kid('k1'), kid('x')] }]);
      await s.refresh();
      assert.equal(active(), s.area.querySelector('[data-child="x"] a'), selector);
    }
  });

  test('a card that became a nested child of a leader with the tree closed: the focus goes to the link of the leader', async () => {
    const leader = blocked('lider', { tree, children: [kid('k1')] });
    const s = await mountWith(wallOf([leader, blocked('x')]));
    s.area.querySelector('[data-key="local:x"] a.wall-link')!.focus();
    s.state.wall = wallOf([{ ...leader, tree: treeOf(2), children: [kid('k1'), kid('x')] }]);
    await s.refresh();
    assert.equal(active(), s.area.querySelector('[data-key="local:lider"] a.wall-link'));
  });

  test('a row that became a parked row with the band open: the focus goes to the link of the parked row', async () => {
    const s = await mountWith(wallOf([blocked('c1'), session('p1')], { parked: { total: 1, items: [parkedItem('p0')] } }));
    one(s.area, '[data-parked="toggle"]').click();
    for (const selector of ['[data-key="local:p1"] a.wall-link', '[data-key="local:p1"] .open-icon']) {
      s.state.wall = wallOf([blocked('c1'), session('p1')], { parked: { total: 1, items: [parkedItem('p0')] } });
      await s.refresh();
      s.area.querySelector(selector)!.focus();
      s.state.wall = wallOf([blocked('c1')], { parked: { total: 2, items: [parkedItem('p0'), parkedItem('p1')] } });
      await s.refresh();
      assert.equal(active(), s.area.querySelector('[data-parked-row="p1"] a'), selector);
    }
  });

  test('after "Mostrar mais" the focus goes to the first row that was not there', async () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => parkedItem(`p${i}`));
    const s = await mountWith(wallOf([blocked('c1')], { parked: { total: 12, items: items(7) } }));
    one(s.area, '[data-parked="toggle"]').click();
    const more = one(s.area, '[data-parked="more"]');
    more.focus();
    s.state.wall = wallOf([blocked('c1')], { parked: { total: 12, items: items(12) } });
    const before = s.state.reads;
    more.click();
    await until(() => s.state.reads > before);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(s.area.querySelectorAll('[data-parked-row]').length, 12);
    assert.equal(active(), s.area.querySelector('[data-parked-row="p7"] a'));
  });
});

describe('#752: the focus when the state filter hides the session it was on', () => {
  const idle = (id: string) => session(id, { status: 'waiting', state: 'idle', attention: { level: 'idle', reason: 'turn_ended' } });
  const pressed = (s: Awaited<ReturnType<typeof mountWith>>) => one(s.area, '.wall-seg button[aria-pressed="true"]');

  test('the link, the open button and the popover controls of a hidden session hand the focus to the pressed segment', async () => {
    for (const where of ['a.wall-link', '.open-icon', '.open-button', '.open-copy', '.open-close']) {
      const popover = where === '.open-copy' || where === '.open-close';
      const s = await mountWith(wallOf([session('a1'), idle('i1')]));
      if (popover) {
        s.state.failOpen = true;
        s.state.failCommand = true;
        const trigger = one(s.area, '[data-key="local:a1"] .open-icon');
        trigger.focus();
        trigger.click();
        await until(() => s.area.querySelector('.open-fail') !== null);
      }
      const control = s.area.querySelector(`[data-key="local:a1"] ${where}`);
      if (!control) continue;
      control.focus();
      one(s.area, '[data-filter="idle"]').click();
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(s.area.querySelector('[data-key="local:a1"]'), null, `${where}: the session is hidden`);
      assert.equal(active(), pressed(s), `${where}: the focus is on the pressed segment`);
      assert.equal(pressed(s).getAttribute('data-filter'), 'idle');
      cleanup?.();
      cleanup = null;
    }
  });

  test('the toggle of a tree and the controls of a card follow the same road', async () => {
    const leader = session('l1', { tree: { total: 1, blocked: 0, active: 1, parked: 0 }, children: [kid('k1')] });
    const s = await mountWith(wallOf([leader, idle('i1')]));
    const toggle = s.area.querySelector('[data-key="local:l1"] .wall-treeline')!;
    toggle.focus();
    one(s.area, '[data-filter="idle"]').click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(active(), pressed(s));
    cleanup?.();
    cleanup = null;
    const c = await mountWith(wallOf([blocked('b1'), idle('i1')]));
    one(c.area, '[data-key="local:b1"] .open-button').focus();
    one(c.area, '[data-filter="idle"]').click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(active(), pressed(c));
  });
});

describe('#752: a session that changes section keeps the focus on the same kind of control', () => {
  const idle = (id: string) => session(id, { status: 'waiting', state: 'idle', attention: { level: 'idle', reason: 'turn_ended' } });
  const done = (id: string) => session(id, { status: 'completed', state: 'completed', activity: { type: 'completed', text: '' } });
  const shapes: [string, (id: string) => Card][] = [['active', (id) => session(id)], ['idle', idle], ['completed', done], ['blocked', (id) => blocked(id)]];

  test('the link and the open button of a session moving through active, idle, completed and blocked', async () => {
    for (const [, from] of shapes) {
      for (const [target, to] of shapes) {
        for (const where of ['a.wall-link', '.open-icon, .open-button']) {
          const s = await mountWith(wallOf([from('m1'), session('z1')]));
          const control = s.area.querySelector(`[data-key="local:m1"] ${where}`)!;
          control.focus();
          s.state.wall = wallOf([to('m1'), session('z1')]);
          await s.refresh();
          const now = active();
          assert.ok(now, `${where} -> ${target}: the focus is somewhere`);
          assert.equal(now!.closest('[data-key="local:m1"]')?.getAttribute('data-key'), 'local:m1', `${where} -> ${target}: the focus stays in the session`);
          cleanup?.();
          cleanup = null;
        }
      }
    }
  });

  test('copy and close of the popover: on a row they stay; a card has no Fechar, so the focus falls to its open button', async () => {
    for (const [target, to] of shapes) {
      for (const where of ['.open-copy', '.open-close']) {
        const s = await mountWith(wallOf([session('m1'), session('z1')]));
        s.state.failOpen = true;
        s.state.failCommand = true;
        const trigger = one(s.area, '[data-key="local:m1"] .open-icon');
        trigger.focus();
        trigger.click();
        await until(() => s.area.querySelector('.open-fail') !== null);
        one(s.area, `[data-key="local:m1"] ${where}`).focus();
        s.state.wall = wallOf([to('m1'), session('z1')]);
        await s.refresh();
        const now = active();
        assert.ok(now, `${where} -> ${target}: the focus is somewhere`);
        const inSession = now!.closest('[data-key="local:m1"]');
        assert.ok(inSession, `${where} -> ${target}: the focus stays in the session`);
        if (target === 'blocked' && where === '.open-close') assert.ok(now!.classList.contains('open-button'), 'a card has no Fechar: the focus falls to its open button');
        cleanup?.();
        cleanup = null;
      }
    }
  });
});

describe('#751: "Ver sessão" keeps the focus through a redraw', () => {
  const noOpen = (id: string, extra: Card = {}) => blocked(id, { open: null, ...extra });

  test('the focus on "Ver sessão" goes back to the same one of the same session key after a re-read', async () => {
    const s = await mountWith(wallOf([noOpen('c1'), noOpen('c2')]));
    const second = one(s.area, '[data-key="local:c2"] a[data-see]');
    assert.equal(second.getAttribute('href'), '/ui/sessions/c2');
    second.focus();
    s.state.wall = wallOf([noOpen('c0'), noOpen('c1'), noOpen('c2')]);
    await s.refresh();
    assert.equal(active(), one(s.area, '[data-key="local:c2"] a[data-see]'), 'the "Ver sessão" of c2, not another');
    assert.equal(s.area.querySelectorAll('a[data-see]').length, 3);
  });

  test('a filter that keeps the card keeps the focus on its "Ver sessão"; one that drops it leaves no focus on a missing node', async () => {
    const s = await mountWith(wallOf([noOpen('c1'), session('r1')]));
    const see = one(s.area, '[data-key="local:c1"] a[data-see]');
    see.focus();
    one(s.area, '[data-filter="blocked"]').click();
    assert.equal(active(), one(s.area, '[data-key="local:c1"] a[data-see]'));
    one(s.area, '[data-filter="active"]').click();
    assert.ok(!active() || s.area.contains(active()!), 'the focus is on a node still on screen, or nowhere');
  });

  test('the session gets an open: the focus on its "Ver sessão" falls back to the link of the same key, never lost', async () => {
    const s = await mountWith(wallOf([noOpen('c1')]));
    one(s.area, '[data-key="local:c1"] a[data-see]').focus();
    s.state.wall = wallOf([blocked('c1')]);
    await s.refresh();
    assert.equal(active(), one(s.area, '[data-key="local:c1"] a.wall-link'));
  });

  test('the neighbours still restore by key: the open button, the link and the Ver sessão of another card in the same redraw', async () => {
    const s = await mountWith(wallOf([blocked('c1'), noOpen('c2')]));
    one(s.area, '[data-key="local:c1"] .open-button').focus();
    await s.refresh();
    assert.equal(active(), one(s.area, '[data-key="local:c1"] .open-button'));
    one(s.area, '[data-key="local:c2"] a.wall-link').focus();
    await s.refresh();
    assert.equal(active(), one(s.area, '[data-key="local:c2"] a.wall-link'));
  });
});
