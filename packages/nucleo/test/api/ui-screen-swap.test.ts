/* #765: the switch of screen. The screen that was open stays (inert, over the area) until the new one has its data
   or 300 ms pass; only then a skeleton with the shape of the screen shows, and it does not pulse. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { ElementoFalso, instalarDomFalso } from './fake-dom.ts';

instalarDomFalso();

// @ts-expect-error: browser module, plain JavaScript
import { SWAP_DELAY_MS, createScreenSwap } from '../../ui/screen-swap.js';
// @ts-expect-error: idem
import { shapeOf, skeleton } from '../../ui/skeletons.js';

const ui = (file: string) => readFileSync(join(UI_FOLDER, file), 'utf8');
const node = (tag: string, cls = '', ...kids: (ElementoFalso | string)[]) => {
  const n = new ElementoFalso(tag);
  if (cls) n.setAttribute('class', cls);
  for (const k of kids) n.append(k as ElementoFalso);
  return n;
};

function manualTimers() {
  const pending = new Map<number, { f: () => void; ms: number }>();
  let next = 0;
  return {
    setTimer: (f: () => void, ms: number) => (pending.set(++next, { f, ms }), next),
    clearTimer: (id: number) => void pending.delete(id),
    get waiting() { return pending.size; },
    get delays() { return [...pending.values()].map((p) => p.ms); },
    flush() { const all = [...pending.values()]; pending.clear(); all.forEach((p) => p.f()); },
  };
}

function rig() {
  const column = node('div', 'cc-col');
  const area = node('main', 'cc-main');
  column.append(area);
  area.append(node('h1', '', 'Sessões'), node('div', 'row', 'linha 1'));
  const timers = manualTimers();
  let check: (() => void) | null = null;
  const swap = createScreenSwap({ area, setTimer: timers.setTimer, clearTimer: timers.clearTimer, observe: (_a: unknown, f: () => void) => ((check = f), () => (check = null)) });
  const ghosts = () => column.querySelectorAll('.cc-ghost');
  return { column, area, timers, swap, ghosts, tick: () => check?.(), get watching() { return check !== null; } };
}

describe('The switch of screen keeps the screen that was open (#765, M1)', () => {
  test('the delay is 300 ms', () => assert.equal(SWAP_DELAY_MS, 300));

  test('the old content moves to an inert ghost beside the area, and the area is free for the new screen', () => {
    const r = rig();
    r.swap.begin('wall');
    assert.equal(r.area.childNodes.length, 0);
    const [ghost] = r.ghosts();
    assert.ok(ghost, 'one ghost');
    assert.match(ghost!.textContent, /Sessões/);
    assert.match(ghost!.textContent, /linha 1/);
    assert.equal(ghost!.getAttribute('aria-hidden'), 'true');
    assert.ok(ghost!.hasAttribute('inert'), 'nothing in the old screen takes focus or a click');
    assert.deepEqual(r.timers.delays, [300]);
  });

  test('data before 300 ms: no skeleton ever shows, and the ghost leaves when the screen settles', () => {
    const r = rig();
    r.swap.begin('wall');
    r.area.append(node('h1', '', 'Mural'));
    r.swap.settle();
    assert.equal(r.ghosts().length, 0);
    assert.equal(r.timers.waiting, 0, 'the 300 ms timer is cleared');
    assert.equal(r.column.querySelectorAll('.sk').length, 0);
  });

  test('after 300 ms the ghost holds a skeleton of the screen, not the old content', () => {
    const r = rig();
    r.swap.begin('wall');
    r.timers.flush();
    const [ghost] = r.ghosts();
    assert.doesNotMatch(ghost!.textContent, /linha 1/);
    assert.ok(ghost!.querySelector('.sk[data-shape="cards"]'), 'the Mural has the shape of cards');
    assert.equal(ghost!.querySelectorAll('.sk-card').length, 6);
    r.swap.settle();
    assert.equal(r.ghosts().length, 0);
  });

  test('a second switch while waiting keeps the same ghost and the same 300 ms', () => {
    const r = rig();
    r.swap.begin('wall');
    r.area.append(node('div', 'loading'));
    r.swap.begin('sessions');
    assert.equal(r.ghosts().length, 1);
    assert.match(r.ghosts()[0]!.textContent, /linha 1/, 'still the screen the person was on, not a half-built one');
    assert.equal(r.area.childNodes.length, 0);
    assert.equal(r.timers.waiting, 1);
    r.timers.flush();
    assert.ok(r.ghosts()[0]!.querySelector('.sk[data-shape="rows"]'), 'the skeleton is the one of the screen asked last');
  });

  test('the new screen settles by itself when its area has content that is not loading', () => {
    const r = rig();
    r.swap.begin('sessions');
    assert.ok(r.watching);
    const body = node('div', 'sessions-body', node('section', 'card state loading'));
    body.children[0]!.setAttribute('data-swap-pending', '');
    r.area.append(node('h1', '', 'Sessões'), node('div', 'notices'), node('div', 'filters'), body);
    r.tick();
    assert.equal(r.ghosts().length, 1, 'a loading card inside the body is not data (the real shape of Sessões)');
    body.children[0]!.remove();
    body.append(node('div', 'table'));
    r.tick();
    assert.equal(r.ghosts().length, 0);
    assert.ok(!r.watching, 'the observer is gone');
  });

  test('Histórico puts its loading card inside the body too, and the ghost stays until the days arrive', () => {
    const r = rig();
    r.swap.begin('history');
    const body = node('div', 'history-body', node('section', 'card state loading'));
    body.children[0]!.setAttribute('data-swap-pending', '');
    r.area.append(node('h1', '', 'Histórico'), node('div', 'machine-slot'), body);
    r.tick();
    assert.equal(r.ghosts().length, 1, 'the loading card is not data');
    body.replaceChildren(node('div', 'days'));
    r.tick();
    assert.equal(r.ghosts().length, 0);
  });

  test('the area is inert while the ghost is on screen and is free again when it leaves (A2)', () => {
    const r = rig();
    const inert = () => (r.area as unknown as { inert?: boolean }).inert;
    r.swap.begin('wall');
    assert.equal(inert(), true, 'a click or Tab cannot reach the hidden new screen');
    r.timers.flush();
    assert.equal(inert(), true, 'still inert once the skeleton shows');
    r.swap.settle();
    assert.equal(inert(), false);
  });

  test('mounted() in the real shape of Histórico: mount returns before the read, the ghost stays until the days arrive (A1)', () => {
    const r = rig();
    r.swap.begin('history');
    const body = node('div', 'hist-body', node('div', 'hist-region', node('section', 'card state loading')));
    body.querySelector('.state')!.setAttribute('data-swap-pending', '');
    r.area.append(node('h1', '', 'Histórico'), node('div', 'hist-machines'), body);
    r.swap.mounted();
    assert.equal(r.ghosts().length, 1, 'the generic loading card never shows between the swap and the read');
    assert.ok(r.watching, 'still watching for the days');
    body.replaceChildren(node('div', 'hist-group'));
    r.tick();
    assert.equal(r.ghosts().length, 0);
  });

  test('mounted() settles at once when the screen already has its data', () => {
    const r = rig();
    r.swap.begin('wall');
    r.area.append(node('h1', '', 'Mural'), node('div', 'cards'));
    r.swap.mounted();
    assert.equal(r.ghosts().length, 0);
  });

  test('the seeded header of Detalhe is data: its loading body carries no pending mark, so it settles at once (N1)', () => {
    const r = rig();
    r.swap.begin('session-detail');
    const body = node('div', 'sd-body', node('section', 'card state loading'));
    body.querySelector('.state')!.setAttribute('aria-busy', 'true');
    r.area.append(node('div', 'notice-slot'), node('div', '', node('h1', '', 'Título da lista')), body);
    r.tick();
    assert.equal(r.ghosts().length, 0, 'the seeded header shows before the read');
  });

  test('a screen with a part still reading (aria-busy) but no pending mark settles at once, the shape of Entregas (N3)', () => {
    const r = rig();
    r.swap.begin('analytics-delivery');
    const github = node('section', 'card state loading');
    github.setAttribute('aria-busy', 'true');
    r.area.append(node('h1', '', 'Entregas'), node('div', 'tabs'), github);
    r.swap.mounted();
    assert.equal(r.ghosts().length, 0, 'a part reading the GitHub does not hold the old screen over the new one');
    assert.ok(!r.watching, 'and the observer is gone');
  });

  test('only the first-read card marked data-swap-pending holds the ghost, and it leaves with the mark', () => {
    const r = rig();
    r.swap.begin('history');
    const body = node('div', 'hist-body', node('section', 'card state loading'));
    body.querySelector('.state')!.setAttribute('data-swap-pending', '');
    r.area.append(node('h1', '', 'Histórico'), body);
    r.swap.mounted();
    assert.equal(r.ghosts().length, 1);
    body.replaceChildren(node('section', 'card state loading'));
    r.tick();
    assert.equal(r.ghosts().length, 0, 'the mark is gone, so the area has its data');
  });

  test('with the drawer open the area stays inert through begin and settle (N2)', () => {
    const column = node('div', 'cc-col');
    const area = node('main', 'cc-main');
    column.append(area);
    area.append(node('h1', '', 'Início'));
    let open = true;
    const swap = createScreenSwap({ area, held: () => open, setTimer: () => 1, clearTimer: () => {}, observe: () => () => {} });
    const inert = () => (area as unknown as { inert?: boolean }).inert;
    swap.begin('sessions');
    assert.equal(inert(), true);
    area.append(node('h1', '', 'Sessões'));
    swap.settle();
    assert.equal(inert(), true, 'the content behind the drawer stays inert');
    open = false;
    swap.begin('wall');
    area.append(node('h1', '', 'Mural'));
    swap.settle();
    assert.equal(inert(), false, 'and is free when the drawer is closed');
  });

  test('settle with no ghost is a no-op, and a first load with nothing to keep shows a blank ghost then the skeleton', () => {
    const r = rig();
    r.swap.settle();
    r.area.replaceChildren();
    r.swap.begin('dashboard');
    assert.equal(r.ghosts()[0]!.childNodes.length, 0);
    r.timers.flush();
    assert.ok(r.ghosts()[0]!.querySelector('.sk[data-shape="stats"]'));
  });
});

describe('Each screen has its own shape (#765, M1)', () => {
  test('the shape of a screen is its kind, and a screen with no shape of its own gets rows', () => {
    assert.equal(shapeOf('wall'), 'cards');
    assert.equal(shapeOf('dashboard'), 'stats');
    assert.equal(shapeOf('sessions'), 'rows');
    assert.equal(shapeOf('kanban'), 'columns');
    assert.equal(shapeOf('work'), 'columns');
    assert.equal(shapeOf('session-detail'), 'detail');
    assert.equal(shapeOf('anything-else'), 'rows');
  });

  test('every skeleton starts with the title row and says nothing in text', () => {
    for (const id of ['wall', 'dashboard', 'sessions', 'kanban', 'session-detail', 'x']) {
      const sk = skeleton(id);
      assert.ok(sk.querySelector('.sk-title'), `${id} has a title row`);
      assert.equal(sk.textContent.trim(), '', `${id} is shape only`);
    }
  });

  test('the shapes: rows of 44 px, cards of 252 px, columns, stats and a detail with header, notice and blocks', () => {
    assert.ok(skeleton('sessions').querySelectorAll('.sk-row').length >= 8);
    assert.equal(skeleton('wall').querySelectorAll('.sk-card').length, 6);
    assert.equal(skeleton('kanban').querySelectorAll('.sk-column').length, 4);
    assert.equal(skeleton('dashboard').querySelectorAll('.sk-stat').length, 6);
    const detail = skeleton('session-detail');
    assert.ok(detail.querySelector('.sk-head'));
    assert.ok(detail.querySelector('.sk-notice'));
    assert.ok(detail.querySelectorAll('.sk-block').length >= 3);
  });

  test('the sizes live in the CSS: rows 44 px, cards 252 px (the Mural card), and no animation at all', () => {
    const css = ui('shell.css');
    const rule = (sel: string) => css.match(new RegExp(`${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    assert.match(rule('.sk-row'), /height:\s*44px/);
    assert.match(rule('.sk-card'), /height:\s*252px/);
    for (const sel of ['.sk', '.sk-row', '.sk-card', '.sk-column', '.sk-stat', '.sk-head', '.sk-notice', '.sk-block', '.sk-title', '.cc-ghost']) {
      assert.doesNotMatch(rule(sel), /animation|transition/, `${sel} does not move`);
    }
    assert.match(rule('.cc-ghost'), /position:\s*absolute/);
    assert.match(rule('.cc-ghost'), /overflow:\s*hidden/);
    assert.match(css, /\.cc-col\s*\{[^}]*position:\s*relative/);
  });
});

describe('The shell uses the swap (#765)', () => {
  const app = ui('app.js');
  test('the area goes through createScreenSwap, begun before the screen module loads and settled when it mounts or fails', () => {
    assert.match(app, /createScreenSwap\(\{ area/);
    const begin = app.indexOf('swap.begin(screen.id)');
    assert.ok(begin > 0, 'begins with the screen id');
    assert.ok(begin < app.indexOf('await import(screen.file)'), 'before the module loads');
    assert.match(app, /swap\.settle\(\)/);
  });
  test('the mount returning is not the data arriving: app.js calls mounted(), and the drawer holds the area inert (A1, N2)', () => {
    const mount = app.slice(app.indexOf('await module.mount(area, ctx)'), app.indexOf('drawLive();', app.indexOf('await module.mount(area, ctx)')));
    assert.match(mount, /swap\.mounted\(\)/);
    assert.doesNotMatch(mount, /swap\.settle\(\)/);
    assert.match(app, /createScreenSwap\(\{ area, held: \(\) => drawer\.isOpen\(\) \}\)/);
  });
  test('only the first-read card of Histórico and Sessões says it is pending, and Detalhe marks nothing (N1, N3)', () => {
    assert.match(ui('screens/history.js'), /data-swap-pending/);
    assert.match(ui('screens/sessions.js'), /data-swap-pending/);
    assert.doesNotMatch(ui('screens/session-detail.js'), /data-swap-ready|data-swap-pending/);
    assert.doesNotMatch(ui('screen-swap.js'), /aria-busy|data-swap-ready/);
  });
  test('a screen that does not exist leaves no ghost behind', () => {
    const lost = app.slice(app.indexOf('if (!found) {'), app.indexOf('const { screen, params } = found;'));
    assert.match(lost, /swap\.settle\(\)/);
  });
});
