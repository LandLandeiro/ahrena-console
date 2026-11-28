// #754, layer B: the Projeto mode. A button at the sidebar foot, the choice kept in localStorage and applied before the first
// paint, the Exibir preset of the mode (kept apart from Dev's), "Conversa quase cheia" from 80%, and a switch that redraws
// the Mural in place without moving the focus or the scroll.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { ElementoFalso, documentoFalso, instalarDomFalso, useNodeListQueries } from './fake-dom.ts';

instalarDomFalso();
Object.assign(globalThis, {
  reportError: (e: unknown) => {
    throw e;
  },
  location: { pathname: '/ui/wall', search: '', hash: '' },
  history: { state: null, replaceState: () => {}, pushState: () => {} },
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
});

// @ts-expect-error: browser module, plain JavaScript
const modeModule = await import('../../ui/mode.js');
// @ts-expect-error: idem
const display = await import('../../ui/display.js');
// @ts-expect-error: idem
const labels = await import('../../ui/state-labels.js');
// @ts-expect-error: idem
const { ICON_NAMES } = await import('../../ui/dom.js');
// @ts-expect-error: idem
const wall = await import('../../ui/screens/wall.js');
// @ts-expect-error: idem
const { resetOpenStates } = await import('../../ui/open-action.js');
// @ts-expect-error: idem
const { resetMachineChoice } = await import('../../ui/machine-filter.js');

const read = (file: string) => readFileSync(`${UI_FOLDER}${file}`, 'utf8');
const INIT = read('theme-init.js');
const html = read('index.html');
const app = read('app.js');

const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('did not happen in time');
    await new Promise((r) => setTimeout(r, 5));
  }
};
const store = new Map<string, string>();
const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };

beforeEach(() => {
  useNodeListQueries(true);
  store.clear();
  display.resetDisplayMemory();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  documentoFalso.activeElement = null;
  modeModule.setAppMode('dev', { root: new ElementoFalso('html'), storage });
  store.clear();
});
afterEach(() => {
  useNodeListQueries(false);
  delete (globalThis as Record<string, unknown>).localStorage;
  modeModule.setAppMode('dev', { root: new ElementoFalso('html'), storage });
});

function runInit(saved: Record<string, string> | 'denied' | undefined) {
  const attributes = new Map<string, string>();
  const documentElement = { setAttribute: (k: string, v: string) => void attributes.set(k, v), getAttribute: (k: string) => attributes.get(k) ?? null };
  const ls =
    saved === 'denied'
      ? { getItem: () => { throw new Error('SecurityError'); } }
      : saved === undefined
        ? undefined
        : { getItem: (k: string) => saved[k] ?? null };
  runInNewContext(INIT, { document: { documentElement }, ...(ls === undefined ? {} : { localStorage: ls }) });
  return attributes;
}

describe('#754 the mode before the first paint', () => {
  test('theme-init.js sets data-mode from ahrena-console-mode; anything else is ignored; the theme still works', () => {
    assert.equal(runInit({ 'ahrena-console-mode': 'project' }).get('data-mode'), 'project');
    assert.equal(runInit({ 'ahrena-console-mode': 'dev' }).get('data-mode'), 'dev');
    for (const bad of ['', 'Project', 'projeto', '<script>', ' dev']) assert.equal(runInit({ 'ahrena-console-mode': bad }).get('data-mode') ?? null, null, JSON.stringify(bad));
    const both = runInit({ 'ahrena-console-mode': 'project', 'ahrena-console-theme': 'dark' });
    assert.equal(both.get('data-theme'), 'dark');
    assert.equal(both.get('data-mode'), 'project');
  });

  test('no storage, or a denied one, loads the page in Dev', () => {
    assert.equal(runInit(undefined).get('data-mode') ?? null, null);
    assert.equal(runInit('denied').get('data-mode') ?? null, null);
  });

  test('the script stays classic and inline-free, and index.html still loads it before the styles and the module', () => {
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/);
    assert.ok(html.indexOf('/ui/theme-init.js') < html.indexOf('<link rel="stylesheet"'));
  });
});

describe('#754 the mode module', () => {
  test('the key, the two modes and the briefcase icon', () => {
    assert.equal(modeModule.MODE_KEY, 'ahrena-console-mode');
    assert.deepEqual([...modeModule.MODES], ['dev', 'project']);
    assert.ok(ICON_NAMES.includes('briefcase'));
  });

  function mount(saved: string | null = null) {
    if (saved) store.set('ahrena-console-mode', saved);
    const root = new ElementoFalso('html');
    const button = new ElementoFalso('button');
    modeModule.createModeButton({ button, root, storage });
    return { root, button };
  }
  const iconOf = (button: ElementoFalso) => button.querySelector('svg');

  test('in Dev the button offers Projeto: aria-label, title and the briefcase say what the click does', () => {
    const { button, root } = mount();
    assert.equal(button.getAttribute('aria-label'), 'Ver como Projeto');
    assert.equal(button.getAttribute('title'), 'Ver como Projeto');
    assert.equal(button.getAttribute('type'), 'button');
    assert.ok(iconOf(button), 'it draws an icon');
    assert.equal(root.getAttribute('data-mode'), 'dev');
    assert.equal(modeModule.appMode(), 'dev');
  });

  test('the click goes to Projeto: stored, on <html>, in the state labels and in the display, and the label offers Dev', () => {
    const { button, root } = mount();
    button.click();
    assert.equal(store.get('ahrena-console-mode'), 'project');
    assert.equal(root.getAttribute('data-mode'), 'project');
    assert.equal(modeModule.appMode(), 'project');
    assert.equal(labels.stateLabelMode(), 'project');
    assert.equal(display.displayMode(), 'project');
    assert.equal(button.getAttribute('aria-label'), 'Ver como Dev');
    assert.equal(button.getAttribute('title'), 'Ver como Dev');
    button.click();
    assert.equal(store.get('ahrena-console-mode'), 'dev');
    assert.equal(labels.stateLabelMode(), 'dev');
    assert.equal(display.displayMode(), 'dev');
    assert.equal(button.getAttribute('aria-label'), 'Ver como Projeto');
  });

  test('a saved Projeto is applied when the button is created, before any draw', () => {
    const { button, root } = mount('project');
    assert.equal(labels.stateLabelMode(), 'project');
    assert.equal(display.displayMode(), 'project');
    assert.equal(root.getAttribute('data-mode'), 'project');
    assert.equal(button.getAttribute('aria-label'), 'Ver como Dev');
  });

  test('a saved value that is not a mode is Dev; a full storage still switches the page', () => {
    assert.equal(mount('purple').root.getAttribute('data-mode'), 'dev');
    const root = new ElementoFalso('html');
    const button = new ElementoFalso('button');
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    modeModule.createModeButton({ button, root, storage: full });
    button.click();
    assert.equal(root.getAttribute('data-mode'), 'project');
    assert.equal(labels.stateLabelMode(), 'project');
  });

  test('onModeChange tells the listener the new mode after every switch, and stops when asked', () => {
    const { button } = mount();
    const seen: string[] = [];
    const stop = modeModule.onModeChange((m: string) => seen.push(m));
    button.click();
    button.click();
    stop();
    button.click();
    assert.deepEqual(seen, ['project', 'dev']);
  });

  test('setAppMode refuses what is not a mode and the mode stays', () => {
    assert.equal(modeModule.setAppMode('purple', { storage }), false);
    assert.equal(modeModule.appMode(), 'dev');
  });

  test('the label obeys the voice: at most 4 words and 28 characters, no "!" and no em dash', () => {
    for (const label of ['Ver como Projeto', 'Ver como Dev']) {
      assert.ok(label.split(' ').length <= 4 && label.length <= 28 && !/[!—]/.test(label), label);
    }
  });
});

describe('#754 the markup and the shell', () => {
  test('the button sits beside the theme button, with the same class, no inline handler', () => {
    assert.match(html, /<button type="button" class="cc-ibtn" id="theme-button"><\/button>\s*<button type="button" class="cc-ibtn" id="mode-button"><\/button>/);
  });

  test('app.js creates it before the first screen opens and lets a screen follow the switch', () => {
    assert.match(app, /import \{[^}]*createModeButton[^}]*\} from '\.\/mode\.js'/);
    const created = app.indexOf("createModeButton({ button: document.getElementById('mode-button') })");
    assert.ok(created > 0, 'wired to #mode-button');
    assert.ok(created < app.lastIndexOf('\nopen();'), 'before the first open()');
    assert.match(app, /onModeChange/);
  });

  test('a switch that no screen follows opens the screen again but leaves the drawer as it is', () => {
    assert.match(app, /showScreen\(\{ keepDrawer: true \}\)|keepDrawer/);
  });
});

describe('#754 the Exibir preset of Projeto', () => {
  test('Projeto hides model and cost, conversation use and branch at both densities; Dev is as before', () => {
    for (const density of ['comfortable', 'compact']) {
      const p = display.displayDefaults('project', density);
      assert.deepEqual(
        { model: p.show.model, usage: p.show.usage, branch: p.show.branch, agent: p.show.agent, phrase: p.show.phrase, plan: p.show.plan, machine: p.show.machine },
        { model: false, usage: false, branch: false, agent: true, phrase: true, plan: true, machine: true },
        density,
      );
    }
    assert.equal(display.displayDefaults('dev', 'compact').show.model, true);
  });

  test('with nothing stored, the current mode answers with its own defaults', () => {
    modeModule.setAppMode('dev', { storage });
    display.chooseDensity('compact');
    assert.equal(display.getDisplay().show.branch, true);
    modeModule.setAppMode('project', { storage });
    assert.equal(display.getDisplay().density, 'comfortable', 'Projeto has not chosen a density');
    assert.equal(display.getDisplay().show.branch, false);
  });

  test('Projeto stays editable and is stored apart from Dev', () => {
    modeModule.setAppMode('project', { storage });
    display.setField('branch', true);
    assert.equal(display.getDisplay().show.branch, true);
    assert.ok(store.get('ahrena-console-display-project'));
    assert.equal(store.get('ahrena-console-display') ?? null, null, 'Dev is untouched');
    modeModule.setAppMode('dev', { storage });
    assert.equal(display.getDisplay().show.branch, false, 'Dev keeps its own comfortable default');
    modeModule.setAppMode('project', { storage });
    assert.equal(display.getDisplay().show.branch, true, 'and Projeto remembers');
  });
});

describe('#754 "Conversa quase cheia"', () => {
  test('the words come from state-labels, equal in both columns and inside the voice', () => {
    for (const mode of ['dev', 'project']) {
      labels.setStateLabelMode(mode);
      const text = labels.stateLabel('context_high');
      assert.equal(text, 'Conversa quase cheia');
      assert.ok(text.split(' ').length <= 4 && text.length <= 28);
    }
    labels.setStateLabelMode('dev');
  });

  test('Projeto: the use of the conversation comes back from 80% as the warning, with no number; below 80% it is gone', () => {
    modeModule.setAppMode('project', { storage });
    assert.equal(wall.cardContent({ id: 'a', status: 'active', context: { pct: 79 } }).usage, null);
    const at80 = wall.cardContent({ id: 'a', status: 'active', context: { pct: 80 } }).usage;
    assert.deepEqual({ label: at80.label, high: at80.high }, { label: 'Conversa quase cheia', high: true });
    assert.equal(wall.cardContent({ id: 'a', status: 'active', context: { pct: 95 } }).usage.label, 'Conversa quase cheia');
  });

  test('Dev keeps its rule: the number from 90%', () => {
    assert.equal(wall.cardContent({ id: 'a', status: 'active', context: { pct: 85 } }).usage, null);
    assert.equal(wall.cardContent({ id: 'a', status: 'active', context: { pct: 90 } }).usage.label, 'Uso da conversa 90%');
  });
});

describe('#754 the Mural in the two modes', () => {
  type Card = Record<string, unknown>;
  const session = (id: string, extra: Card = {}): Card => ({
    id,
    title: `Sessão ${id}`,
    project: 'projeto-exemplo',
    branch: 'feat/1-exemplo',
    status: 'active',
    state: 'active',
    since: '2026-10-20T12:00:00Z',
    activity: { type: 'tool', text: 'Rodar a bateria' },
    model: 'claude-opus-5-5',
    cost: { usd: 1.84, estimate: true },
    plan: { done: 1, total: 4, current: 'x' },
    context: { pct: 31 },
    open: { target: 'desktop', command: null },
    ...extra,
  });
  const blocked = (id: string, extra: Card = {}) => session(id, { status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'permission' }, activity: { type: 'permission', text: 'Rodar a bateria?' }, ...extra });

  async function start(cards: Card[]) {
    resetOpenStates();
    resetMachineChoice();
    const area = new ElementoFalso('main');
    const leave = new AbortController();
    const followers: (() => void)[] = [];
    let scroll = 0;
    Object.defineProperty(area, 'scrollTop', { get: () => scroll, set: (v: number) => void (scroll = v) });
    const ctx = {
      params: {},
      signal: leave.signal,
      read: async (route: string) => (route.startsWith('/api/new-session/folders') ? { folders: [], targets: {} } : structuredClone({ version: 1, count: { all: cards.length, blocked: 1, idle: 0 }, cards })),
      write: async () => ({ ok: true }),
      onChange: () => {},
      onRestart: () => {},
      onModeChange: (f: () => void) => void followers.push(f),
      counter: () => {},
      title: () => {},
      navigate: () => {},
      liveState: () => 'live',
    };
    const stop = (await wall.mount(area, ctx)) as () => void;
    await until(() => area.querySelector('[data-session]') !== null);
    return { area, stop, followers, scrollTo: (v: number) => (scroll = v), scrolled: () => scroll };
  }
  const text = (area: ElementoFalso, id: string, selector: string) => area.querySelector(`[data-session="${id}"]`)?.querySelector(selector)?.textContent ?? null;
  const cards = () => [blocked('card-1', { context: { pct: 85 } }), session('row-1')];

  test('the Mural asks to follow the mode, and a switch redraws it in place: the fields of Projeto, the same sessions', async () => {
    modeModule.setAppMode('dev', { storage });
    display.chooseDensity('compact');
    const { area, stop, followers } = await start(cards());
    assert.equal(followers.length, 1, 'the Mural registers once with the shell');
    assert.equal(text(area, 'row-1', '.wall-tech'), 'claude-opus-5-5 · ~US$ 1,84 · uso 31% · feat/1-exemplo');
    modeModule.setAppMode('project', { storage });
    followers.forEach((f) => f());
    await until(() => text(area, 'row-1', '.wall-tech') === null);
    assert.ok(area.querySelector('[data-session="row-1"]'));
    assert.ok(area.querySelector('[data-session="card-1"]'));
    stop();
  });

  test('what asks for action never disappears: in Projeto the blocked card stays, with "Conversa quase cheia" from 80%', async () => {
    modeModule.setAppMode('project', { storage });
    const { area, stop } = await start(cards());
    assert.ok(area.querySelector('[data-session="card-1"]'));
    assert.equal(text(area, 'card-1', '[data-foot="usage"]'), 'Conversa quase cheia');
    assert.equal(text(area, 'row-1', '[data-foot="usage"]'), null);
    stop();
  });

  test('the switch keeps the focus on the same control and the scroll where it was', async () => {
    modeModule.setAppMode('dev', { storage });
    const { area, stop, followers, scrollTo, scrolled } = await start(cards());
    const link = area.querySelector('[data-session="row-1"] a')!;
    link.focus();
    scrollTo(240);
    modeModule.setAppMode('project', { storage });
    followers.forEach((f) => f());
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(documentoFalso.activeElement, area.querySelector('[data-session="row-1"] a'), 'the focus is on the same link of the same session');
    assert.equal(scrolled(), 240, 'the scroll did not move');
    stop();
  });

  test('the numbers that count what waits are the same in both modes', async () => {
    modeModule.setAppMode('dev', { storage });
    const dev = await start(cards());
    const inDev = dev.area.querySelector('[data-filter="blocked"]')?.textContent;
    dev.stop();
    modeModule.setAppMode('project', { storage });
    const project = await start(cards());
    const inProject = project.area.querySelector('[data-filter="blocked"]')?.textContent;
    project.stop();
    assert.ok(inDev && /1/.test(inDev), inDev);
    assert.equal(inProject, inDev);
  });
});
