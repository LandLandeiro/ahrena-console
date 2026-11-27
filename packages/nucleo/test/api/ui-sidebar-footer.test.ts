// #750: the footer of the bar: the "Ao vivo" block, the person row, the account menu and the layered Escape.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { documentoFalso, ElementoFalso, instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();

// @ts-expect-error: browser module, plain JavaScript
import { createLiveBlock, LIVE_LABELS, machinesText } from '../../ui/live-block.js';
// @ts-expect-error: browser module, plain JavaScript
import { createAccountMenu } from '../../ui/account-menu.js';
// @ts-expect-error: browser module, plain JavaScript
import { ICON_NAMES } from '../../ui/dom.js';
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
    assert.match(html, /<button type="button" class="cc-ibtn" id="account-button" aria-label="Opções da conta" aria-expanded="false" aria-controls="account-menu">/);
    assert.doesNotMatch(html, /aria-haspopup="true"/, 'the menu is a disclosure, not a role=menu: it promises nothing it does not do');
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
  const v = (label = 'versão 0.0.22', extra = {}) => ({ label, title: 'Versão do app', fresh: false, expanded: false, ...extra });
  function block() {
    const node = new ElementoFalso('div');
    const clicks: number[] = [];
    return { node, clicks, live: createLiveBlock({ node, onVersion: () => clicks.push(1) }) };
  }

  test('the state line is the live region, and the note says machines and version in text', () => {
    const { node, live } = block();
    live.draw({ state: 'live', machines: 2, version: v() });
    assert.equal(node.dataset.state, 'live');
    const region = node.querySelector('[aria-live]')!;
    assert.equal(texto(region), 'Ao vivo');
    assert.equal(region.getAttribute('aria-live'), 'polite');
    assert.equal(texto(node.querySelector('.cc-live-note')), '2 máquinas · versão 0.0.22');
    assert.equal(node.querySelectorAll('.up-version').length, 1);
    assert.equal(texto(node.querySelector('.up-version')), 'versão 0.0.22');
  });

  test('the dot is a 8 px dot, not the antenna icon, and says nothing to a screen reader', () => {
    const { node, live } = block();
    live.draw({ state: 'live', machines: 1, version: null });
    const dot = node.querySelector('.cc-live-dot')!;
    assert.equal(dot.getAttribute('aria-hidden'), 'true');
    assert.equal(node.querySelector('svg'), null);
  });

  describe('the dot blinks once for an event (motion 11)', () => {
    function clocked() {
      let t = 10_000;
      const node = new ElementoFalso('div');
      const live = createLiveBlock({ node, now: () => t });
      live.draw({ state: 'live', machines: 1, version: null });
      const dot = node.querySelector('.cc-live-dot')!;
      const log: string[] = [];
      const setAttribute = dot.setAttribute.bind(dot);
      const removeAttribute = dot.removeAttribute.bind(dot);
      dot.setAttribute = (k: string, v: string) => (log.push(`set ${k}`), setAttribute(k, v));
      dot.removeAttribute = (k: string) => (log.push(`remove ${k}`), removeAttribute(k));
      Object.defineProperty(dot, 'offsetWidth', { get: () => (log.push('reflow'), 8) });
      return { node, live, dot, log, at: (ms: number) => (t = ms) };
    }

    test('the dot is still until an event arrives, and a blink marks it with data-blink', () => {
      const { live, dot, log } = clocked();
      assert.equal(dot.getAttribute('data-blink'), null);
      assert.equal(live.blink(), true);
      assert.notEqual(dot.getAttribute('data-blink'), null);
      assert.deepEqual(log.filter((l) => l.endsWith('data-blink')), ['remove data-blink', 'set data-blink']);
    });

    test('at most one blink every 2 s: a second event inside the window does nothing, one at 2 s blinks again', () => {
      const { live, dot, log, at } = clocked();
      assert.equal(live.blink(), true);
      log.length = 0;
      at(11_999);
      assert.equal(live.blink(), false);
      assert.deepEqual(log, [], 'a throttled event touches nothing');
      at(12_000);
      assert.equal(live.blink(), true);
      assert.notEqual(dot.getAttribute('data-blink'), null);
    });

    test('the second blink restarts the animation: the mark is taken off, the layout is read, and the mark goes back, even if animationend never fired', () => {
      const { live, log, at } = clocked();
      live.blink();
      log.length = 0;
      at(12_500);
      live.blink();
      assert.deepEqual(log, ['remove data-blink', 'reflow', 'set data-blink']);
    });

    test('only a live connection blinks: offline and connecting stay still and do not spend the window', () => {
      const { node, live, dot, at } = clocked();
      live.draw({ state: 'offline', machines: 1, version: null });
      assert.equal(live.blink(), false);
      assert.equal(dot.getAttribute('data-blink'), null);
      live.draw({ state: 'live', machines: 1, version: null });
      at(10_001);
      assert.equal(live.blink(), true, 'the refused blink took no part of the window');
      assert.equal(node.querySelector('.cc-live-dot'), dot, 'the dot is the same node');
      assert.equal(dot.getAttribute('aria-hidden'), 'true');
    });

    test('app.js blinks for each batch of changes, and not on a restart or a reset', () => {
      assert.match(app, /onChange\(changes\) \{[^}]*live\.blink\(\)/s);
      assert.doesNotMatch(/function restart\(\) \{([^]*?)\n\}/.exec(app)![1]!, /blink/);
    });
  });

  test('one machine is singular, and an unread count says nothing', () => {
    assert.equal(machinesText(1), '1 máquina');
    assert.equal(machinesText(3), '3 máquinas');
    const { node, live } = block();
    live.draw({ state: 'connecting', machines: null, version: null });
    assert.equal(texto(node), 'Conectando');
    assert.equal(node.querySelector('.cc-live-note')!.hidden, true);
  });

  test('offline is said in words and the note stays', () => {
    const { node, live } = block();
    live.draw({ state: 'offline', machines: 1, version: null });
    assert.equal(texto(node.querySelector('[aria-live]')), 'Sem conexão');
    assert.equal(texto(node.querySelector('.cc-live-note')), '1 máquina');
    assert.equal(node.dataset.state, 'offline');
  });

  test('the live region is the same node on every draw, and its text is rewritten only when it changes', () => {
    const { node, live } = block();
    live.draw({ state: 'connecting', machines: null, version: null });
    const region = node.querySelector('[aria-live]')!;
    const text = region.firstChild;
    live.draw({ state: 'connecting', machines: 2, version: v() });
    assert.equal(node.querySelector('[aria-live]'), region);
    assert.equal(region.firstChild, text, 'the same text is not written again');
    live.draw({ state: 'live', machines: 2, version: v() });
    assert.equal(node.querySelector('[aria-live]'), region, 'the node stays so the change is announced');
    assert.equal(texto(region), 'Ao vivo');
    const next = region.firstChild;
    live.draw({ state: 'live', machines: 3, version: v() });
    assert.equal(region.firstChild, next);
    live.draw({ state: 'offline', machines: 3, version: v() });
    assert.equal(node.querySelector('[aria-live]'), region);
    assert.equal(texto(region), 'Sem conexão');
  });

  test('the version button is one node: opening and closing the panel changes its attributes and keeps the focus', () => {
    const { node, live, clicks } = block();
    live.draw({ state: 'live', machines: 2, version: v() });
    const button = node.querySelector('.up-version')!;
    button.focus();
    live.draw({ state: 'live', machines: 2, version: v('versão 0.0.22', { expanded: true }) });
    assert.equal(node.querySelector('.up-version'), button);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(documentoFalso.activeElement, button);
    live.draw({ state: 'live', machines: 2, version: v('versão 0.0.22', { expanded: false, fresh: true, title: 'Há uma versão nova do app' }) });
    assert.equal(node.querySelector('.up-version'), button);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.getAttribute('title'), 'Há uma versão nova do app');
    assert.equal(button.hasAttribute('data-new'), true);
    assert.equal(button.querySelector('.up-dot')!.getAttribute('aria-label'), 'versão nova');
    assert.equal(documentoFalso.activeElement, button);
    live.draw({ state: 'live', machines: 2, version: v() });
    assert.equal(button.hasAttribute('data-new'), false);
    assert.equal(button.querySelector('.up-dot'), null);
    assert.equal(documentoFalso.activeElement, button);
    button.click();
    assert.equal(clicks.length, 1);
  });

  test('a machine count that arrives while the version button has the focus does not take it away', () => {
    const { node, live } = block();
    live.draw({ state: 'live', machines: null, version: v() });
    const button = node.querySelector('.up-version')!;
    button.focus();
    live.draw({ state: 'live', machines: 2, version: v() });
    assert.equal(node.querySelector('.up-version'), button);
    assert.equal(documentoFalso.activeElement, button);
    assert.equal(texto(node.querySelector('.cc-live-note')), '2 máquinas · versão 0.0.22');
  });

  test('focusVersion() puts the focus on the version button, and does nothing without one', () => {
    const { node, live } = block();
    live.draw({ state: 'live', machines: 1, version: null });
    assert.doesNotThrow(() => live.focusVersion());
    live.draw({ state: 'live', machines: 1, version: v() });
    live.focusVersion();
    assert.equal(documentoFalso.activeElement, node.querySelector('.up-version'));
  });

  test('the labels are the ones app.js writes in the headers: one table', () => {
    assert.deepEqual(LIVE_LABELS, { connecting: 'Conectando', live: 'Ao vivo', offline: 'Sem conexão' });
    assert.doesNotMatch(app, /const LABELS = /);
    assert.match(app, /LIVE_LABELS\[state\]/);
  });

  test('Escape on the version panel gives the focus back to the version button', () => {
    assert.match(app, /close: \(\) => \(appUpdate\.close\(\), drawLive\(\), live\.focusVersion\(\)\)/);
  });
});

describe('issue 750: no icon without a user', () => {
  test('the menu and ellipsis drawings live in index.html, not in dom.js; sun and moon are drawn by the theme button', () => {
    assert.ok(!ICON_NAMES.includes('menu'));
    assert.ok(!ICON_NAMES.includes('ellipsis'));
    assert.ok(ICON_NAMES.includes('sun') && ICON_NAMES.includes('moon'));
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

  test('#750: Enter on the Conexões link closes the menu and the focus goes back to the button, not to the body', () => {
    const { button, panel, inside } = menu();
    button.click();
    inside.focus();
    inside.click();
    assert.equal(panel.hidden, true);
    assert.equal(documentoFalso.activeElement, button);
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

describe('issue 750: the account menu closes when the focus leaves it', () => {
  function rig() {
    const button = new ElementoFalso('button');
    const panel = new ElementoFalso('div');
    panel.id = 'account-menu';
    panel.hidden = true;
    const first = new ElementoFalso('a');
    first.setAttribute('href', '/ui/connections');
    panel.append(first);
    const outside = new ElementoFalso('input');
    const account = createAccountMenu({ button, menu: panel, doc: documentoFalso });
    return { button, panel, first, outside, account };
  }
  const out = (from: ElementoFalso, to: ElementoFalso | null) => from.dispatchEvent({ type: 'focusout', relatedTarget: to });
  const tab = (on: ElementoFalso) => on.dispatchEvent({ type: 'keydown', key: 'Tab' });

  test('Tab from the menu to something else closes it and leaves the focus where the person put it', () => {
    const { panel, first, outside, account } = rig();
    account.open();
    outside.focus();
    out(first, outside);
    assert.equal(panel.hidden, true);
    assert.equal(documentoFalso.activeElement, outside);
  });

  test('Shift+Tab from the button to something else closes it', () => {
    const { panel, button, outside, account } = rig();
    account.open();
    out(button, outside);
    assert.equal(panel.hidden, true);
  });

  test('moving between the button and the menu keeps it open', () => {
    const { panel, button, first, account } = rig();
    account.open();
    out(button, first);
    out(first, button);
    assert.equal(panel.hidden, false);
  });

  test('a focusout that goes nowhere (a click that Safari does not focus) keeps it open, unless it came from Tab', () => {
    const { panel, button, first, account } = rig();
    account.open();
    out(button, null);
    assert.equal(panel.hidden, false);
    tab(first);
    out(first, null);
    assert.equal(panel.hidden, true);
  });

  test('a closed menu ignores the focus; the Tab flag does not leak to the next time', () => {
    const { panel, first, outside, account } = rig();
    out(first, outside);
    assert.equal(panel.hidden, true);
    account.open();
    tab(first);
    out(first, first);
    out(first, null);
    assert.equal(panel.hidden, false, 'the flag was spent by the first focusout');
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
