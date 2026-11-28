// #767-micro-interactions (ADR-0028): answering from the Mural gives something back. The press, the busy button and its check,
// #767-micro-interactions: the card that leaves and comes back with the toast "Desfazer", the line of the toast that waits for who is reading, the keys
// #767-micro-interactions: A, N and 1-9 on a card, the rolling count, the copy of the command and the empty list. Without `prefers-reduced-motion` things
// #767-micro-interactions: move; with it everything just swaps. "Segurar para confirmar" is omitted on purpose (the declaration of commands is not built).
// #767-micro-interactions: Timers are the mock ones of node:test; the promises are settled with `setImmediate`, which stays real.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { ElementoFalso, documentoFalso, instalarDomFalso } from './fake-dom.ts';

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
const clipboard: string[] = [];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (t: string) => void clipboard.push(t) } } });
let reduced = false;
Object.assign(globalThis, { matchMedia: (query: string) => ({ matches: reduced && query.includes('prefers-reduced-motion'), addEventListener: () => {}, removeEventListener: () => {} }) });

// @ts-expect-error: browser module, plain JavaScript
const wall = await import('../../ui/screens/wall.js');
// @ts-expect-error: idem
const { resetOpenStates } = await import('../../ui/open-action.js');
// @ts-expect-error: idem
const { resetMachineChoice } = await import('../../ui/machine-filter.js');
// @ts-expect-error: idem
const display = await import('../../ui/display.js');
// @ts-expect-error: idem
const { createNav } = await import('../../ui/nav.js');
// @ts-expect-error: idem
const { createDrawer } = await import('../../ui/drawer.js');
// @ts-expect-error: idem
const { createCounts } = await import('../../ui/counts.js');
// @ts-expect-error: idem
const { SCREENS } = await import('../../ui/screens.js');

const NOW = Date.parse('2026-10-20T12:30:00Z');
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();
const flush = async () => {
  for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
};
const one = (root: ElementoFalso, selector: string) => root.querySelector(selector)!;
const all = (root: ElementoFalso, selector: string) => root.querySelectorAll(selector);
const text = (n: ElementoFalso | null) => n?.textContent ?? '';
const css = (name: string) => readFileSync(`${UI_FOLDER}/${name}`, 'utf8');

type Card = Record<string, unknown>;
const open = { target: 'desktop', command: null };
const working = (id: string, extra: Card = {}): Card => ({ id, title: `Sessão ${id}`, status: 'active', state: 'active', since: minutesAgo(6), activity: { type: 'tool', text: 'Rodar a bateria' }, plan: { done: 1, total: 4, current: 'x' }, context: { pct: 31 }, open, ...extra });
const asking = (id: string, extra: Card = {}): Card => working(id, { status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'permission' }, activity: { type: 'permission', text: 'rm -rf build' }, ...extra });
const wallOf = (cards: Card[]) => ({ version: 1, count: { all: cards.length, blocked: 1, idle: 0 }, cards });

function start(initial: Card) {
  resetOpenStates();
  resetMachineChoice();
  const area = new ElementoFalso('main');
  const waiting: number[] = [];
  const state = { wall: initial };
  const leave = new AbortController();
  const ctx = {
    params: {},
    signal: leave.signal,
    read: async (route: string) => {
      if (route.startsWith('/api/new-session/folders')) return { folders: [], targets: {} };
      return structuredClone(state.wall);
    },
    write: async () => ({ ok: true, opened: 'desktop' }),
    onChange: () => {},
    onRestart: () => {},
    counter: () => {},
    waiting: (n: number) => void waiting.push(n),
    title: () => {},
    navigate: () => {},
    liveState: () => 'live',
  };
  return { area, waiting, leave, mounted: wall.mount(area, ctx) as Promise<() => void> };
}

let stop: (() => void) | null = null;
beforeEach(() => {
  display.resetDisplayMemory();
  display.setDisplayMode('dev');
  clipboard.length = 0;
});
afterEach(() => {
  documentoFalso.activeElement = null;
  reduced = false;
  stop?.();
  stop = null;
  mock.timers.reset();
});

async function mountWith(initial: Card) {
  mock.timers.reset();
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: NOW });
  const s = start(initial);
  const unmount = await s.mounted;
  stop = () => {
    unmount();
    s.leave.abort();
  };
  await flush();
  return s;
}

const cardOf = (s: { area: ElementoFalso }, id: string) => s.area.querySelector(`.wall-card[data-session="${id}"]`);
const answerOf = (s: { area: ElementoFalso }, id: string, which = 'allow') => cardOf(s, id)!.querySelector(`button[data-answer="${which}"]`)!;
const blockedCount = (s: { area: ElementoFalso }) => text(one(s.area, '[data-filter="blocked"] .wall-seg-n'));
const toast = (s: { area: ElementoFalso }) => s.area.querySelector('.wall-toast');
const press = (key: string, target: ElementoFalso | null = null, extra: Record<string, unknown> = {}) => {
  const ev = { type: 'keydown', key, target: target ?? undefined, ...extra } as Parameters<typeof documentoFalso.dispatchEvent>[0] & { defaultPrevented?: boolean };
  ev.preventDefault = () => void (ev.defaultPrevented = true);
  documentoFalso.dispatchEvent(ev);
  return ev;
};

describe('#767: answer and undo', () => {
  test('the button is busy, then shows the check; the card leaves, the session shows in "Trabalhando" and the count goes down by 1', async () => {
    const s = await mountWith(wallOf([asking('c1'), asking('c2'), working('w1')]));
    assert.equal(blockedCount(s), '2');
    const button = answerOf(s, 'c1');
    button.click();
    assert.equal(button.getAttribute('aria-busy'), 'true', 'the spinner shows while the action runs');
    await flush();
    assert.equal(button.getAttribute('data-state'), 'done', 'then the check');
    assert.equal(cardOf(s, 'c1')!.getAttribute('data-leaving'), 'true', 'the card starts to leave after the check');
    mock.timers.tick(220);
    assert.equal(cardOf(s, 'c1'), null, 'the card is out of "Precisam de você"');
    assert.ok(one(s.area, '.wall-sec-active [data-session="c1"]'), 'the session is in "Trabalhando"');
    assert.equal(blockedCount(s), '1');
    assert.equal(s.waiting.at(-1), 1, 'the count of the bar goes down by 1');
  });

  test('a toast confirms "Você permitiu em ..." and offers "Desfazer"; the focus goes to the next card, never to the body', async () => {
    const s = await mountWith(wallOf([asking('c1'), asking('c2')]));
    answerOf(s, 'c1').click();
    await flush();
    mock.timers.tick(220);
    assert.match(text(toast(s)), /Você permitiu em Sessão c1/);
    assert.equal(text(one(s.area, '.wall-toast [data-toast="undo"]')), 'Desfazer');
    assert.equal(documentoFalso.activeElement, answerOf(s, 'c2'), 'the next card');
  });

  test('with no other card the focus goes to the session that moved, not to the body', async () => {
    const s = await mountWith(wallOf([asking('c1')]));
    answerOf(s, 'c1').click();
    await flush();
    mock.timers.tick(220);
    const at = documentoFalso.activeElement;
    assert.ok(at, 'something has the focus');
    assert.equal(at!.closest('[data-session]')?.getAttribute('data-session'), 'c1');
  });

  test('"Desfazer" returns the card, the count and the focus to the button of the card', async () => {
    const s = await mountWith(wallOf([asking('c1'), asking('c2')]));
    answerOf(s, 'c1').click();
    await flush();
    mock.timers.tick(220);
    one(s.area, '[data-toast="undo"]').click();
    assert.ok(cardOf(s, 'c1'), 'the card is back');
    assert.equal(one(s.area, '.wall-sec-blocked').querySelectorAll('.wall-card').length, 2);
    assert.equal(blockedCount(s), '2');
    assert.equal(s.waiting.at(-1), 2);
    assert.equal(documentoFalso.activeElement, answerOf(s, 'c1'), 'the button of the card');
    assert.equal(toast(s), null, 'the toast is gone');
  });

  test('"Negar" says "Você negou em ..."', async () => {
    const s = await mountWith(wallOf([asking('c1')]));
    answerOf(s, 'c1', 'deny').click();
    await flush();
    mock.timers.tick(220);
    assert.match(text(toast(s)), /Você negou em Sessão c1/);
  });

  test('when the last card leaves, "Nada precisa de você agora" enters; it is not animated on a first draw', async () => {
    const first = await mountWith(wallOf([working('w1')]));
    assert.equal(one(first.area, '.wall-calm').getAttribute('data-enter'), null);
    stop?.();
    stop = null;
    const s = await mountWith(wallOf([asking('c1'), working('w1')]));
    answerOf(s, 'c1').click();
    await flush();
    mock.timers.tick(220);
    assert.equal(one(s.area, '.wall-calm').getAttribute('data-enter'), 'true');
  });
});

describe('#767: the toast waits for who is reading', () => {
  async function toasted() {
    const s = await mountWith(wallOf([asking('c1'), asking('c2')]));
    answerOf(s, 'c1').click();
    await flush();
    mock.timers.tick(220);
    return s;
  }

  test('the line is 2 px, empties in 6 s by transform and the toast leaves at 6 s', async () => {
    const s = await toasted();
    assert.ok(one(s.area, '.wall-toast .wall-toast-line'));
    assert.equal(one(s.area, '.wall-toast').style.getPropertyValue('--toast-ms'), '6000ms');
    mock.timers.tick(5900);
    assert.ok(toast(s));
    mock.timers.tick(200);
    assert.equal(toast(s), null);
    const wallCss = css('wall.css');
    assert.match(wallCss, /\.wall-toast-line \{[^}]*height: 2px/);
    assert.match(wallCss, /@keyframes wall-toast-line \{[^}]*transform: scaleX\(0\)/);
    assert.doesNotMatch(wallCss.match(/@keyframes wall-toast-line \{[^@]*\}\s*\}/)?.[0] ?? 'x', /width/);
  });

  test('the mouse over the toast pauses the line and the toast stays; leaving resumes with the time that was left', async () => {
    const s = await toasted();
    const node = toast(s)!;
    mock.timers.tick(3000);
    node.dispatchEvent({ type: 'mouseenter' });
    assert.equal(node.getAttribute('data-paused'), 'true');
    mock.timers.tick(20_000);
    assert.ok(toast(s), 'the toast does not leave while the mouse is over it');
    node.dispatchEvent({ type: 'mouseleave' });
    assert.equal(node.getAttribute('data-paused'), null);
    mock.timers.tick(2900);
    assert.ok(toast(s), '3 s were left');
    mock.timers.tick(200);
    assert.equal(toast(s), null);
  });

  test('the focus inside the toast pauses it too, until the focus goes out', async () => {
    const s = await toasted();
    const node = toast(s)!;
    const undo = one(s.area, '[data-toast="undo"]');
    undo.dispatchEvent({ type: 'focusin' });
    assert.equal(node.getAttribute('data-paused'), 'true');
    mock.timers.tick(30_000);
    assert.ok(toast(s));
    undo.dispatchEvent({ type: 'focusout', relatedTarget: null } as never);
    assert.equal(node.getAttribute('data-paused'), null);
    mock.timers.tick(6100);
    assert.equal(toast(s), null);
  });
});

describe('#767: reduced motion', () => {
  test('no card slides: the card is out at once, with no leaving state', async () => {
    reduced = true;
    const s = await mountWith(wallOf([asking('c1'), asking('c2')]));
    answerOf(s, 'c1').click();
    await flush();
    assert.equal(cardOf(s, 'c1'), null, 'it just swaps');
    assert.ok(one(s.area, '.wall-sec-active [data-session="c1"]'));
  });

  test('the toast still waits for the mouse, even with the line hidden by the CSS', async () => {
    reduced = true;
    const s = await mountWith(wallOf([asking('c1'), asking('c2')]));
    answerOf(s, 'c1').click();
    await flush();
    const node = toast(s)!;
    node.dispatchEvent({ type: 'mouseenter' });
    mock.timers.tick(60_000);
    assert.ok(toast(s));
    const block = css('wall.css').match(/@media \(prefers-reduced-motion: reduce\) \{[^@]*\.wall-toast-line[^@]*\}/)?.[0] ?? '';
    assert.match(block, /\.wall-toast-line \{[^}]*display: none/);
  });

  test('the CSS: the press shrink is 96% in 80 ms and 120 ms back, by transform only; reduced motion takes it, the slide and the roll away', () => {
    const shell = css('shell.css');
    assert.match(shell, /--btn-press-scale: \.96/);
    assert.match(shell, /--btn-press-in: 80ms/);
    assert.match(shell, /\.btn:active:not\(:disabled\):not\(\[aria-disabled="true"\]\) \{[^}]*transform: scale\(var\(--btn-press-scale\)\)/);
    assert.match(shell, /\.btn \{[^}]*transition: transform var\(--motion-fast\) var\(--ease-out\)/);
    assert.match(shell, /@media \(prefers-reduced-motion: reduce\) \{\s*\.btn \{[^}]*transition: none;[^}]*\}\s*\.btn:active[^}]*transform: none/);
    assert.match(shell, /@media \(prefers-reduced-motion: no-preference\) \{\s*\[data-roll\] \{[^}]*animation: roll-in/);
    const wallCss = css('wall.css');
    assert.match(wallCss, /\.wall-card\[data-leaving\] \{[^}]*opacity: 0;[^}]*transform: translateX\(12px\)/);
    assert.match(wallCss, /\.wall-card \{[^}]*transition: [^;]*var\(--motion-move\)/);
    assert.match(wallCss, /\.wall-calm\[data-enter\] \{[^}]*animation: [^;]*var\(--motion-base\)/);
    assert.match(wallCss, /@keyframes wall-calm-in \{[^}]*transform: scale\(\.98\)/);
  });
});

describe('#767: the keys of the card', () => {
  const hover = (s: { area: ElementoFalso }, id: string) => cardOf(s, id)!.dispatchEvent({ type: 'mouseenter' });

  test('with the mouse over a card, A allows and N denies', async () => {
    const s = await mountWith(wallOf([asking('c1'), asking('c2')]));
    hover(s, 'c1');
    press('a');
    assert.equal(answerOf(s, 'c1').getAttribute('aria-busy'), 'true');
    await flush();
    mock.timers.tick(220);
    assert.match(text(toast(s)), /Você permitiu em Sessão c1/);
    cardOf(s, 'c2')!.dispatchEvent({ type: 'mouseenter' });
    press('N');
    await flush();
    mock.timers.tick(220);
    assert.match(text(toast(s)), /Você negou em Sessão c2/);
  });

  test('with the focus inside a card the keys work; with none over or in, they do nothing', async () => {
    const s = await mountWith(wallOf([asking('c1'), asking('c2')]));
    press('a');
    assert.equal(all(s.area, '[aria-busy="true"]').length, 0, 'no card in reach');
    one(s.area, 'a.wall-link[data-session="c2"]').focus();
    press('a', one(s.area, 'a.wall-link[data-session="c2"]'));
    assert.equal(answerOf(s, 'c2').getAttribute('aria-busy'), 'true');
  });

  test('they never fire while typing, with Ctrl, Meta or Alt, and they leave J, K, ? and Cmd+K alone', async () => {
    const s = await mountWith(wallOf([asking('c1')]));
    hover(s, 'c1');
    press('a', new ElementoFalso('input'));
    press('a', null, { metaKey: true });
    press('n', null, { ctrlKey: true });
    press('k', null, { metaKey: true });
    assert.equal(all(s.area, '[aria-busy="true"]').length, 0);
    const j = press('j');
    assert.equal(j.defaultPrevented, true, 'J still moves the focus');
    assert.equal(answerOf(s, 'c1').getAttribute('aria-busy'), null, 'and does not answer');
  });

  test('1 to 9 choose the option of a card that has them', async () => {
    const s = await mountWith(wallOf([asking('c1', { attention: { level: 'blocked', reason: 'question' }, activity: { type: 'question', text: 'Qual pasta?', options: ['Sim', 'Não'] } })]));
    assert.equal(all(s.area, 'button[data-answer="option"]').length, 2);
    hover(s, 'c1');
    press('2');
    await flush();
    mock.timers.tick(220);
    assert.match(text(toast(s)), /Você escolheu Não em Sessão c1/);
    press('9');
  });

  test('the hint of the keys shows at the corner of the card only in Dev', async () => {
    const dev = await mountWith(wallOf([asking('c1')]));
    assert.ok(cardOf(dev, 'c1')!.querySelector('.wall-hint'));
    stop?.();
    stop = null;
    display.setDisplayMode('project');
    const project = await mountWith(wallOf([asking('c1')]));
    assert.equal(cardOf(project, 'c1')!.querySelector('.wall-hint'), null);
  });
});

describe('#767: the number that rolls', () => {
  test('in the title of the section the number enters with data-roll when it changes, and not on the first draw', async () => {
    const s = await mountWith(wallOf([asking('c1'), asking('c2')]));
    assert.equal(one(s.area, '.wall-sec-blocked .wall-h-n').getAttribute('data-roll'), null);
    answerOf(s, 'c1').click();
    await flush();
    mock.timers.tick(220);
    assert.ok(one(s.area, '.wall-sec-blocked .wall-h-n').getAttribute('data-roll'));
  });

  test('in the bar and on the menu button the tag rolls when its text changes, not on a redraw with the same text', () => {
    const nav = new ElementoFalso('nav');
    const bar = createNav({ nav, read: async () => [], screens: SCREENS });
    bar.tag('wall', { tone: 'waiting', text: '3 esperam' });
    assert.equal(nav.querySelector('[data-screen="wall"] .cc-nav-tag')!.getAttribute('data-roll'), null, 'first paint');
    bar.tag('wall', { tone: 'waiting', text: '2 esperam' });
    assert.ok(nav.querySelector('[data-screen="wall"] .cc-nav-tag')!.getAttribute('data-roll'));
    bar.tag('wall', { tone: 'waiting', text: '2 esperam' });
    assert.equal(nav.querySelector('[data-screen="wall"] .cc-nav-tag')!.getAttribute('data-roll'), null, 'same text');

    const button = new ElementoFalso('button');
    const count = new ElementoFalso('span');
    button.append(count);
    const scrim = new ElementoFalso('div');
    const drawer = createDrawer({ button, side: new ElementoFalso('aside'), scrim, background: [], count, dot: null, media: { matches: false, addEventListener: () => {} } });
    drawer.waiting({ tone: 'waiting', text: '3 esperam' });
    assert.equal(count.getAttribute('data-roll'), null);
    drawer.waiting({ tone: 'waiting', text: '2 esperam' });
    assert.ok(count.getAttribute('data-roll'));
  });

  test('the counts show a number the screen knows, without a read', () => {
    const shown: unknown[] = [];
    const counts = createCounts({ read: async () => ({}), nav: { tag: (_id: string, tag: unknown) => void shown.push(tag) } });
    counts.show(1);
    assert.deepEqual(shown.at(-1), { tone: 'waiting', text: '1 espera' });
    counts.show(0);
    assert.equal(shown.at(-1), null);
  });
});

describe('#767: copy the command', () => {
  test('in Dev the command block has an icon that copies, turns into a check and "Copiado" for 1.2 s, then comes back', async () => {
    const s = await mountWith(wallOf([asking('c1')]));
    const copy = one(s.area, '.wall-card .wall-copy');
    assert.equal(copy.getAttribute('aria-label'), 'Copiar comando');
    copy.click();
    await flush();
    assert.deepEqual(clipboard, ['rm -rf build']);
    assert.equal(copy.getAttribute('data-copied'), 'true');
    assert.equal(copy.getAttribute('aria-label'), 'Copiado');
    assert.match(text(copy), /Copiado/);
    mock.timers.tick(1200);
    assert.equal(copy.getAttribute('data-copied'), null);
    assert.equal(copy.getAttribute('aria-label'), 'Copiar comando');
  });

  test('in Projeto the block has no copy icon', async () => {
    display.setDisplayMode('project');
    const s = await mountWith(wallOf([asking('c1')]));
    assert.equal(s.area.querySelector('.wall-copy'), null);
  });
});
