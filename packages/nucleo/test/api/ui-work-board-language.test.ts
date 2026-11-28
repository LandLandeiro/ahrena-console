// #763: the work board, the Kanban and the Feed in the new language (ADR-0028, ux-review A7 and A8).
// - A8: no flat orange button on a card of the board: "Planejar" is outlined, the dark primary lives only in the pop-up.
// - A7: the state is an icon and its label from state-labels.js (never a coloured pill), one `.seg` for the three screens,
//   and the radius of cards and controls comes from the tokens, not from 12, 9 or 7 px written on the spot.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { ElementoFalso, instalarDomFalso, texto } from './fake-dom.ts';
// @ts-expect-error: browser module, plain JavaScript
import { cardPlanParts, planConfirm } from '../../ui/screens/work-board-plan.js';
// @ts-expect-error: browser module, plain JavaScript
import { cardRunParts } from '../../ui/screens/work-board-run.js';
// @ts-expect-error: browser module, plain JavaScript
import { queueParts } from '../../ui/screens/work-board-queue.js';
// @ts-expect-error: browser module, plain JavaScript
import { levelSwitch, workCard } from '../../ui/screens/work-board-parts.js';
// @ts-expect-error: browser module, plain JavaScript
import { mount as mountKanban } from '../../ui/screens/kanban.js';
// @ts-expect-error: browser module, plain JavaScript
import { mount as mountFeed } from '../../ui/screens/feed.js';

instalarDomFalso();

const REPO = 'example-org/example-repo';
const NOW = new Date(2026, 10, 28, 10, 0, 0).getTime();
const HOUR = 3_600_000;
type Obj = Record<string, any>;

function card(n: number, over: Obj = {}): Obj {
  return {
    key: `${REPO}#${n}`, repo: REPO, number: n, title: `Issue ${n}`, url: `https://github.com/${REPO}/issues/${n}`, level: 'item', type: 'story', typeName: 'User Story',
    state: 'open', column: 'planning', columnSince: new Date(NOW - 3 * HOUR).toISOString(), parent: null, chain: [], projectStatus: { id: 'todo', name: 'Todo' }, labels: [], milestone: null,
    plan: null, planning: null, execution: null, sessions: { count: 0, state: null, ids: [] }, pullRequest: null, blocked: null, queuePosition: null, doneAt: null, doneBy: null, children: null, ...over,
  };
}
const all = (root: ElementoFalso, selector: string) => root.querySelectorAll(selector);
const css = (file: string) => readFileSync(`${UI_FOLDER}${file}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const classesOf = (node: ElementoFalso) => (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

describe('#763/A8 no flat orange button on the cards of the board', () => {
  test('"Planejar" on the card is outlined, never filled', () => {
    const parts = cardPlanParts(card(501));
    const button = parts.actions.querySelector('[data-action="plan"]')!;
    assert.deepEqual(['outline', 'sm'].filter((c) => !classesOf(button).includes(c)), [], 'outline sm');
    assert.ok(!classesOf(button).includes('filled'), 'not filled');
  });

  test('"Executar plano" and the queue "Tentar de novo" on a card are outlined too', () => {
    const planned = card(502, { plan: { steps: 4 } });
    const run = cardRunParts(planned).actions.querySelector('[data-action="run"]')!;
    assert.ok(classesOf(run).includes('outline') && !classesOf(run).includes('filled'), 'Executar plano');
    const queued = card(503, { column: 'queued', plan: { steps: 4 }, queuePosition: 1 });
    const stopped = queueParts({ badge: null, note: null, actions: null }, queued, { queued: true, stoppedReason: 'A fila parou' });
    const retry = stopped.actions.querySelector('[data-action="queue-retry"]')!;
    assert.ok(classesOf(retry).includes('outline') && !classesOf(retry).includes('filled'), 'Tentar de novo');
  });

  test('no card file draws a filled button; the dark primary is the confirmation of the pop-up', () => {
    for (const file of ['work-board-plan.js', 'work-board-run.js', 'work-board-queue.js']) assert.doesNotMatch(readFileSync(`${UI_FOLDER}screens/${file}`, 'utf8'), /btn filled/, file);
    const popup = planConfirm({ repo: REPO, number: 504 });
    const confirm = popup.querySelector('[data-action="confirm"]') ?? all(popup, 'button').at(-1)!;
    assert.ok(classesOf(confirm).includes('primary'), 'the confirmation is the dark primary');
  });
});

describe('#763/A7 the state of a board card is an icon and a label from state-labels.js', () => {
  const running = card(510, { column: 'running', sessions: { count: 1, state: 'working', ids: ['s1'] } });
  const needs = card(511, { column: 'blocked', sessions: { count: 1, state: 'needs-you', ids: ['s2'] }, blocked: { reason: 'needs-you' } });
  const review = card(512, { column: 'review', pullRequest: { number: 512, url: 'https://example.test/pr/512', ci: 'failed', review: 'approved' } });

  test('the session, the CI and the review draw a state tag, not a `wb-pill`', () => {
    const node = workCard(running, { primaryRepo: REPO, now: NOW });
    const session = node.querySelector('.wb-session')!;
    assert.equal(all(session, '.state-tag').length, 1);
    assert.equal(all(session, '.state-tag')[0]!.getAttribute('data-state-kind'), 'working');
    assert.equal(texto(session), 'Trabalhando');
    assert.equal(all(workCard(needs, { primaryRepo: REPO, now: NOW }), '.wb-session .state-tag')[0]!.getAttribute('data-state-kind'), 'needs');
    const r = workCard(review, { primaryRepo: REPO, now: NOW });
    assert.equal(all(r, '.wb-ci .state-tag')[0]!.getAttribute('data-state-kind'), 'error');
    assert.equal(all(r, '.wb-review .state-tag')[0]!.getAttribute('data-state-kind'), 'completed');
    for (const n of [node, r]) assert.equal(all(n, '[class*="wb-pill"]').length, 0, 'no pill');
  });

  test('"planejando…" is a state tag too', () => {
    const planning = cardPlanParts(card(513, { planning: { state: 'running' } })).badge!;
    assert.equal(all(planning, '.state-tag').length, 1);
    assert.equal(texto(planning), 'planejando…');
  });

  test('the Kanban, the Quadro and the Feed stop drawing the pill classes', () => {
    for (const file of ['screens/kanban.js', 'screens/feed.js', 'screens/work-board-parts.js', 'screens/work-board-plan.js', 'screens/work-board-run.js', 'screens/work-board-issue-panel.js']) {
      assert.doesNotMatch(readFileSync(`${UI_FOLDER}${file}`, 'utf8'), /kb-badge-st|attentionPill|attentionBadges|wb-pill|class: `badge b-/, file);
    }
    for (const file of ['kanban.css', 'feed.css', 'work-board.css', 'work-board-issue-panel.css']) assert.doesNotMatch(css(file), /\.kb-badge-st|\.kb-b-|\.wb-pill|\.badge\b|\.b-(active|waiting|completed|error|abandoned)\b/, file);
  });
});

describe('#763/A7 the Kanban and the Feed screens', () => {
  test('a Kanban card draws a state tag with the label of the map, no `.kb-badge-st`', async () => {
    Object.assign(globalThis, { location: { search: '', pathname: '/ui/kanban' }, history: { state: null, replaceState: () => {} } });
    const item = (id: string, extra: Obj) => ({ id, title: `Sessão ${id}`, status: 'active', reason: null, attention: null, lastPrompt: null, lastActivity: '2026-10-20T12:00:00Z', start: '2026-10-20T11:00:00Z', running: true, durationMs: 60_000, agents: 1, model: 'Opus 5.5', costUsd: 1, cwd: '/x', account: null, ...extra });
    const board = {
      view: 'sessions', perPage: 10,
      columns: [
        { id: 'active', label: 'Trabalhando', total: 1, page: 1, hasMore: false, items: [item('a1', {})] },
        { id: 'blocked', label: 'Precisam de você', total: 2, page: 1, hasMore: false, items: [item('b1', { status: 'waiting', attention: { level: 'blocked', reason: 'permission' } }), item('e1', { status: 'error', attention: { level: 'blocked', reason: 'error' } })] },
        { id: 'idle', label: 'Em pausa', total: 1, page: 1, hasMore: false, items: [item('i1', { status: 'waiting', attention: { level: 'idle', reason: 'interrupted' } })] },
        { id: 'completed', label: 'Concluídas', total: 1, page: 1, hasMore: false, items: [item('c1', { status: 'completed' })] },
      ],
    };
    const area = new ElementoFalso('main');
    const abort = new AbortController();
    await mountKanban(area, { signal: abort.signal, read: async () => board, onChange: () => {}, onRestart: () => {}, title: () => {} });
    try {
      const cards = all(area, '.kb-kc');
      assert.equal(cards.length, 5);
      const kinds = cards.map((c) => [all(c, '.state-tag')[0]?.getAttribute('data-state-kind'), texto(all(c, '.state-tag')[0]!)]);
      assert.deepEqual(kinds, [['working', 'Trabalhando'], ['permission', 'Pede permissão'], ['error', 'Com erro'], ['paused', 'Em pausa'], ['completed', 'Concluída']]);
      assert.deepEqual(cards.map((c) => (c.querySelector('.kb-reason') ? texto(c.querySelector('.kb-reason')!) : null)), [null, null, null, 'Interrompida', null], 'a pause keeps its reason as plain text, not as a chip');
      assert.equal(all(area, '.kb-badge-st, .attention-pill, .attention-chip').length, 0, 'no pill, no chip');
      const toggle = area.querySelector('[aria-label="Visão do Kanban"]')!;
      assert.ok(classesOf(toggle).includes('seg') && !classesOf(toggle).includes('kb-seg'), 'the one `.seg`');
    } finally {
      abort.abort();
    }
  });

  test('a Feed row draws a state tag, no `.badge` and no attention pill', async () => {
    const ev = (id: string, extra: Obj) => ({ id, type: 'PreToolUse', tool: 'Bash', summary: `resumo ${id}`, status: 'active', attention: null, createdAt: new Date(NOW - 60_000).toISOString(), session: { id: `s-${id}`, title: 'Sessão', project: 'proj' }, agent: { id: 'a1', name: 'test-runner', type: 'main' }, machine: { id: 'local', label: 'local', kind: 'local' }, ...extra });
    const events = [ev('e1', {}), ev('e2', { status: 'waiting', attention: { level: 'blocked', reason: 'permission' } }), ev('e3', { status: 'waiting', attention: null }), ev('e4', { status: 'error' }), ev('e5', { status: 'completed' })];
    const area = new ElementoFalso('main');
    const abort = new AbortController();
    const ctx = { params: {}, signal: abort.signal, read: async () => ({ events, cursor: 'k1', older: null, options: null }), onChange: () => {}, onRestart: () => {}, liveState: () => 'live', counter: () => {}, titulo: () => {}, title: () => {}, navigate: () => {} };
    const stop = await mountFeed(area, ctx);
    try {
      const rows = all(area, '.feed-row');
      assert.equal(rows.length, 5);
      assert.deepEqual(rows.map((r) => all(r, '.state-tag')[0]?.getAttribute('data-state-kind')), ['working', 'permission', 'paused', 'error', 'completed']);
      assert.deepEqual(rows.map((r) => texto(all(r, '.state-tag')[0]!)), ['Trabalhando', 'Pede permissão', 'Em pausa', 'Com erro', 'Concluída']);
      assert.equal(all(area, '.badge, .attention-pill').length, 0);
    } finally {
      stop?.();
      abort.abort();
    }
  });
});

describe('#763/A7 one `.seg` and the radius tokens', () => {
  test('the level switch of the Quadro is a `.seg` that keeps its buttons', () => {
    const node = levelSwitch({ level: 'item', onLevelChange: () => {} });
    const group = classesOf(node).includes('seg') ? node : node.querySelector('.seg')!;
    assert.ok(group, 'a `.seg`');
    const buttons = all(group, 'button');
    assert.ok(buttons.length >= 2);
    assert.ok(buttons.every((b) => b.getAttribute('data-level') && b.hasAttribute('aria-pressed')));
    assert.equal(all(node, '.wb-levels, .wb-level').length, 0, 'the old segment classes are gone');
  });

  test('`.seg` is defined once, in the shell, with the tokens and the 24 px touch area of #764', () => {
    const shell = css('shell.css');
    assert.match(shell, /\.seg\s*\{[^}]*border-radius:\s*var\(--radius-segment\)/);
    assert.match(shell, /\.seg button\s*\{[^}]*border-radius:\s*var\(--radius-segment-item\)/);
    assert.match(shell, /\.seg button::after\s*\{[^}]*max\(100%, 24px\)/);
    assert.match(shell, /\.seg button:focus-visible/);
    for (const file of ['sessions.css', 'kanban.css', 'work-board.css', 'feed.css']) assert.doesNotMatch(css(file), /^\s*\.seg\b/m, `${file} does not redefine .seg`);
    for (const file of ['kanban.css', 'work-board.css']) assert.doesNotMatch(css(file), /\.kb-seg|\.wb-levels|\.wb-level\b(?!-)/, file);
  });

  test('the state column of a Feed row has a fixed basis but may shrink, so the "Sessão" button is not cut at 390 px', () => {
    const rule = /\.feed-state\s*\{([^}]*)\}/.exec(css('feed.css'))?.[1] ?? '';
    assert.doesNotMatch(rule, /flex:\s*none/);
    assert.match(rule, /flex:\s*0 1 150px/);
    assert.match(rule, /min-width:\s*0/);
  });

  test('the CSS of the three screens writes no radius by hand: tokens, or 50% for a dot', () => {
    for (const file of ['kanban.css', 'feed.css', 'work-board.css', 'work-board-issue-panel.css']) {
      const radii = [...css(file).matchAll(/border-radius:\s*([^;}]+)/g)].map((m) => m[1]!.trim());
      assert.deepEqual(radii.filter((r) => !/^var\(--radius-[a-z-]+\)$/.test(r) && r !== '50%'), [], file);
    }
  });
});
