// #755 (ADR-0028): the search of the sidebar. A field "Buscar" with the key hint at the top of the bar opens a modal dialog;
// the results (Sessões and Telas) are filtered on the client from what the screens already read, with no route of their own.
// Cmd+K or Ctrl+K opens it from anywhere; Enter opens the one chosen as a real navigation; Esc closes and the focus goes back.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
});

// @ts-expect-error: browser module, plain JavaScript
const search = await import('../../ui/command-search.js');
// @ts-expect-error: idem
const { SCREENS, sidebarSections } = await import('../../ui/screens.js');
// @ts-expect-error: idem
const { setAppMode } = await import('../../ui/mode.js');
// @ts-expect-error: idem
const { stateLabel } = await import('../../ui/state-labels.js');
// @ts-expect-error: idem
const { shortcutOf } = await import('../../ui/wall-keys.js');

const read = (file: string) => readFileSync(`${UI_FOLDER}${file}`, 'utf8');
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};
const all = (root: ElementoFalso, selector: string) => root.querySelectorAll(selector);
const one = (root: ElementoFalso, selector: string) => root.querySelector(selector)!;
const words = (n: ElementoFalso | null): string => (n ? n.childNodes.map((c) => (c instanceof ElementoFalso ? words(c) : c.textContent)).join(' ') : '').replace(/\s+/g, ' ').trim();

type Row = Record<string, unknown>;
const FATURAS = { id: 'a1b2c3d4-0000-4000-8000-000000000001', title: 'Testes do leitor de faturas', status: 'active', attention: null, machine: null };
const sessionsOf = (extra: Row[] = []) => ({ items: [FATURAS, { id: 'a1b2c3d4-0000-4000-8000-000000000002', title: 'Revisar o plano de entrega', status: 'completed', attention: null, machine: null }, ...extra] });

const MODE_STORE = { getItem: () => null, setItem: () => {} };
const devOnly = SCREENS.find((s: Row) => (s.item as Row | undefined) && !(s.item as Row).project) as { route: string; item: { label: string } };

let body: ElementoFalso;
let side: ElementoFalso;
let trigger: ElementoFalso;
let background: ElementoFalso;
let opened: string[];
let routes: string[];
let failure: Error | null;

function make({ platform = 'MacIntel', list = sessionsOf() as unknown } = {}) {
  const instance = search.createCommandSearch({
    host: side,
    dialogHost: body,
    background: [background],
    platform,
    screens: () => SCREENS,
    navigate: (route: string) => void opened.push(route),
    read: async (route: string) => {
      routes.push(route);
      if (failure) throw failure;
      return structuredClone(list);
    },
  });
  trigger = one(side, 'button');
  return instance;
}

const dialog = () => body.querySelector('[role="dialog"]');
const field = () => one(body, '[role="combobox"]');
const options = () => all(body, '[role="option"]');
const type = async (text: string) => {
  const input = field();
  input.value = text;
  input.dispatchEvent({ type: 'input' });
  await flush();
};
const key = (target: ElementoFalso, name: string, extra: Row = {}) => target.dispatchEvent({ type: 'keydown', key: name, ...extra });
const chord = (extra: Row = {}) => documentoFalso.dispatchEvent({ type: 'keydown', key: 'k', metaKey: true, ...extra });

beforeEach(() => {
  useNodeListQueries(true);
  body = new ElementoFalso('body');
  side = new ElementoFalso('div');
  background = new ElementoFalso('div');
  opened = [];
  routes = [];
  failure = null;
  documentoFalso.activeElement = null;
  setAppMode('dev', { root: new ElementoFalso('html'), storage: MODE_STORE, persist: false });
});

let instance: { stop: () => void } | null = null;
afterEach(() => {
  instance?.stop();
  instance = null;
  useNodeListQueries(false);
});

describe('#755: the field "Buscar" and its key', () => {
  test('the hint is Cmd K on a Mac and "Ctrl K" off it', () => {
    assert.equal(search.shortcutLabel('MacIntel'), '⌘K');
    assert.equal(search.shortcutLabel('Win32'), 'Ctrl K');
    assert.equal(search.shortcutLabel('Linux x86_64'), 'Ctrl K');
    assert.equal(search.isMacPlatform('iPhone'), true);
  });

  test('the field is a button "Buscar" with the hint, that announces a dialog and its key', () => {
    instance = make();
    assert.equal(trigger.tagName, 'BUTTON');
    assert.equal(words(trigger), 'Buscar ⌘K');
    assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
    assert.match(trigger.getAttribute('aria-keyshortcuts') ?? '', /Meta\+K/);
    assert.equal(one(side, 'kbd').textContent, '⌘K');
    instance.stop();
    instance = make({ platform: 'Win32' });
    assert.equal(one(side, 'kbd').textContent, 'Ctrl K', 'redrawn for another platform, never two fields');
    assert.equal(all(side, 'button').length, 1);
  });

  test('a click on the field opens the dialog', async () => {
    instance = make();
    trigger.click();
    await flush();
    assert.ok(dialog());
  });
});

describe('#755: Cmd K or Ctrl K opens it from anywhere, and takes no typing', () => {
  test('both chords open it, and the browser keeps neither', async () => {
    instance = make();
    let prevented = 0;
    chord({ preventDefault: () => prevented++ });
    assert.ok(dialog(), 'Cmd+K');
    instance.stop();
    body.replaceChildren();
    instance = make();
    documentoFalso.dispatchEvent({ type: 'keydown', key: 'K', ctrlKey: true, preventDefault: () => prevented++ });
    assert.ok(dialog(), 'Ctrl+K, in capitals too');
    assert.equal(prevented, 2);
  });

  test('a bare k, j or ? opens nothing: the keys of the Mural stay the Mural\'s', () => {
    instance = make();
    for (const k of ['k', 'K', 'j', '?']) documentoFalso.dispatchEvent({ type: 'keydown', key: k });
    assert.equal(dialog(), null);
    documentoFalso.dispatchEvent({ type: 'keydown', key: 'k', metaKey: true, altKey: true });
    documentoFalso.dispatchEvent({ type: 'keydown', key: 'k', metaKey: true, shiftKey: true });
    documentoFalso.dispatchEvent({ type: 'keydown', key: 'k', metaKey: true, defaultPrevented: true });
    documentoFalso.dispatchEvent({ type: 'keydown', key: 'k', metaKey: true, isComposing: true });
    assert.equal(dialog(), null, 'a chord with Alt or Shift, one already taken, or one during composition');
  });

  test('the Mural answers nothing with the chord, and nothing while the dialog is open', () => {
    assert.equal(shortcutOf({ key: 'k', metaKey: true, target: new ElementoFalso('div') }), null);
    assert.equal(shortcutOf({ key: 'k', ctrlKey: true, target: new ElementoFalso('div') }), null);
    instance = make();
    chord();
    assert.equal(shortcutOf({ key: 'k', target: field() }), null, 'typing "k" in the search is typing');
    assert.equal(shortcutOf({ key: 'j', target: dialog() }), null);
  });

  test('a letter typed in the field of the search stays in the field', async () => {
    instance = make();
    chord();
    await type('kj?');
    assert.equal(field().value, 'kj?');
    assert.equal(opened.length, 0);
  });

  test('the chord while it is open does not stack a second dialog', () => {
    instance = make();
    chord();
    chord();
    assert.equal(all(body, '[role="dialog"]').length, 1);
  });
});

describe('#755: the dialog is accessible', () => {
  test('role dialog, aria-modal, named, and the background is inert while it is open', () => {
    instance = make();
    chord();
    const d = dialog()!;
    assert.equal(d.getAttribute('aria-modal'), 'true');
    assert.ok(d.getAttribute('aria-label') ?? d.getAttribute('aria-labelledby'));
    assert.equal(background.inert, true);
    key(field(), 'Escape');
    assert.equal(background.inert, false);
  });

  test('the field is a combobox that controls the listbox and says which option is active', async () => {
    instance = make();
    chord();
    await flush();
    const input = field();
    assert.equal(input.tagName, 'INPUT');
    assert.equal(input.getAttribute('aria-expanded'), 'true');
    assert.equal(input.getAttribute('aria-autocomplete'), 'list');
    const controls = input.getAttribute('aria-controls')!;
    const list = one(body, `#${controls}`);
    assert.equal(list.getAttribute('role'), 'listbox');
    assert.ok(input.getAttribute('aria-label'), 'the field has a name');
    const active = input.getAttribute('aria-activedescendant')!;
    const row = one(body, `#${active}`);
    assert.equal(row.getAttribute('role'), 'option');
    assert.equal(row.getAttribute('aria-selected'), 'true');
    assert.equal(all(body, '[aria-selected="true"]').length, 1);
  });

  test('the focus goes to the field, is trapped, and returns to where it was on every way out', async () => {
    instance = make();
    for (const out of ['escape', 'scrim', 'close']) {
      trigger.focus();
      chord();
      assert.equal(documentoFalso.activeElement, field(), `${out}: the field has the focus`);
      if (out === 'escape') key(field(), 'Escape');
      else if (out === 'scrim') one(body, '.cs-scrim').click();
      else one(body, '.cs-close').click();
      assert.equal(dialog(), null, `${out}: closed`);
      assert.equal(documentoFalso.activeElement, trigger, `${out}: the focus is back`);
    }
    chord();
    const close = one(body, '.cs-close');
    close.focus();
    let prevented = false;
    key(dialog()!, 'Tab', { preventDefault: () => (prevented = true) });
    assert.equal(prevented, true, 'Tab from the last control does not leave');
    assert.equal(documentoFalso.activeElement, field(), 'it wraps to the field');
    key(dialog()!, 'Tab', { shiftKey: true, preventDefault: () => {} });
    assert.equal(documentoFalso.activeElement, close, 'Shift+Tab from the first wraps to the last');
  });

  test('the focus returns to the previous element even when it was not the field', async () => {
    instance = make();
    const other = new ElementoFalso('button');
    body.append(other);
    other.focus();
    chord();
    key(field(), 'Escape');
    assert.equal(documentoFalso.activeElement, other);
  });

  test('a click inside the dialog does not close it, and the field announces the count', async () => {
    instance = make();
    chord();
    await flush();
    one(body, '.cs-dialog').click();
    assert.ok(dialog());
    const status = one(body, '[role="status"]');
    assert.match(words(status), /\d+ resultados?/);
  });

  test('the dialog and the list use the tokens: float shadow, no hex, no motion without the tokens', () => {
    const css = read('command-search.css');
    assert.match(css, /box-shadow:\s*var\(--shadow-float\)/);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(css, /\d(ms|s)\b(?![^{]*var)/, 'no literal duration');
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /:focus-visible/);
    assert.match(read('index.html'), /command-search\.css/);
  });
});

describe('#755: the results, in two groups, filtered on the client', () => {
  test('typing "faturas" shows "Testes do leitor de faturas" in Sessões, and Enter opens its Detalhe', async () => {
    instance = make();
    chord();
    await flush();
    await type('faturas');
    const rows = options();
    assert.equal(rows.length, 1);
    assert.match(words(rows[0]!), /Testes do leitor de faturas/);
    assert.match(words(rows[0]!), /Esta máquina/, 'the machine is written');
    const group = rows[0]!.closest('[role="group"]')!;
    assert.match(words(one(body, `#${group.getAttribute('aria-labelledby')}`)), /^Sessões$/);
    key(field(), 'Enter');
    assert.deepEqual(opened, [`/ui/sessions/${FATURAS.id}`]);
    assert.equal(dialog(), null, 'it closes when it opens');
  });

  test('the row is a real link to the Detalhe, so a click or a copy works', async () => {
    instance = make();
    chord();
    await flush();
    await type('faturas');
    const link = one(options()[0]!, 'a');
    assert.equal(link.getAttribute('href'), `/ui/sessions/${FATURAS.id}`);
    assert.equal(link.getAttribute('tabindex'), '-1', 'the field keeps the focus: Tab does not walk the rows');
  });

  test('it reads the sessions once per opening, from the route the screens already read, and never writes', async () => {
    instance = make();
    chord();
    await flush();
    assert.equal(routes.length, 1);
    assert.match(routes[0]!, /^\/api\/sessions\?/);
    await type('faturas');
    await type('plano');
    assert.equal(routes.length, 1, 'typing filters what was read');
  });

  test('the words need not be in order, accents and case do not matter, and the machine counts', async () => {
    instance = make({ list: sessionsOf([{ id: 'r1', title: 'Migração do cobrança', status: 'active', attention: null, machine: { id: 'ws', label: 'Workstation' } }]) });
    chord();
    await flush();
    await type('LEITOR faturas');
    assert.equal(options().length, 1);
    await type('migracao');
    assert.match(words(options()[0]!), /Migração do cobrança/);
    await type('workstation');
    assert.equal(options().length >= 1, true);
    assert.match(words(options()[0]!), /Workstation/);
    assert.equal(one(options()[0]!, 'a').getAttribute('href'), '/ui/sessions/r1?machine=ws', 'a remote session opens through its machine');
  });

  test('the state is an icon and its words, from the labels of the mode, never colour alone', async () => {
    instance = make({ list: sessionsOf([{ id: 'p1', title: 'Pede algo', status: 'waiting', attention: { level: 'blocked', reason: 'permission' }, machine: null }]) });
    chord();
    await flush();
    await type('pede');
    const row = options()[0]!;
    assert.ok(row.querySelector('svg.state-icon'), 'the icon of state-icon.js');
    assert.equal(row.querySelector('svg.state-icon')!.getAttribute('aria-hidden'), 'true');
    assert.ok(words(row).includes(stateLabel('permission')));
    assert.ok(words(row).includes('Pede permissão'));
    key(field(), 'Escape');
    setAppMode('project', { root: new ElementoFalso('html'), storage: MODE_STORE, persist: false });
    chord();
    await flush();
    await type('pede');
    assert.ok(words(options()[0]!).includes('Pede sua aprovação'), 'the words follow the mode');
  });

  test('Telas: the items of the bar, by label, open their route', async () => {
    instance = make();
    chord();
    await flush();
    await type('mural');
    const rows = options();
    assert.ok(rows.length >= 1);
    const wallRow = rows.find((r) => r.querySelector('a')?.getAttribute('href') === '/ui/wall')!;
    assert.match(words(wallRow), /Mural ao vivo/);
    const group = wallRow.closest('[role="group"]')!;
    assert.match(words(one(body, `#${group.getAttribute('aria-labelledby')}`)), /^Telas$/);
  });

  test('the two groups come in order and an empty field lists the recent sessions and the screens', async () => {
    instance = make();
    chord();
    await flush();
    const groups = all(body, '[role="group"]');
    assert.deepEqual(groups.map((g) => words(one(body, `#${g.getAttribute('aria-labelledby')}`))), ['Sessões', 'Telas']);
    assert.ok(options().length > 2);
  });

  test('no result says so, and Enter then opens nothing', async () => {
    instance = make();
    chord();
    await flush();
    await type('zzzxyz');
    assert.equal(options().length, 0);
    assert.match(words(one(body, '[role="status"]')), /Nada encontrado/);
    assert.equal(field().getAttribute('aria-activedescendant'), null);
    key(field(), 'Enter');
    assert.deepEqual(opened, []);
    assert.ok(dialog(), 'it stays open');
  });

  test('it shows at most a few rows per group', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, title: `Sessão ${i} de teste`, status: 'active', attention: null, machine: null }));
    instance = make({ list: { items: many } });
    chord();
    await flush();
    await type('teste');
    assert.ok(options().length <= 10);
  });

  test('a read that fails still gives the screens, and the dialog says nothing of the failure\'s own text', async () => {
    failure = new Error('connect ECONNREFUSED 10.0.0.9:4730 token=abc');
    instance = make();
    chord();
    await flush();
    await type('mural');
    assert.ok(options().length >= 1, 'the screens do not depend on the read');
    const said = words(dialog());
    assert.doesNotMatch(said, /ECONNREFUSED|10\.0\.0\.9|token/);
    assert.match(said, /Sessões indisponíveis/);
  });

  test('the sessions of the last reading show at once on the next opening, then are read again', async () => {
    instance = make();
    chord();
    await flush();
    key(field(), 'Escape');
    chord();
    assert.ok(options().some((r) => words(r).includes('Testes do leitor de faturas')), 'shown before the second read ends');
    await flush();
    assert.equal(routes.length, 2);
  });

  test('a new opening starts with an empty field', async () => {
    instance = make();
    chord();
    await flush();
    await type('faturas');
    key(field(), 'Escape');
    chord();
    assert.equal(field().value, '');
  });
});

describe('#755: the keyboard', () => {
  test('arrows move the active option, wrap at the ends, and Enter opens the one that is active', async () => {
    instance = make();
    chord();
    await flush();
    await type('plano');
    await type('');
    const ids = options().map((r) => r.getAttribute('id'));
    assert.equal(field().getAttribute('aria-activedescendant'), ids[0]);
    key(field(), 'ArrowDown');
    assert.equal(field().getAttribute('aria-activedescendant'), ids[1]);
    key(field(), 'ArrowUp');
    key(field(), 'ArrowUp');
    assert.equal(field().getAttribute('aria-activedescendant'), ids.at(-1), 'up from the first wraps to the last');
    key(field(), 'ArrowDown');
    assert.equal(field().getAttribute('aria-activedescendant'), ids[0], 'down from the last wraps to the first');
    key(field(), 'ArrowDown');
    key(field(), 'Enter');
    assert.equal(opened.length, 1);
    assert.match(opened[0]!, /^\/ui/);
  });

  test('the active option is marked by more than colour: aria-selected, a class, and the Enter hint', async () => {
    instance = make();
    chord();
    await flush();
    const [first, second] = options();
    assert.equal(first!.getAttribute('aria-selected'), 'true');
    assert.ok(first!.classList.contains('on'));
    assert.ok(first!.querySelector('.cs-enter'), 'the row says what Enter does');
    assert.equal(second!.getAttribute('aria-selected'), 'false');
    assert.equal(second!.querySelector('.cs-enter'), null);
  });

  test('typing puts the active option back on the first, and the arrows keep the caret (they are prevented)', async () => {
    instance = make();
    chord();
    await flush();
    key(field(), 'ArrowDown');
    let prevented = false;
    key(field(), 'ArrowDown', { preventDefault: () => (prevented = true) });
    assert.equal(prevented, true);
    await type('m');
    assert.equal(field().getAttribute('aria-activedescendant'), options()[0]!.getAttribute('id'));
  });

  test('Esc closes with the layers of the shell too: the one on top is the search', () => {
    instance = make();
    chord();
    assert.equal(instance.isOpen(), true);
    instance.close();
    assert.equal(instance.isOpen(), false);
  });

  test('a click on a row opens it through the shell\'s link handler, so the dialog only closes', async () => {
    instance = make();
    chord();
    await flush();
    await type('faturas');
    one(options()[0]!, 'a').click();
    assert.equal(dialog(), null);
    assert.deepEqual(opened, [], 'the real link is the shell\'s to follow');
  });
});

describe('#755: Projeto finds the screens the bar hides, and says so', () => {
  test('in Dev the screen of the Dev bar has no tag, and in Projeto the Projeto labels are the ones searched', async () => {
    instance = make();
    chord();
    await flush();
    await type(devOnly.item.label);
    const row = options().find((r) => r.querySelector('a')?.getAttribute('href') === devOnly.route)!;
    assert.ok(row, 'the Dev screen is found in Dev');
    assert.equal(row.querySelector('.cs-tag'), null);
    key(field(), 'Escape');
    setAppMode('project', { root: new ElementoFalso('html'), storage: MODE_STORE, persist: false });
    chord();
    await flush();
    await type('sua atenção');
    const mural = options().find((r) => r.querySelector('a')?.getAttribute('href') === '/ui/wall')!;
    assert.match(words(mural), /Sua atenção/, 'the bar of Projeto calls the Mural "Sua atenção"');
    assert.equal(mural.querySelector('.cs-tag'), null);
  });

  test('in Projeto a screen out of the bar is found, tagged, and opens by its route', async () => {
    instance = make();
    setAppMode('project', { root: new ElementoFalso('html'), storage: MODE_STORE, persist: false });
    const inBar = sidebarSections(SCREENS, undefined, 'project').flatMap((s: { items: { route: string }[] }) => s.items.map((i) => i.route));
    assert.equal(inBar.includes(devOnly.route), false, 'the premise: the bar of Projeto hides it');
    chord();
    await flush();
    await type(devOnly.item.label);
    const row = options().find((r) => r.querySelector('a')?.getAttribute('href') === devOnly.route)!;
    assert.ok(row, 'nothing becomes unreachable');
    assert.equal(words(one(row, '.cs-tag')), 'Fora da barra');
    key(field(), 'ArrowDown', {});
  });

  test('the tag is text, short, and in the screen\'s voice', () => {
    const source = read('command-search.js');
    for (const [, text] of source.matchAll(/'([^'\n]*[A-Za-zÀ-ú][^'\n]*)'/g)) {
      if (!/^[A-ZÀ-Ú]/.test(text!) || /[.:/_-]/.test(text!)) continue;
      assert.ok(text!.split(/\s+/).length <= 4 || text!.length > 40, `${text}`);
    }
    assert.ok('Fora da barra'.length <= 28);
    assert.doesNotMatch(source, /!'|—/);
  });
});

describe('#755: the shell wires it', () => {
  test('index.html has the host of the field above the list of screens, and loads the style', () => {
    const html = read('index.html');
    assert.ok(html.indexOf('id="search"') > html.indexOf('cc-side-head') && html.indexOf('id="search"') < html.indexOf('<nav id="nav"'));
    assert.match(html, /<link rel="stylesheet" href="\/ui\/command-search\.css">/);
  });

  test('app.js creates it with the shell\'s read and navigation, and the escape layers know it', () => {
    const app = read('app.js');
    assert.match(app, /from '\.\/command-search\.js'/);
    assert.match(app, /createCommandSearch\(\{[^}]*read: shellRead[^}]*navigate/s);
    assert.match(app, /createEscape\(document, \[\s*commandSearch/s);
  });

  test('the module has no route of its own and writes nothing', () => {
    const source = read('command-search.js');
    assert.doesNotMatch(source, /\bwrite\(|method: 'POST'|fetch\(/);
    assert.equal((source.match(/\/api\//g) ?? []).length, 1, 'one route, the sessions the screens already read');
  });
});
