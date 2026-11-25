// #752: the machine filter as a button with a menu (the wall), and the machine counts it shows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { ElementoFalso, documentoFalso, instalarDomFalso } from './fake-dom.ts';

instalarDomFalso();
const place = { pathname: '/ui/wall', search: '', hash: '' };
Object.assign(globalThis, { location: place, history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => void (place.search = url.includes('?') ? url.slice(url.indexOf('?')) : '') } });

// @ts-expect-error: browser module, plain JavaScript
const mf = await import('../../ui/machine-filter.js');

const WS = { id: 'ws', label: 'Workstation', state: 'connected' };
const LOCAL = { id: 'local', label: 'Esta máquina', state: 'connected' };
const DOWN = { id: 'ws', label: 'Workstation', state: 'unreachable', lastReadAt: '2026-10-20T22:41:00Z' };
const SRV = { id: 'srv', label: 'Servidor', state: 'connected' };
type Card = { id: string; machine?: { id: string } };
const cards = (...machines: string[]): Card[] => machines.map((m, i) => ({ id: `s${i}`, machine: { id: m } }));

let listeners = 0;
// #752: the fake document has no capture phase: what it can prove is how the listener was registered, and that it runs on its own.
const registered: { type: string; capture: unknown }[] = [];
const realAdd = documentoFalso.addEventListener as (t: string, f: unknown, o?: unknown) => void;
const realRemove = documentoFalso.removeEventListener as (t: string, f: unknown, o?: unknown) => void;
documentoFalso.addEventListener = ((t: string, f: unknown, o?: unknown) => (listeners++, registered.push({ type: t, capture: o }), realAdd(t, f))) as typeof documentoFalso.addEventListener;
documentoFalso.removeEventListener = ((t: string, f: unknown, o?: unknown) => (listeners--, realRemove(t, f, o))) as typeof documentoFalso.removeEventListener;

function make(options: Record<string, unknown> = {}) {
  mf.resetMachineChoice();
  const leave = new AbortController();
  const calls = { change: [] as string[], fallback: 0 };
  const fallback = new ElementoFalso('button');
  const filter = mf.createMachineFilter(
    { read: async () => [LOCAL, WS], signal: leave.signal, onChange: () => {} },
    { periodic: false, watchChanges: false, onChange: (c: string) => calls.change.push(c), menu: { itemsOf: (body: { cards: Card[] }) => body.cards }, fallbackFocus: () => (calls.fallback++, fallback), ...options },
  );
  const host = new ElementoFalso('div');
  host.append(filter.row, filter.notices);
  const answer = (machines: unknown[], items: Card[]) => filter.update({ machines, cards: items });
  const button = () => host.querySelector('[aria-haspopup="menu"]')!;
  const panel = () => host.querySelector('[role="menu"]')!;
  const items = () => host.querySelectorAll('[role="menuitemradio"]');
  const item = (id: string) => items().find((i) => i.getAttribute('data-machine') === id)!;
  const key = (target: ElementoFalso, k: string) => target.dispatchEvent({ type: 'keydown', key: k });
  return { filter, host, calls, fallback, answer, button, panel, items, item, key, leave };
}
const active = () => documentoFalso.activeElement;
const labels = (m: ReturnType<typeof make>) => m.items().map((i) => i.textContent);
afterEach(() => {
  place.search = '';
  documentoFalso.activeElement = null;
});

describe('#752: the menu of the machines', () => {
  test('without the menu option the control is the one of today, and no menu is built', () => {
    mf.resetMachineChoice();
    const filter = mf.createMachineFilter({ read: async () => [], signal: new AbortController().signal, onChange: () => {} }, { periodic: false, watchChanges: false });
    filter.update({ machines: [LOCAL, WS] });
    assert.equal(filter.row.querySelectorAll('.mf-seg').length, 1);
    assert.equal(filter.row.querySelectorAll('[aria-haspopup]').length, 0);
    assert.equal(filter.row.querySelectorAll('[role="menu"]').length, 0);
    assert.deepEqual(filter.parts(), [filter.row], 'the row, as before');
  });

  test('nothing shows without a remote; with one, a button and a closed menu with an option per machine and the total', () => {
    const m = make();
    m.answer([LOCAL], cards('local'));
    assert.equal(m.filter.row.hidden, true);
    assert.equal(m.host.querySelectorAll('[role="menu"]').length === 0 || m.panel().hidden, true);
    m.answer([LOCAL, WS], cards('local', 'ws', 'ws'));
    assert.equal(m.filter.row.hidden, false);
    assert.equal(m.button().getAttribute('aria-expanded'), 'false');
    assert.equal(m.panel().hidden, true);
    assert.equal(m.panel().getAttribute('aria-label'), 'Máquina');
    assert.deepEqual(labels(m), ['Todas as máquinas3', 'Esta máquina1', 'Workstation2']);
    assert.deepEqual(m.items().map((i) => i.getAttribute('aria-checked')), ['true', 'false', 'false']);
    assert.equal(m.button().textContent, 'Todas as máquinas');
  });

  test('the numbers: the answer holds only the chosen machine, so the others and the total are left out; a machine that is down has none', () => {
    place.search = '?machine=ws';
    const m = make();
    m.answer([WS], cards('ws', 'ws'));
    assert.deepEqual(labels(m), ['Todas as máquinas', 'Workstation2']);
    assert.equal(m.item('ws').getAttribute('aria-checked'), 'true');
    place.search = '';
    const down = make();
    down.answer([LOCAL, DOWN], cards('local'));
    assert.deepEqual(labels(down), ['Todas as máquinas1', 'Esta máquina1', 'Workstation sem conexão']);
    assert.equal(down.item('ws').querySelectorAll('svg').length >= 1, true, 'the wifi-off icon and the words, never the colour alone');
  });

  test('opening: the button toggles it, the focus goes to the checked option, aria-controls names the menu', () => {
    const m = make();
    m.answer([LOCAL, WS], cards('local'));
    m.button().click();
    assert.equal(m.button().getAttribute('aria-expanded'), 'true');
    assert.equal(m.panel().hidden, false);
    assert.equal(m.button().getAttribute('aria-controls'), m.panel().getAttribute('id'));
    assert.equal(active(), m.item('all'));
    m.button().click();
    assert.equal(m.button().getAttribute('aria-expanded'), 'false', 'a second press closes it');
    assert.equal(m.button().hasAttribute('aria-controls'), false);
  });

  test('the arrows on the closed button open it on the first and on the last option', () => {
    const m = make();
    m.answer([LOCAL, WS], cards('local'));
    m.key(m.button(), 'ArrowDown');
    assert.equal(active(), m.items()[0]);
    m.key(m.items()[0]!, 'Escape');
    m.key(m.button(), 'ArrowUp');
    assert.equal(active(), m.items().at(-1));
  });

  test('inside: the arrows wrap, Home and End go to the ends, Escape closes and returns the focus to the button', () => {
    const m = make();
    m.answer([LOCAL, WS, SRV], cards('local'));
    m.button().click();
    const list = m.items();
    m.key(list[0]!, 'ArrowDown');
    assert.equal(active(), list[1]);
    m.key(list[1]!, 'End');
    assert.equal(active(), list[3]);
    m.key(list[3]!, 'ArrowDown');
    assert.equal(active(), list[0], 'wraps from the last to the first');
    m.key(list[0]!, 'ArrowUp');
    assert.equal(active(), list[3], 'and back');
    m.key(list[3]!, 'Home');
    assert.equal(active(), list[0]);
    m.key(list[0]!, 'Escape');
    assert.equal(m.panel().hidden, true);
    assert.equal(active(), m.button());
    assert.equal(m.button().getAttribute('aria-expanded'), 'false');
  });

  test('Tab closes the menu and lets the focus move on from the button', () => {
    const m = make();
    m.answer([LOCAL, WS], cards('local'));
    m.button().click();
    const ev = { type: 'keydown', key: 'Tab' };
    m.items()[1]!.dispatchEvent(ev);
    assert.equal(m.panel().hidden, true);
    assert.equal(active(), m.button());
    assert.notEqual((ev as { defaultPrevented?: boolean }).defaultPrevented, true, 'the Tab itself is not cancelled');
  });

  test('choosing an option: onChange once, the URL keeps the choice, the menu closes and the focus returns to the button', () => {
    const m = make();
    m.answer([LOCAL, WS], cards('local', 'ws'));
    m.button().click();
    m.item('ws').click();
    assert.deepEqual(m.calls.change, ['ws']);
    assert.equal(place.search, '?machine=ws');
    assert.equal(m.panel().hidden, true);
    assert.equal(active(), m.button());
    assert.equal(m.button().textContent, 'Workstation');
    assert.equal(m.item('ws').getAttribute('aria-checked'), 'true');
    assert.equal(m.item('all').getAttribute('aria-checked'), 'false');
    m.button().click();
    m.item('ws').click();
    assert.deepEqual(m.calls.change, ['ws'], 'choosing the same machine again changes nothing');
  });

  test('a click outside closes it and takes no focus; a click inside does not close it', () => {
    const m = make();
    m.answer([LOCAL, WS], cards('local'));
    const elsewhere = new ElementoFalso('button');
    m.button().click();
    documentoFalso.dispatchEvent({ type: 'pointerdown', target: m.panel() });
    assert.equal(m.panel().hidden, false);
    elsewhere.focus();
    documentoFalso.dispatchEvent({ type: 'pointerdown', target: elsewhere });
    assert.equal(m.panel().hidden, true);
    assert.equal(active(), elsewhere, 'the focus stays where the person put it');
  });

  test('the click outside listens in the capture phase, so a control that stops the event does not keep the menu open', () => {
    const m = make();
    m.answer([LOCAL, WS], cards('local'));
    registered.length = 0;
    m.button().click();
    assert.deepEqual(registered, [{ type: 'pointerdown', capture: true }]);
    const stopper = new ElementoFalso('button');
    stopper.addEventListener('pointerdown', (e: { stopPropagation: () => void }) => e.stopPropagation());
    documentoFalso.dispatchEvent({ type: 'pointerdown', target: stopper });
    assert.equal(m.panel().hidden, true, 'the document saw it first, whatever the target does with it');
  });

  test('the listeners of the document are there only while it is open, and an abort closes it', () => {
    const before = listeners;
    const m = make();
    m.answer([LOCAL, WS], cards('local'));
    assert.equal(listeners, before, 'closed: none');
    m.button().click();
    assert.ok(listeners > before);
    m.key(m.items()[0]!, 'Escape');
    assert.equal(listeners, before);
    m.button().click();
    m.leave.abort();
    assert.equal(m.panel().hidden, true);
    assert.equal(listeners, before, 'an abort leaves none behind');
  });

  test('a live answer while it is open keeps the same nodes and the focus; the numbers change in place', () => {
    const m = make();
    m.answer([LOCAL, WS], cards('local'));
    m.button().click();
    m.key(m.items()[0]!, 'ArrowDown');
    const [all, local, ws] = [m.item('all'), m.item('local'), m.item('ws')];
    assert.equal(active(), local);
    m.answer([LOCAL, WS], cards('local', 'ws', 'ws'));
    assert.deepEqual([m.item('all'), m.item('local'), m.item('ws')], [all, local, ws], 'reconciled by machine, not rebuilt');
    assert.equal(active(), local);
    assert.equal(m.panel().hidden, false);
    assert.equal(ws.textContent, 'Workstation2');
  });

  test('the machine under the focus goes away: the focus goes to the next option, else the previous, else the button', () => {
    const m = make();
    m.answer([LOCAL, WS, SRV], cards('local'));
    m.button().click();
    m.item('ws').focus();
    m.answer([LOCAL, SRV], cards('local'));
    assert.equal(active(), m.item('srv'), 'the next one');
    m.answer([LOCAL, WS, SRV], cards('local'));
    m.item('srv').focus();
    m.answer([LOCAL, WS], cards('local'));
    assert.equal(active(), m.item('ws'), 'the previous one, there is no next');
  });

  test('a redraw with the menu closed never moves the focus', () => {
    const m = make();
    m.answer([LOCAL, WS], cards('local'));
    const elsewhere = new ElementoFalso('button');
    elsewhere.focus();
    m.answer([LOCAL, WS], cards('local', 'ws'));
    assert.equal(active(), elsewhere);
    documentoFalso.activeElement = null;
    m.answer([LOCAL, WS], cards('local', 'ws', 'ws'));
    assert.equal(active(), null, 'and does not take one nobody had');
    m.button().focus();
    m.answer([LOCAL, WS], cards('local'));
    assert.equal(active(), m.button(), 'the button keeps its focus');
  });

  test('every remote gone while it is open: it closes, the control hides and the focus goes to the fallback of the screen', () => {
    const m = make();
    m.answer([LOCAL, WS], cards('local'));
    m.button().click();
    m.answer([LOCAL], cards('local'));
    assert.equal(m.filter.row.hidden, true);
    assert.equal(m.panel().hidden, true);
    assert.equal(active(), m.fallback);
    assert.equal(m.calls.fallback, 1);
  });

  test('a chosen machine that is down: the button says so with the icon and the words', () => {
    place.search = '?machine=ws';
    const m = make();
    m.answer([LOCAL, DOWN], []);
    assert.match(m.button().textContent, /^Workstation\s*sem conexão$/);
    assert.equal(m.item('ws').getAttribute('aria-checked'), 'true');
    assert.equal(m.filter.chosenDown(), true);
  });

  test('a choice the list does not know is never "undefined"', () => {
    place.search = '?machine=ghost';
    const m = make();
    m.answer([LOCAL, WS], []);
    assert.doesNotMatch(m.button().textContent, /undefined|null/);
    assert.equal(m.button().textContent, 'Máquina remota');
  });

  test('the link of the notice of a machine that is down keeps the focus; with the notice gone it goes to the button', () => {
    const m = make();
    m.answer([LOCAL, DOWN], cards('local'));
    const link = m.host.querySelector('.mf-notice-link')!;
    link.focus();
    m.answer([LOCAL, DOWN], cards('local'));
    assert.equal(active(), m.host.querySelector('.mf-notice-link'));
    m.host.querySelector('.mf-notice-link')!.focus();
    m.answer([LOCAL, WS], cards('local'));
    assert.equal(m.host.querySelectorAll('.mf-notice').length, 0);
    assert.equal(active(), m.button());
  });

  test('the link of the notice with every remote gone: the button is hidden, so the focus goes to the fallback of the screen', () => {
    const m = make();
    m.answer([LOCAL, DOWN], cards('local'));
    m.host.querySelector('.mf-notice-link')!.focus();
    m.answer([LOCAL], cards('local'));
    assert.equal(m.filter.row.hidden, true);
    assert.equal(active(), m.fallback);
    assert.equal(m.calls.fallback, 1);
  });

  test('a redraw with the same state writes nothing into the button; a change writes only its part', () => {
    const m = make();
    m.answer([LOCAL, WS], cards('local'));
    const before = [...m.button().childNodes];
    const label = before[1]!;
    m.answer([LOCAL, WS], cards('local', 'ws'));
    assert.deepEqual([...m.button().childNodes], before, 'the same nodes, in the same order');
    assert.equal(m.button().childNodes[1], label, 'the label node stays');
    assert.ok(m.button().childNodes.every((n) => n !== null && n !== undefined));
  });

  test('the chosen machine going down adds only the "sem conexão" text and the icon, in place', () => {
    place.search = '?machine=ws';
    const m = make();
    m.answer([LOCAL, WS], cards('ws'));
    const [lead, label, chevron] = [...m.button().childNodes];
    m.answer([LOCAL, DOWN], []);
    assert.deepEqual([m.button().childNodes[0], m.button().childNodes[1], m.button().childNodes[3]], [lead, label, chevron]);
    assert.match(m.button().textContent, /^Workstation\s*sem conexão$/);
    m.answer([LOCAL, WS], cards('ws'));
    assert.deepEqual([...m.button().childNodes], [lead, label, chevron], 'and takes it away again');
  });

  test('the parts of the screen are the notices only: the row is placed by the screen beside the state filter', () => {
    const m = make();
    m.answer([LOCAL, DOWN], cards('local'));
    assert.deepEqual(m.filter.parts(), [m.filter.notices]);
    m.answer([LOCAL, WS], cards('local'));
    assert.deepEqual(m.filter.parts(), []);
  });
});

describe('#752: the sheet of the menu', () => {
  const sheet = readFileSync(`${UI_FOLDER}machine-filter.css`, 'utf8').split('/* ADR-0028: the machine menu')[1] ?? '';
  test('every colour is a variable of the brand and no control uses the divider border', () => {
    assert.ok(sheet.length > 0);
    assert.doesNotMatch(sheet, /#[0-9a-f]{3,8}\b|rgba?\(/i);
    for (const rule of sheet.split('\n').filter((l) => /\.mf-menu-(button|item)\b[^{]*\{/.test(l))) assert.doesNotMatch(rule, /var\(--border\)/);
  });
  test('the focus ring is the 2px --accent-line one, on the button and on the options', () => {
    assert.match(sheet, /\.mf-menu-item:focus-visible[^{]*\{[^}]*outline:\s*2px solid var\(--accent-line\)/);
    assert.match(sheet, /\.mf-menu-button:focus-visible \{[^}]*outline-offset:\s*2px/);
  });
  test('the closed panel is gone from the layout and the panel never exceeds the viewport', () => {
    assert.match(sheet, /\.mf-menu-panel\[hidden\] \{ display: none/);
    assert.match(sheet, /\.mf-menu-panel \{[^}]*max-width:\s*calc\(100vw - 32px\)/);
  });
  test('#752: the panel is left aligned when it fits and right aligned (mf-menu-end) when it would pass the visible width minus 16px, on open and on a redraw while open', () => {
    const doc = documentoFalso as unknown as { documentElement?: unknown };
    const before = doc.documentElement;
    doc.documentElement = { clientWidth: 1000 };
    try {
      const m = make();
      m.answer([LOCAL, WS], cards('local'));
      const rect = { right: 1100 };
      (m.panel() as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => rect;
      m.button().click();
      assert.equal(m.panel().classList.contains('mf-menu-end'), true, 'it would end at 1100 of 984 visible');
      rect.right = 700;
      m.answer([LOCAL, WS], cards('local', 'ws'));
      assert.equal(m.panel().classList.contains('mf-menu-end'), false, 'it fits again: measured without the class, aligned left');
      rect.right = 984;
      m.answer([LOCAL, WS], cards('local'));
      assert.equal(m.panel().classList.contains('mf-menu-end'), false, 'exactly the limit still fits');
      rect.right = 985;
      m.answer([LOCAL, WS], cards('local'));
      assert.equal(m.panel().classList.contains('mf-menu-end'), true);
      assert.equal(m.panel().getAttribute('style'), null, 'no inline style');
    } finally {
      doc.documentElement = before;
    }
  });

  test('#752: a document with no way to measure leaves the panel left aligned and does not throw', () => {
    const m = make();
    m.answer([LOCAL, WS], cards('local'));
    m.button().click();
    assert.equal(m.panel().classList.contains('mf-menu-end'), false);
  });

  test('#752: the end alignment is a rule of the sheet: left auto, right 0', () => {
    assert.match(sheet, /\.mf-menu-panel\.mf-menu-end \{[^}]*left:\s*auto;[^}]*right:\s*0/);
  });

  test('the checked option shows a mark besides the background, so the choice is not by colour alone', () => {
    assert.match(sheet, /\.mf-menu-item\[aria-checked="true"\] \.mf-menu-check \{ visibility: visible/);
  });
});
