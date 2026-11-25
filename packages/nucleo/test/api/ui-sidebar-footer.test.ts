// Issue 750: the footer of the bar. The "Ao vivo" block with "N máquinas · versão X", the person row with the theme
// button and the account menu, and the layered Escape. On the fake DOM; the markup is read from index.html.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { documentoFalso, ElementoFalso, instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();

// @ts-expect-error: browser module, plain JavaScript
import { createLiveBlock, machinesText } from '../../ui/live-block.js';
// @ts-expect-error: browser module, plain JavaScript
import { createAccountMenu } from '../../ui/account-menu.js';
// @ts-expect-error: browser module, plain JavaScript
import { createEscape } from '../../ui/escape.js';
// @ts-expect-error: browser module, plain JavaScript
import { createNav } from '../../ui/nav.js';
// @ts-expect-error: browser module, plain JavaScript
import { SCREENS } from '../../ui/screens.js';

const html = readFileSync(`${UI_FOLDER}index.html`, 'utf8');
const app = readFileSync(`${UI_FOLDER}app.js`, 'utf8');
const key = (name: string) => ({ type: 'keydown', key: name, preventDefault() {} });

describe('issue 750: the markup of the footer', () => {
  test('the live block, the person row, the two buttons and the menu with the core port', () => {
    assert.match(html, /<div class="cc-live" id="live" data-state="connecting"><\/div>/);
    assert.match(html, /<span class="cc-avatar" aria-hidden="true">VC<\/span>/);
    assert.match(html, /<b>Você<\/b>/);
    assert.match(html, /<a class="cc-gh" id="github" hidden><\/a>/);
    assert.match(html, /<button type="button" class="cc-ibtn" id="theme-button"><\/button>/);
    assert.match(html, /<button type="button" class="cc-ibtn" id="account-button" aria-label="Opções da conta" aria-haspopup="true" aria-expanded="false" aria-controls="account-menu">/);
    assert.match(html, /<div class="cc-menu" id="account-menu" hidden>/);
    assert.match(html, /<a class="cc-menu-item" href="\/ui\/connections">Conexões<\/a>/);
    assert.match(html, /id="port"/);
  });

  test('the notice stays right before the main area, and nothing is inline', () => {
    assert.match(html, /<div class="cc-notice" id="update-notice" hidden><\/div>\s*<main class="cc-main" id="content">/);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>|\sstyle="|\sonclick=/);
  });

  test('app.js wires the theme button, the menu, the escape and the machine count', () => {
    assert.match(app, /createTheme\(\{ button: document\.getElementById\('theme-button'\) \}\)/);
    assert.match(app, /createAccountMenu\(/);
    assert.match(app, /createEscape\(/);
    assert.match(app, /onMachines/);
  });
});

describe('issue 750: the "Ao vivo" block', () => {
  const version = () => { const b = new ElementoFalso('button'); b.setAttribute('class', 'version up-version mono'); return b; };
  function block() {
    const node = new ElementoFalso('div');
    return { node, live: createLiveBlock({ node }) };
  }

  test('the state line is the live region, and the note says machines and version', () => {
    const { node, live } = block();
    live.draw({ state: 'live', machines: 2, versionKey: 'v1', makeVersion: () => { const b = version(); b.append('v0.0.22'); return b; } });
    assert.equal(node.dataset.state, 'live');
    const region = node.querySelector('[aria-live]')!;
    assert.equal(texto(region), 'Ao vivo');
    assert.equal(region.getAttribute('aria-live'), 'polite');
    assert.equal(texto(node.querySelector('.cc-live-note')), '2 máquinas · v0.0.22');
    assert.equal(node.querySelectorAll('.up-version').length, 1);
  });

  test('one machine is singular, and an unread count says nothing', () => {
    assert.equal(machinesText(1), '1 máquina');
    assert.equal(machinesText(3), '3 máquinas');
    const { node, live } = block();
    live.draw({ state: 'connecting', machines: null, versionKey: '', makeVersion: () => null });
    assert.equal(texto(node), 'Conectando');
    assert.equal(node.querySelector('.cc-live-note'), null);
  });

  test('offline is said in words and the note stays', () => {
    const { node, live } = block();
    live.draw({ state: 'offline', machines: 1, versionKey: '', makeVersion: () => null });
    assert.equal(texto(node.querySelector('[aria-live]')), 'Sem conexão');
    assert.equal(texto(node.querySelector('.cc-live-note')), '1 máquina');
  });

  test('the same state does not redraw: the version button keeps the focus it has', () => {
    const { node, live } = block();
    const input = { state: 'live', machines: 2, versionKey: 'v1', makeVersion: version };
    live.draw(input);
    const button = node.querySelector('.up-version')!;
    button.focus();
    live.draw({ ...input });
    assert.equal(node.querySelector('.up-version'), button);
    assert.equal(documentoFalso.activeElement, button);
    live.draw({ ...input, versionKey: 'v2' });
    assert.notEqual(node.querySelector('.up-version'), button);
  });
});

describe('issue 750: the account menu', () => {
  function menu() {
    const button = new ElementoFalso('button');
    const panel = new ElementoFalso('div');
    panel.id = 'account-menu';
    panel.hidden = true;
    const inside = new ElementoFalso('a');
    inside.setAttribute('href', '/ui/connections');
    panel.append(inside);
    const outside = new ElementoFalso('p');
    const account = createAccountMenu({ button, menu: panel, doc: documentoFalso });
    return { button, panel, inside, outside, account };
  }

  test('the button says it is closed, controls the menu and opens it with a click', () => {
    const { button, panel } = menu();
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.getAttribute('aria-controls'), 'account-menu');
    button.click();
    assert.equal(panel.hidden, false);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    button.click();
    assert.equal(panel.hidden, true);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
  });

  test('a click outside closes it, a click inside does not, a link closes it', () => {
    const { button, panel, inside, outside } = menu();
    button.click();
    documentoFalso.dispatchEvent({ type: 'click', target: panel });
    assert.equal(panel.hidden, false);
    documentoFalso.dispatchEvent({ type: 'click', target: outside });
    assert.equal(panel.hidden, true);
    button.click();
    inside.click();
    assert.equal(panel.hidden, true);
  });

  test('close() gives the focus back to the button; closing by a click outside does not steal it', () => {
    const { button, account, outside } = menu();
    account.open();
    account.close();
    assert.equal(documentoFalso.activeElement, button);
    const other = new ElementoFalso('input');
    account.open();
    other.focus();
    documentoFalso.dispatchEvent({ type: 'click', target: outside });
    assert.equal(documentoFalso.activeElement, other);
  });
});

describe('issue 750: Escape closes one layer at a time', () => {
  test('the first open layer closes, in the order given, and only that one', () => {
    const opened = { panel: true, menu: true, drawer: true };
    const closed: string[] = [];
    const layers = (['panel', 'menu', 'drawer'] as const).map((name) => ({ isOpen: () => opened[name], close: () => (opened[name] = false, closed.push(name)) }));
    const handler = createEscape(documentoFalso, layers);
    documentoFalso.dispatchEvent(key('Escape'));
    assert.deepEqual(closed, ['panel']);
    documentoFalso.dispatchEvent(key('Enter'));
    assert.deepEqual(closed, ['panel']);
    documentoFalso.dispatchEvent(key('Escape'));
    documentoFalso.dispatchEvent(key('Escape'));
    assert.deepEqual(closed, ['panel', 'menu', 'drawer']);
    documentoFalso.dispatchEvent(key('Escape'));
    assert.deepEqual(closed, ['panel', 'menu', 'drawer']);
    handler.stop();
  });
});

describe('issue 750: the machine count of the note', () => {
  test('the nav says how many machines there are: this one and each remote of the list, and nothing when the read fails', async () => {
    const heard: number[] = [];
    let answer: () => unknown = () => [{ id: 'local', label: 'Esta máquina', state: 'connected' }, { id: 'ws-a', label: 'Oficina', state: 'connected' }];
    const nav = new ElementoFalso('nav');
    const { readMachines } = createNav({ nav, read: async () => answer(), screens: SCREENS, onMachines: (n: number) => heard.push(n) });
    await readMachines();
    assert.deepEqual(heard, [2]);
    answer = () => { throw new Error('offline'); };
    await readMachines();
    assert.deepEqual(heard, [2]);
  });
});
