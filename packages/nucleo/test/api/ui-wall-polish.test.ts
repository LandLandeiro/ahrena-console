// Issue 758 (ADR-0028): the finish of the wall. The "há N min" that walks by itself, the skeleton and the error band, what a live
// change shows (a short highlight, a notice in the corner), the keys J, K and ?, and the quiet hover row.
// Timers are the mock ones of node:test; the promises of the reads are settled with `setImmediate`, which stays real.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, mock, test } from 'node:test';
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

// @ts-expect-error: browser module, plain JavaScript
const wall = await import('../../ui/screens/wall.js');
// @ts-expect-error: idem
const { resetOpenStates } = await import('../../ui/open-action.js');
// @ts-expect-error: idem
const { resetMachineChoice } = await import('../../ui/machine-filter.js');

const NOW = Date.parse('2026-10-20T12:30:00Z');
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();
const flush = async () => {
  for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
};
const one = (root: ElementoFalso, selector: string) => root.querySelector(selector)!;
const all = (root: ElementoFalso, selector: string) => root.querySelectorAll(selector);
const text = (n: ElementoFalso | null) => n?.textContent ?? '';
const innerText = (n: ElementoFalso): string => n.childNodes.map((c) => (c instanceof ElementoFalso ? innerText(c) : c.textContent)).join('');

type Card = Record<string, unknown>;
const open = { target: 'desktop', command: null };
const working = (id: string, extra: Card = {}): Card => ({ id, title: `Sessão ${id}`, status: 'active', state: 'active', since: minutesAgo(6), activity: { type: 'tool', text: 'Rodar a bateria' }, plan: { done: 1, total: 4, current: 'x' }, context: { pct: 31 }, open, ...extra });
const blocked = (id: string, extra: Card = {}) => working(id, { status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'question' }, ...extra });
const paused = (id: string, extra: Card = {}) => working(id, { attention: { level: 'idle', reason: 'turn_ended' }, ...extra });
const finished = (id: string, extra: Card = {}) => working(id, { status: 'completed', state: 'completed', activity: { type: 'completed', text: '' }, ...extra });
const wallOf = (cards: Card[]) => ({ version: 1, count: { all: cards.length, blocked: 1, idle: 0 }, cards });

function start(initial: Card, { gate = null as Promise<void> | null, failRead = false } = {}) {
  resetOpenStates();
  resetMachineChoice();
  const area = new ElementoFalso('main');
  const state = { wall: initial, reads: 0, attempts: 0, failRead, gate };
  const leave = new AbortController();
  const changes: ((c?: unknown) => void)[] = [];
  const ctx = {
    params: {},
    signal: leave.signal,
    read: async (route: string) => {
      if (route.startsWith('/api/new-session/folders')) return { folders: [], targets: {} };
      state.attempts++;
      if (state.gate) await state.gate;
      if (state.failRead) throw new Error('O núcleo não respondeu.');
      state.reads++;
      return structuredClone(state.wall);
    },
    write: async () => ({ ok: true, opened: 'desktop' }),
    onChange: (f: (c?: unknown) => void) => changes.push(f),
    onRestart: () => {},
    counter: () => {},
    title: () => {},
    navigate: () => {},
    liveState: () => 'live',
  };
  const mounted = wall.mount(area, ctx) as Promise<() => void>;
  return {
    area,
    state,
    mounted,
    leave,
    // A change of the core: the read comes after the throttle, or at once for a request (`needs-you`).
    async reread(next: Card, changeList: unknown = [{ type: 'state' }]) {
      state.wall = next;
      for (const f of changes) f(changeList);
      mock.timers.tick(150);
      await flush();
    },
  };
}

let stop: (() => void) | null = null;
afterEach(() => {
  documentoFalso.activeElement = null;
  delete (documentoFalso as { hidden?: boolean }).hidden;
  stop?.();
  stop = null;
  mock.timers.reset();
});

async function mountWith(initial: Card) {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: NOW });
  const s = start(initial);
  const unmount = await s.mounted;
  stop = () => {
    unmount();
    s.leave.abort();
  };
  await flush();
  return { ...s, unmount };
}

describe('issue 758: "há N min" walks by itself every 30 s, without reading the route again', () => {
  test('two ticks of 30 s turn "há 6 min" into "há 7 min" with no new read, and the idle row follows', async () => {
    const s = await mountWith(wallOf([blocked('c1', { since: minutesAgo(6) }), paused('p1', { since: minutesAgo(6) })]));
    assert.equal(text(one(s.area, '.wall-age')), 'há 6 min');
    assert.equal(text(one(s.area, '.wall-since')), 'há 6 min');
    const reads = s.state.attempts;
    mock.timers.tick(30_000);
    assert.equal(text(one(s.area, '.wall-age')), 'há 6 min', 'at 6 min 30 s it is still 6');
    mock.timers.tick(30_000);
    assert.equal(text(one(s.area, '.wall-age')), 'há 7 min');
    assert.equal(text(one(s.area, '.wall-since')), 'há 7 min', 'the idle row walks too');
    assert.equal(s.state.attempts, reads, 'the route is not read again');
  });

  test('a tick redraws only the time: the nodes of the wall are the same', async () => {
    const s = await mountWith(wallOf([blocked('c1'), working('w1')]));
    const card = one(s.area, '.wall-card');
    const age = one(s.area, '.wall-age');
    mock.timers.tick(60_000);
    assert.equal(text(age), 'há 7 min', 'the time moved');
    assert.equal(one(s.area, '.wall-card'), card);
    assert.equal(one(s.area, '.wall-age'), age);
  });

  test('leaving the screen stops the timer', async () => {
    const s = await mountWith(wallOf([blocked('c1')]));
    const age = one(s.area, '.wall-age');
    mock.timers.tick(60_000);
    assert.equal(text(age), 'há 7 min', 'it walks while the screen is there');
    s.unmount();
    stop = () => s.leave.abort();
    mock.timers.tick(120_000);
    assert.equal(text(age), 'há 7 min', 'nothing writes after the screen left');
  });

  test('a hidden tab runs no timer; coming back brings the time up to date at once', async () => {
    const s = await mountWith(wallOf([blocked('c1')]));
    const doc = documentoFalso as unknown as { hidden: boolean };
    doc.hidden = true;
    documentoFalso.dispatchEvent({ type: 'visibilitychange' });
    mock.timers.tick(120_000);
    assert.equal(text(one(s.area, '.wall-age')), 'há 6 min', 'hidden: no tick');
    doc.hidden = false;
    documentoFalso.dispatchEvent({ type: 'visibilitychange' });
    assert.equal(text(one(s.area, '.wall-age')), 'há 8 min', 'visible again: caught up at once');
    delete (doc as { hidden?: boolean }).hidden;
  });
});

describe('issue 758: loading and read error', () => {
  test('before the first read the wall shows the shape of one card and three rows, busy and named', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: NOW });
    let release: () => void = () => {};
    const s = start(wallOf([blocked('c1')]), { gate: new Promise<void>((r) => (release = r)) });
    await flush();
    const skeleton = one(s.area, '.wall-skel');
    assert.equal(skeleton.getAttribute('aria-busy'), 'true');
    assert.equal(skeleton.getAttribute('aria-label'), 'Lendo o mural');
    assert.equal(all(skeleton, '.wall-skel-card').length, 1);
    assert.equal(all(skeleton, '.wall-skel-row').length, 3);
    release();
    const unmount = await s.mounted;
    stop = () => {
      unmount();
      s.leave.abort();
    };
    await flush();
    assert.equal(all(s.area, '.wall-skel').length, 0, 'the data replaces it');
  });

  test('a read that fails after a good one keeps the wall and shows the band in the wall style, with Tentar de novo', async () => {
    const s = await mountWith(wallOf([blocked('c1')]));
    s.state.failRead = true;
    await s.reread(wallOf([blocked('c1')]));
    const band = one(s.area, '.error-band');
    assert.ok(band.classList.contains('wall-error-band'));
    assert.match(innerText(band), /O mural não atualizou\./);
    assert.match(innerText(band), /Tentar de novo/);
    assert.equal(all(s.area, '.wall-card').length, 1, 'the wall stays under the band');
  });
});

describe('issue 758: a session that changes section enters with a short highlight', () => {
  test('the moved session carries wall-moved for a moment, the others do not; the first read marks nothing', async () => {
    const s = await mountWith(wallOf([working('w1'), working('w2')]));
    assert.equal(all(s.area, '.wall-moved').length, 0, 'the first read moves nothing');
    await s.reread(wallOf([paused('w1'), working('w2')]));
    const moved = all(s.area, '.wall-moved');
    assert.equal(moved.length, 1);
    assert.equal(moved[0]!.getAttribute('data-session'), 'w1');
    mock.timers.tick(3000);
    await flush();
    assert.equal(all(s.area, '.wall-moved').length, 0, 'the highlight leaves by itself');
  });
});

describe('issue 758: the notice in the corner', () => {
  const notices = (s: { area: ElementoFalso }) => all(s.area, '.wall-notice');

  test('the first read says nothing; a new request and a finished session each say one thing, in a polite status region', async () => {
    const s = await mountWith(wallOf([working('w1'), working('w2')]));
    assert.equal(notices(s).length, 0, 'the first read: no notice');
    const region = one(s.area, '.wall-notices');
    assert.equal(region.getAttribute('role'), 'status');
    assert.equal(region.getAttribute('aria-live'), 'polite');
    await s.reread(wallOf([blocked('w1', { title: 'Migrar o banco' }), working('w2')]), [{ type: 'needs-you' }]);
    assert.equal(notices(s).length, 1);
    assert.match(innerText(notices(s)[0]!), /Pedido novo: Migrar o banco/);
    await s.reread(wallOf([blocked('w1', { title: 'Migrar o banco' }), finished('w2', { title: 'Traduzir erros' })]));
    assert.equal(notices(s).length, 2);
    assert.match(innerText(notices(s)[1]!), /Concluída: Traduzir erros/);
  });

  test('a move that is neither a new request nor a finish says nothing', async () => {
    const s = await mountWith(wallOf([working('w1')]));
    await s.reread(wallOf([paused('w1')]));
    assert.equal(notices(s).length, 0);
  });

  test('a notice stays 6 s and leaves; at most three are stacked, the oldest goes first', async () => {
    const s = await mountWith(wallOf([working('a'), working('b'), working('c'), working('d')]));
    await s.reread(wallOf([blocked('a'), working('b'), working('c'), working('d')]), [{ type: 'needs-you' }]);
    mock.timers.tick(5900);
    assert.equal(notices(s).length, 1, 'still there at 5.9 s');
    mock.timers.tick(200);
    assert.equal(notices(s).length, 0, 'gone after 6 s');
    await s.reread(wallOf([blocked('a'), blocked('b'), working('c'), working('d')]), [{ type: 'needs-you' }]);
    await s.reread(wallOf([blocked('a'), blocked('b'), blocked('c'), working('d')]), [{ type: 'needs-you' }]);
    await s.reread(wallOf([blocked('a'), blocked('b'), blocked('c'), blocked('d')]), [{ type: 'needs-you' }]);
    const shown = notices(s).map(innerText);
    assert.equal(shown.length, 3);
    assert.ok(!shown.some((t) => t.includes('Sessão a')), 'the oldest was dropped');
    assert.ok(shown.some((t) => t.includes('Sessão d')));
  });

  test('a notice never takes the focus', async () => {
    const s = await mountWith(wallOf([working('w1'), working('w2')]));
    const link = one(s.area, '[data-filter="active"]');
    link.focus();
    const realFocus = ElementoFalso.prototype.focus;
    let taken = 0;
    ElementoFalso.prototype.focus = function (this: ElementoFalso) {
      if (this.closest('.wall-notices')) taken++;
      realFocus.call(this);
    };
    try {
      await s.reread(wallOf([blocked('w1'), working('w2')]), [{ type: 'needs-you' }]);
    } finally {
      ElementoFalso.prototype.focus = realFocus;
    }
    assert.equal(notices(s).length, 1);
    assert.equal(taken, 0);
    assert.equal(documentoFalso.activeElement, link, 'the focus stays where it was');
  });
});

describe('issue 758: the keys J, K and ?', () => {
  const press = (key: string, target: ElementoFalso | null, extra: Record<string, unknown> = {}) => {
    const ev = { type: 'keydown', key, target: target ?? undefined, ...extra } as Parameters<typeof documentoFalso.dispatchEvent>[0] & { defaultPrevented?: boolean };
    ev.preventDefault = () => void (ev.defaultPrevented = true);
    documentoFalso.dispatchEvent(ev);
    return ev;
  };
  const linkOf = (s: { area: ElementoFalso }, id: string) => one(s.area, `a.wall-link[data-session="${id}"]`);
  const body = (s: { area: ElementoFalso }) => one(s.area, '.wall-top');

  test('J goes to the next card or row and K to the previous one, in the order of the screen, and stops at the ends', async () => {
    const s = await mountWith(wallOf([blocked('c1'), working('w1'), paused('p1')]));
    press('j', body(s));
    assert.equal(documentoFalso.activeElement, linkOf(s, 'c1'), 'the first one');
    press('J', linkOf(s, 'c1'));
    assert.equal(documentoFalso.activeElement, linkOf(s, 'w1'));
    press('j', linkOf(s, 'w1'));
    assert.equal(documentoFalso.activeElement, linkOf(s, 'p1'));
    press('j', linkOf(s, 'p1'));
    assert.equal(documentoFalso.activeElement, linkOf(s, 'p1'), 'no wrap at the end');
    press('k', linkOf(s, 'p1'));
    assert.equal(documentoFalso.activeElement, linkOf(s, 'w1'));
    press('k', linkOf(s, 'w1'));
    press('k', linkOf(s, 'c1'));
    assert.equal(documentoFalso.activeElement, linkOf(s, 'c1'), 'no wrap at the start');
  });

  test('Enter opens: the key lands on the link of the session, which the platform opens, and the link points at its Detail', async () => {
    const s = await mountWith(wallOf([blocked('c1'), working('w1')]));
    press('j', body(s));
    const focused = documentoFalso.activeElement!;
    assert.equal(focused.tagName, 'A');
    assert.equal(focused.getAttribute('href'), '/ui/sessions/c1');
  });

  test('typing is not stolen: in a field, a select, a textarea or an editable area J, K and ? do nothing', async () => {
    const s = await mountWith(wallOf([blocked('c1'), working('w1')]));
    press('j', body(s));
    assert.ok(documentoFalso.activeElement, 'control: outside a field the key works');
    documentoFalso.activeElement = null;
    const editable = new ElementoFalso('div');
    editable.setAttribute('contenteditable', 'true');
    const inner = new ElementoFalso('span');
    editable.append(inner);
    for (const target of [new ElementoFalso('input'), new ElementoFalso('textarea'), new ElementoFalso('select'), editable, inner]) {
      for (const key of ['j', 'k', '?']) {
        const ev = press(key, target);
        assert.equal(documentoFalso.activeElement, null, `${target.tagName} ${key}: the focus did not move`);
        assert.ok(!ev.defaultPrevented, `${target.tagName} ${key}: the key is left to the field`);
      }
    }
    assert.equal(all(s.area, '[role="dialog"]').length, 0, 'no help opened');
  });

  test('with Ctrl, Meta or Alt the keys are left alone (? does not clash with the search on Cmd+K)', async () => {
    const s = await mountWith(wallOf([blocked('c1'), working('w1')]));
    press('j', body(s));
    assert.ok(documentoFalso.activeElement, 'control: without a modifier the key works');
    documentoFalso.activeElement = null;
    for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
      for (const key of ['j', 'k', '?']) {
        const ev = press(key, body(s), { [mod]: true });
        assert.equal(documentoFalso.activeElement, null, `${mod} ${key}`);
        assert.ok(!ev.defaultPrevented, `${mod} ${key}`);
      }
    }
    assert.equal(all(s.area, '[role="dialog"]').length, 0);
  });

  test('? opens a dialog with the shortcuts, and ? again closes it', async () => {
    const s = await mountWith(wallOf([blocked('c1')]));
    press('?', body(s), { shiftKey: true });
    const dialog = one(s.area, '[role="dialog"]');
    const said = innerText(dialog);
    for (const word of ['J', 'K', 'Enter', '?']) assert.ok(said.includes(word), `the help names ${word}`);
    press('?', body(s), { shiftKey: true });
    assert.equal(all(s.area, '[role="dialog"]').length, 0);
  });

  test('the listener leaves with the screen', async () => {
    const s = await mountWith(wallOf([blocked('c1')]));
    press('j', body(s));
    assert.ok(documentoFalso.activeElement, 'control: the key works while the screen is there');
    documentoFalso.activeElement = null;
    s.unmount();
    stop = () => s.leave.abort();
    press('j', body(s));
    assert.equal(documentoFalso.activeElement, null);
  });
});

describe('issue 758: the style', () => {
  const sheet = readFileSync(`${UI_FOLDER}wall.css`, 'utf8');
  const plain = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector: string) => [...plain.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.trim() === selector).map((m) => m[2]!).join(';');

  test('the hover of a row is --bg and has no shadow', () => {
    assert.match(rule('.wall-row:hover'), /background:\s*var\(--bg\)/);
    assert.doesNotMatch(rule('.wall-row:hover'), /shadow/);
  });

  test('every animation of the wall lives inside prefers-reduced-motion: no-preference, and the skeleton has none', () => {
    const outside = plain.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    assert.doesNotMatch(outside, /animation\s*:/, 'no animation outside the no-preference block');
    assert.doesNotMatch(outside, /transition\s*:/, 'no transition outside the no-preference block');
    assert.match(plain, /@media \(prefers-reduced-motion: no-preference\)/);
    for (const selector of ['.wall-skel', '.wall-skel-card', '.wall-skel-row']) assert.ok(rule(selector), `${selector} is styled`);
    assert.doesNotMatch(['.wall-skel', '.wall-skel-card', '.wall-skel-row'].map(rule).join(';'), /animation/);
  });

  test('the notice and the error band take their values from tokens: no hex, no literal colour', () => {
    for (const selector of ['.wall-notices', '.wall-notice', '.wall-error-band', '.wall-moved']) {
      const body = rule(selector);
      assert.ok(body, `${selector} is styled`);
      assert.doesNotMatch(body, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, selector);
    }
    assert.match(rule('.wall-notices'), /position:\s*fixed/);
  });
});
