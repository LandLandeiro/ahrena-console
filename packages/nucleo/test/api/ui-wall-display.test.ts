// #754: the "Exibir" panel of the Mural: the density and the fields each session shows, kept in the localStorage like the
// theme. Three layers in one file, all against the fake DOM and invented data: the stored value (ui/display.js), the panel
// that opens from the one popover of #762 (ui/display-panel.js) and what the wall draws from it (ui/wall-display.js, wall.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { ElementoFalso, documentoFalso, instalarDomFalso, querySelectorAllComoNodeList } from './fake-dom.ts';

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
const display = await import('../../ui/display.js');
// @ts-expect-error: idem
const { displayButton } = await import('../../ui/display-panel.js');
// @ts-expect-error: idem
const { techLine, machineShown } = await import('../../ui/wall-display.js');
// @ts-expect-error: idem
const wall = await import('../../ui/screens/wall.js');
// @ts-expect-error: idem
const { resetOpenStates } = await import('../../ui/open-action.js');
// @ts-expect-error: idem
const { resetMachineChoice } = await import('../../ui/machine-filter.js');

const css = readFileSync(new URL('../../ui/wall.css', import.meta.url), 'utf8');
const storage = new Map<string, string>();
const useStorage = () =>
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) },
  });

beforeEach(() => {
  querySelectorAllComoNodeList(true);
  storage.clear();
  useStorage();
  display.setDisplayMode('dev');
  documentoFalso.activeElement = null;
});
afterEach(() => {
  querySelectorAllComoNodeList(false);
  delete (globalThis as Record<string, unknown>).localStorage;
  display.setDisplayMode('dev');
});

const all = (root: ElementoFalso, selector: string) => Array.from(root.querySelectorAll(selector));
const one = (root: ElementoFalso, selector: string) => {
  const found = root.querySelector(selector);
  assert.ok(found, `no ${selector}`);
  return found;
};
const key = (node: ElementoFalso, name: string, extra: Record<string, unknown> = {}) => node.dispatchEvent({ type: 'keydown', key: name, ...extra });
const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('did not happen in time');
    await new Promise((r) => setTimeout(r, 5));
  }
};
const FIELDS = ['agent', 'phrase', 'plan', 'machine', 'model', 'usage', 'branch'];

describe('#754: the stored value (display.js)', () => {
  test('the Dev key is the one the issue names; the Projeto value has a key of its own', () => {
    assert.equal(display.DISPLAY_KEY, 'ahrena-console-display');
    assert.equal(display.DISPLAY_KEY_PROJECT, 'ahrena-console-display-project');
    assert.deepEqual([...display.DENSITIES], ['comfortable', 'compact']);
    assert.deepEqual([...display.FIELDS], FIELDS);
  });

  test('the defaults: comfortable keeps today\'s wall; compact turns the technical fields on', () => {
    const comfortable = display.displayDefaults('dev', 'comfortable');
    assert.equal(comfortable.density, 'comfortable');
    assert.deepEqual(comfortable.show, { agent: true, phrase: true, plan: true, machine: true, model: false, usage: false, branch: false });
    const compact = display.displayDefaults('dev', 'compact');
    assert.equal(compact.density, 'compact');
    assert.deepEqual(compact.show, { agent: true, phrase: true, plan: true, machine: true, model: true, usage: true, branch: true });
  });

  test('without a stored value, the defaults; a value that is not valid is the defaults, field by field', () => {
    assert.deepEqual(display.readDisplay('dev'), display.displayDefaults('dev'));
    for (const raw of ['', 'not json', '[]', 'null', '"compact"', '{"density":"huge"}', '{"density":7,"show":"x"}']) {
      storage.set(display.DISPLAY_KEY, raw);
      assert.deepEqual(display.readDisplay('dev'), display.displayDefaults('dev'), raw);
    }
    storage.set(display.DISPLAY_KEY, JSON.stringify({ v: 1, density: 'compact', show: { model: 'yes', branch: false, unknown: true } }));
    const read = display.readDisplay('dev');
    assert.equal(read.density, 'compact');
    assert.equal(read.show.model, true, 'a field that is not a boolean falls back to the density default');
    assert.equal(read.show.branch, false);
    assert.equal('unknown' in read.show, false, 'a field the panel does not know is dropped');
  });

  test('writing keeps the value across a reload, in JSON with a version', () => {
    display.writeDisplay('dev', { density: 'compact', show: { ...display.displayDefaults('dev', 'compact').show, branch: false } });
    const stored = JSON.parse(storage.get(display.DISPLAY_KEY)!);
    assert.equal(stored.v, 1);
    assert.equal(stored.density, 'compact');
    assert.equal(stored.show.branch, false);
    assert.equal(display.readDisplay('dev').show.branch, false);
  });

  test('the two modes keep two values: writing one never touches the other key', () => {
    display.writeDisplay('dev', { density: 'compact', show: null });
    assert.equal(storage.has(display.DISPLAY_KEY_PROJECT), false);
    display.writeDisplay('project', { density: 'comfortable', show: null });
    assert.equal(JSON.parse(storage.get(display.DISPLAY_KEY)!).density, 'compact');
    assert.equal(display.readDisplay('project').density, 'comfortable');
  });

  test('setDisplayMode: dev or project; anything else is refused and the mode stays; getDisplay follows the mode', () => {
    assert.equal(display.displayMode(), 'dev');
    storage.set(display.DISPLAY_KEY, JSON.stringify({ v: 1, density: 'compact', show: null }));
    storage.set(display.DISPLAY_KEY_PROJECT, JSON.stringify({ v: 1, density: 'comfortable', show: null }));
    assert.equal(display.getDisplay().density, 'compact');
    assert.equal(display.setDisplayMode('project'), true);
    assert.equal(display.getDisplay().density, 'comfortable');
    assert.equal(display.setDisplayMode('wide'), false);
    assert.equal(display.setDisplayMode(null), false);
    assert.equal(display.displayMode(), 'project');
  });

  test('choosing a density keeps it, resets the fields to the density and tells the listeners; a field is kept apart', () => {
    const heard: string[] = [];
    const stop = display.onDisplayChange((v: { density: string }) => heard.push(v.density));
    display.chooseDensity('compact');
    assert.equal(display.getDisplay().show.model, true);
    display.setField('branch', false);
    assert.equal(display.getDisplay().show.branch, false);
    assert.equal(display.getDisplay().show.model, true);
    display.chooseDensity('comfortable');
    assert.equal(display.getDisplay().show.model, false, 'the density brings its own fields back');
    assert.deepEqual(heard, ['compact', 'compact', 'comfortable']);
    stop();
    display.chooseDensity('compact');
    assert.equal(heard.length, 3, 'a stopped listener hears nothing');
    assert.equal(display.chooseDensity('huge'), false);
    assert.equal(display.setField('nope', true), false);
  });

  test('a storage that is denied or full does not throw: the choice lasts in memory', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('full');
        },
      },
    });
    assert.deepEqual(display.readDisplay('dev'), display.displayDefaults('dev'));
    display.chooseDensity('compact');
    assert.equal(display.getDisplay().density, 'compact');
  });
});

describe('#754: what the wall draws from it (wall-display.js)', () => {
  const card = { model: 'claude-opus-5-5', cost: { usd: 1.84, estimate: true }, branch: 'feat/1-exemplo', context: { pct: 31 } };
  const on = display.displayDefaults('dev', 'compact').show;

  test('the mono line: model, cost, conversation use and branch, only the ones that are on and that the session has', () => {
    assert.equal(techLine(card, on), 'claude-opus-5-5 · ~US$ 1,84 · uso 31% · feat/1-exemplo');
    assert.equal(techLine(card, { ...on, branch: false }), 'claude-opus-5-5 · ~US$ 1,84 · uso 31%');
    assert.equal(techLine(card, { ...on, model: false }), 'uso 31% · feat/1-exemplo');
    assert.equal(techLine({ ...card, model: null, cost: { usd: null, estimate: true } }, on), 'uso 31% · feat/1-exemplo', 'a gap in the payload is left out, never "null"');
    assert.equal(techLine({ ...card, branch: null, context: null }, on), 'claude-opus-5-5 · ~US$ 1,84');
    assert.equal(techLine({}, on), '');
    assert.equal(techLine(card, display.displayDefaults('dev', 'comfortable').show), '', 'no technical field on, no line');
  });

  test('the machine: only when it is not this one; in the Dev compact always (M7), once a remote is known', () => {
    const show = on;
    const base = { show, density: 'comfortable', mode: 'dev', remote: false, known: true };
    assert.equal(machineShown({ ...base, remote: true }), true);
    assert.equal(machineShown(base), false, 'this machine on a comfortable row says nothing');
    assert.equal(machineShown({ ...base, density: 'compact' }), true, 'the Dev compact says it on every row');
    assert.equal(machineShown({ ...base, density: 'compact', known: false }), false, 'with no remote known there is nothing to tell apart');
    assert.equal(machineShown({ ...base, density: 'compact', mode: 'project' }), false);
    assert.equal(machineShown({ ...base, remote: true, show: { ...show, machine: false } }), false, 'the field off hides it');
  });
});

describe('#754: the Exibir panel (display-panel.js)', () => {
  function mountButton() {
    const host = new ElementoFalso('div');
    const changes: unknown[] = [];
    const root = displayButton({ onChange: (v: unknown) => changes.push(v) });
    host.append(root);
    const button = one(root, 'button');
    return { host, root, button, changes };
  }

  test('a button "Exibir" that opens the one popover (#762): a dialog titled Exibir, no popup of its own', () => {
    const { root, button } = mountButton();
    assert.equal(button.textContent, 'Exibir');
    assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    button.click();
    const pop = one(root, '.pop');
    assert.equal(pop.getAttribute('role'), 'dialog');
    assert.equal(pop.getAttribute('aria-label'), 'Exibir');
    assert.equal(button.getAttribute('aria-expanded'), 'true');
  });

  test('Densidade is a segmented control, Confortável | Compacto; Mostrar has the seven fields as checkboxes', () => {
    const { root, button } = mountButton();
    button.click();
    const radios = all(root, '.pop [role="radio"]');
    assert.deepEqual(radios.map((r) => r.textContent), ['Confortável', 'Compacto']);
    assert.equal(one(root, '.pop [role="radiogroup"]').parentNode!.textContent.startsWith('Densidade'), true);
    const boxes = all(root, '.pop input[type="checkbox"]');
    assert.deepEqual(boxes.map((b) => b.getAttribute('data-field')), FIELDS);
    const labels = boxes.map((b) => b.parentNode!.textContent);
    assert.deepEqual(labels, ['Agente', 'O que está fazendo', 'Progresso do plano', 'Máquina', 'Modelo e custo', 'Uso da conversa', 'Branch']);
    for (const l of labels) assert.ok(l.length <= 28 && l.split(/\s+/).length <= 4 && !/[!—]/.test(l), l);
    assert.equal(one(root, '.pop fieldset legend').textContent, 'Mostrar');
  });

  test('choosing Compacto stores it, turns the technical fields on in the boxes and tells the screen', () => {
    const { root, button, changes } = mountButton();
    button.click();
    const compact = all(root, '.pop [role="radio"]').find((r) => r.textContent === 'Compacto')!;
    compact.click();
    assert.equal(JSON.parse(storage.get('ahrena-console-display')!).density, 'compact');
    assert.equal(changes.length, 1);
    const box = (id: string) => one(root, `.pop input[data-field="${id}"]`) as unknown as { checked: boolean };
    assert.equal(box('model').checked, true);
    assert.equal(box('branch').checked, true);
  });

  test('a box writes the field and tells the screen; the choice is read back after a reload', () => {
    const { root, button, changes } = mountButton();
    button.click();
    const branch = one(root, '.pop input[data-field="branch"]') as unknown as ElementoFalso & { checked: boolean };
    branch.checked = true;
    branch.dispatchEvent({ type: 'change' });
    assert.equal(changes.length, 1);
    assert.equal(display.readDisplay('dev').show.branch, true);
    const again = mountButton();
    again.button.click();
    assert.equal((one(again.root, '.pop input[data-field="branch"]') as unknown as { checked: boolean }).checked, true, 'a new page opens on the stored choice');
  });

  test('the keyboard: the focus goes to the first control, Tab cycles inside, Esc closes and gives the focus back', () => {
    const { root, button } = mountButton();
    button.focus();
    button.click();
    const pop = one(root, '.pop');
    const first = documentoFalso.activeElement!;
    assert.equal(first.getAttribute('role'), 'radio');
    assert.equal(first.getAttribute('aria-checked'), 'true');
    assert.ok(pop.contains(first), 'the first control is inside the panel');
    const close = all(pop, 'button').find((b) => b.textContent === 'Fechar')!;
    close.focus();
    key(close, 'Tab');
    assert.equal(documentoFalso.activeElement, first, 'Tab on the last control goes to the first');
    key(first, 'Tab', { shiftKey: true });
    assert.equal(documentoFalso.activeElement, close, 'Shift+Tab on the first goes to the last');
    key(documentoFalso.activeElement as ElementoFalso, 'Escape');
    assert.equal(root.querySelector('.pop'), null, 'Esc closes it');
    assert.equal(documentoFalso.activeElement, button, 'and the focus is back on the button');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
  });

  test('Esc with the focus on a box also closes and returns the focus', () => {
    const { root, button } = mountButton();
    button.focus();
    button.click();
    const box = one(root, '.pop input[data-field="agent"]');
    box.focus();
    key(box, 'Escape');
    assert.equal(root.querySelector('.pop'), null);
    assert.equal(documentoFalso.activeElement, button);
  });
});

// ---------- The wall ----------

type Card = Record<string, unknown>;
const open = { target: 'desktop', command: null };
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
  open,
  ...extra,
});
const blocked = (id: string, extra: Card = {}) => session(id, { status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'question' }, activity: { type: 'question', text: 'Confere a v0.0.36?' }, ...extra });
const WS = { id: 'ws', label: 'Workstation', state: 'connected' };
const LOCAL = { id: 'local', label: 'Esta máquina', state: 'connected' };

async function start(cards: Card[], extra: Card = {}) {
  resetOpenStates();
  resetMachineChoice();
  const area = new ElementoFalso('main');
  const leave = new AbortController();
  const ctx = {
    params: {},
    signal: leave.signal,
    read: async (route: string) => (route.startsWith('/api/new-session/folders') ? { folders: [], targets: {} } : structuredClone({ version: 1, count: { all: cards.length }, cards, ...extra })),
    write: async () => ({ ok: true }),
    onChange: () => {},
    onRestart: () => {},
    counter: () => {},
    title: () => {},
    navigate: () => {},
    liveState: () => 'live',
  };
  const stop = (await wall.mount(area, ctx)) as () => void;
  await until(() => area.querySelector('[data-session]') !== null);
  return { area, stop };
}
const sessionNode = (area: ElementoFalso, id: string) => one(area, `[data-session="${id}"]`);
const textOf = (area: ElementoFalso, id: string, selector: string) => sessionNode(area, id).querySelector(selector)?.textContent ?? null;

describe('#754: the wall with the choice', () => {
  const sessions = () => [blocked('card-1'), session('row-1')];

  test('a button Exibir sits in the header, beside Nova sessão', async () => {
    const { area, stop } = await start(sessions());
    const act = one(area, '.wall-top-act');
    const names = all(act, 'button').map((b) => b.textContent);
    assert.ok(names.includes('Exibir') && names.includes('Nova sessão'), names.join('|'));
    stop();
  });

  test('comfortable (the default) draws the wall as it was: no technical line, no density mark', async () => {
    const { area, stop } = await start(sessions());
    assert.equal(area.getAttribute('data-wall-density'), 'comfortable');
    assert.equal(area.querySelector('.wall-tech'), null);
    stop();
  });

  test('compact marks the screen and draws the mono line on a card and on a row', async () => {
    display.chooseDensity('compact');
    const { area, stop } = await start(sessions());
    assert.equal(area.getAttribute('data-wall-density'), 'compact');
    for (const id of ['card-1', 'row-1']) assert.equal(textOf(area, id, '.wall-tech'), 'claude-opus-5-5 · ~US$ 1,84 · uso 31% · feat/1-exemplo', id);
    stop();
  });

  test('the choice is read on a new mount: it survives a reload', async () => {
    display.chooseDensity('compact');
    const first = await start(sessions());
    first.stop();
    const second = await start(sessions());
    assert.equal(second.area.getAttribute('data-wall-density'), 'compact');
    second.stop();
  });

  test('a branch the payload lacks does not appear, and nothing says "null"', async () => {
    display.chooseDensity('compact');
    const { area, stop } = await start([session('row-1', { branch: null })]);
    assert.equal(textOf(area, 'row-1', '.wall-tech'), 'claude-opus-5-5 · ~US$ 1,84 · uso 31%');
    assert.equal(area.textContent.includes('null'), false);
    stop();
  });

  test('changing a field in the panel redraws the wall at once', async () => {
    const { area, stop } = await start(sessions());
    const act = one(area, '.wall-top-act');
    const exibir = all(act, 'button').find((b) => b.textContent === 'Exibir')!;
    exibir.click();
    const box = one(area, '.pop input[data-field="branch"]') as unknown as ElementoFalso & { checked: boolean };
    box.checked = true;
    box.dispatchEvent({ type: 'change' });
    await until(() => textOf(area, 'row-1', '.wall-tech') === 'feat/1-exemplo');
    stop();
  });

  test('the conversation use from 90% is in the foot of the card even with the field off', async () => {
    display.chooseDensity('comfortable');
    display.setField('usage', false);
    const { area, stop } = await start([blocked('card-1', { context: { pct: 93 } }), blocked('card-2', { context: { pct: 40 } })]);
    assert.equal(textOf(area, 'card-1', '[data-foot="usage"]'), 'Uso da conversa 93%');
    assert.equal(textOf(area, 'card-2', '[data-foot="usage"]'), null);
    stop();
  });

  test('the fields off hide what they own: the agent, the plan and the phrase of a row', async () => {
    for (const id of ['agent', 'plan', 'phrase']) display.setField(id, false);
    const { area, stop } = await start(sessions());
    assert.equal(textOf(area, 'card-1', '.wall-name'), null, 'no agent name on the card');
    assert.equal(textOf(area, 'card-1', '[data-foot="step"]'), null, 'no step on the card');
    assert.equal(textOf(area, 'row-1', '.wall-ratio'), null, 'no "passo X de Y" on the row');
    assert.equal(textOf(area, 'row-1', '.wall-phrase'), null, 'no phrase on the row');
    assert.equal(textOf(area, 'card-1', '.wall-ask'), 'Confere a v0.0.36?', 'what a blocked card asks is never hidden');
    stop();
  });

  test('the machine on rows: a remote one always; this one only in the Dev compact (M7)', async () => {
    const cards = [session('loc-r', { machine: { id: 'local', label: 'Esta máquina' } }), session('rem-r', { machine: WS })];
    const comfortable = await start(cards, { machines: [LOCAL, WS] });
    assert.equal(textOf(comfortable.area, 'loc-r', '.mf-mach'), null);
    assert.equal(textOf(comfortable.area, 'rem-r', '.mf-mach'), 'Workstation');
    comfortable.stop();
    display.chooseDensity('compact');
    const compact = await start(cards, { machines: [LOCAL, WS] });
    assert.equal(textOf(compact.area, 'loc-r', '.mf-mach'), 'Esta máquina');
    assert.equal(textOf(compact.area, 'rem-r', '.mf-mach'), 'Workstation');
    compact.stop();
  });

  test('leaving the screen takes the mark off the shared area', async () => {
    display.chooseDensity('compact');
    const { area, stop } = await start(sessions());
    stop();
    assert.equal(area.getAttribute('data-wall-density'), null);
  });
});

describe('#754: the compact density in the CSS', () => {
  const block = (selector: string) => {
    const at = css.indexOf(selector);
    assert.ok(at >= 0, `no ${selector} in wall.css`);
    return css.slice(at, css.indexOf('}', at));
  };
  test('sections at 18px, cards at 14px of padding, rows at 8px', () => {
    assert.match(block('[data-wall-density="compact"] .wall-body {'), /gap:\s*18px/);
    assert.match(block('[data-wall-density="compact"] .wall-card {'), /padding:\s*14px/);
    assert.match(block('[data-wall-density="compact"] .wall-row {'), /padding:\s*8px/);
  });
  test('the mono line is in the mono font, a token, and the boxes of the panel are styled in popover.css', () => {
    assert.match(block('.wall-tech {'), /font-family:\s*var\(--font-mono\)/);
    assert.match(readFileSync(new URL('../../ui/popover.css', import.meta.url), 'utf8'), /\.pop-check\b/);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'no colour written by hand');
  });
});
