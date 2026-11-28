// Issue 759: the session Detail in the new language (ADR-0028). The header in two lines (the state tag, the machine and
// the start on the first; the title on the second; the actions beside the first, M10), the question card with its primary
// button and the focus on it (A2 b and c, A5), the screen opening at the top with only the conversation list sticking to
// its end (A5), the plan with one icon per step and the usage numbers beside the conversation, the tabs underlined with
// their counts, and the "Configuração em vigor" link that no longer looks like a primary button (M11).
// Mounted in the fake DOM against a stubbed core; synthetic data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { ElementoFalso, documentoFalso, instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();
const page = { pathname: '/ui/sessions/c3f09b52-4e10', search: '', hash: '' };
Object.assign(globalThis, { location: page, history: { state: null, replaceState: () => {}, pushState: () => {} } });

// @ts-expect-error: browser module, plain JavaScript
const detail = await import('../../ui/screens/session-detail.js');

const SID = 'c3f09b52-4e10';
const BASE = `/api/sessions/${SID}`;
const nowIso = () => new Date().toISOString();
const css = readFileSync(`${UI_FOLDER}/screens/session-detail.css`, 'utf8');

type Extra = Record<string, unknown>;
const head = (session: Extra = {}, extra: Extra = {}) => ({
  session: { id: `${SID}-0000-0000`, title: 'Testes do leitor de faturas', status: 'active', attention: null, model: 'claude-sonnet-5-5', startedAt: nowIso(), since: nowIso(), cwd: '/simulacao/faturas', banner: null, identity: null, ...session },
  endedAt: null, cost: { usd: 1.1 }, branch: 'test/405-parser', machine: null, open: { target: 'desktop', command: null }, counts: { agents: 1, events: 2 }, ...extra,
});
const plan = (done: number, total: number) => ({
  total, done, current: 'Planejar a mudança',
  steps: Array.from({ length: total }, (_, i) => ({ text: `Passo ${i + 1}`, activeText: `Fazendo o passo ${i + 1}`, state: i < done ? 'completed' : i === done ? 'in_progress' : 'pending' })),
});
const agentsBody = (tasks: unknown) => ({
  numbers: { events: 2, perMinute: 1, tools: 0, uniqueTools: 0, subagents: 0, compactions: 0, errors: 0, durationMin: 3, running: true },
  tools: [], tasks, tokens: null, agents: [{ id: 'main', type: 'main', name: 'Agente principal', status: 'active', start: nowIso(), end: null, model: 'claude-sonnet-5-5', turns: 2, costUsd: 1.1 }],
});
const you = (id: string, text: string) => ({ id, role: 'you', at: nowIso(), text, model: null, tokens: null, tools: [] });
const bot = (id: string, text: string) => ({ id, role: 'assistant', at: nowIso(), text, model: 'claude-sonnet-5-5', tokens: { input: 1, output: 1 }, tools: [] });

function harness(headBody: unknown, { tasks = plan(2, 5), agentsFail = false }: { tasks?: unknown; agentsFail?: boolean } = {}) {
  const leave = new AbortController();
  const handlers: ((c: unknown[]) => void)[] = [];
  const deltas: unknown[] = [];
  const read = async (route: string) => {
    if (route === BASE) return headBody;
    if (route === `${BASE}/agents`) {
      if (agentsFail) throw Object.assign(new Error('fora do ar'), { name: 'ReadError', status: 500 });
      return agentsBody(tasks);
    }
    if (route.startsWith(`${BASE}/conversation`)) {
      if (route.includes('after=')) return deltas.shift() ?? { messages: [], cursor: 'k9' };
      return { agents: [{ id: 'main', name: 'principal' }], agent: 'main', total: 2, messages: [you('m1', 'Quero testes do leitor'), bot('m2', 'Entendi, sigo o plano')], cursor: 'k0' };
    }
    if (route.includes('/messaging')) return { available: true, reason: null, processes: 1, remoteControl: true, accountId: null };
    if (route.includes('/transcription')) return {};
    throw Object.assign(new Error(`rota não servida: ${route}`), { name: 'ReadError' });
  };
  const ctx = { params: { id: SID }, signal: leave.signal, read, write: async () => ({}), navigate: () => {}, counter: () => {}, title: () => {}, onChange: (f: (c: unknown[]) => void) => handlers.push(f), onRestart: () => {}, liveState: () => 'live' };
  return { ctx, leave, deltas, fire: () => handlers.forEach((f) => f([{ type: 'activity', key: SID, sessionId: SID, seq: 1 }])) };
}
const frame = () => {
  const column = new ElementoFalso('div');
  column.setAttribute('class', 'cc-main');
  column.scrollHeight = 1000;
  column.clientHeight = 500;
  const area = new ElementoFalso('main');
  column.append(area);
  return { column, area };
};
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, what = 'the condition', ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await tick(5);
  }
};
async function open(headBody: unknown, options: Parameters<typeof harness>[1] = {}, hash = '') {
  Object.assign(page, { hash });
  const h = harness(headBody, options);
  const { column, area } = frame();
  const stop = await detail.mount(area, h.ctx);
  await until(() => area.querySelector('.sd-tab') !== null, 'the tabs');
  await tick(40);
  return { h, column, area, stop };
}
const blocked = (extra: Extra = {}) => head({ status: 'waiting', attention: { level: 'blocked', reason: 'permission' }, banner: { type: 'permission', text: 'Bash pede permissão para rodar npm run migrate', since: nowIso() }, ...extra });

describe('The header in two lines (#759, M10)', () => {
  afterEach(() => (documentoFalso.activeElement = null));

  test('line one: the state tag with the plan, the machine and the start; line two: the title; the actions beside line one', async () => {
    const { h, area } = await open(head());
    try {
      const top = area.querySelector('.sd-top')!;
      const meta = top.querySelector('.sd-meta')!;
      const tag = meta.querySelector('.state-tag')!;
      assert.equal(tag.getAttribute('data-state-kind'), 'working');
      assert.match(texto(meta), /Trabalhando\s*2 de 5/, 'the label of the state and the plan fraction the screen reads today');
      assert.match(texto(meta), /Esta máquina/);
      assert.match(texto(meta), /começou/);
      assert.equal(top.querySelector('h1')!.parentNode!.getAttribute('class')?.includes('sd-meta'), false, 'the title is not on the meta line');
      assert.ok(top.querySelector('.sd-head-row')!.querySelector('.sd-actions .open-action'), 'the open action is in the actions, beside the meta line');
      assert.ok(top.querySelector('.sd-head-row')!.querySelector('.sd-meta'), 'on the same row as the meta line');
      assert.equal(top.querySelector('h1')!.closest('.sd-head-row'), null, 'and the title is under that row');
      assert.equal(top.querySelector('.sd-status'), null, 'no colored pill');
      assert.equal(top.querySelector('.attention-pill'), null);
    } finally {
      h.leave.abort();
    }
  });

  test('without a plan nothing says "de": the fraction only exists when the screen reads it', async () => {
    const { h, area } = await open(head(), { agentsFail: true });
    try {
      const meta = area.querySelector('.sd-meta')!;
      assert.match(texto(meta), /Trabalhando/);
      assert.doesNotMatch(texto(meta), /\d de \d/);
    } finally {
      h.leave.abort();
    }
  });

  test('a remote session names its machine', async () => {
    const { h, area } = await open(head({}, { machine: { id: 'ws', label: 'Workstation' } }));
    try {
      assert.match(texto(area.querySelector('.sd-meta')), /Workstation/);
    } finally {
      h.leave.abort();
    }
  });

  test('under 640 px the state and the button do not share a line: the CSS stacks the row', () => {
    const block = /@media \(max-width: 640px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    assert.match(block, /\.sd-head-row\s*\{[^}]*flex-direction:\s*column/);
    assert.match(css, /\.sd-meta\s*\{[^}]*flex-wrap:\s*wrap/);
    assert.match(css, /\.sd-meta\s*\{[^}]*min-width:\s*0/);
  });

  test('M11: "Configuração em vigor" is a quiet link of the meta line, not a button', async () => {
    const { h, area } = await open(head());
    try {
      const link = area.querySelector('.sd-config')!;
      assert.ok(link, 'the link is there');
      assert.equal(texto(link), 'Configuração em vigor');
      assert.ok(link.closest('.sd-meta'));
      const classes = link.getAttribute('class') ?? '';
      assert.doesNotMatch(classes, /\bbtn\b|primary|outline|filled/);
    } finally {
      h.leave.abort();
    }
  });
});

describe('The question card and the opening at the top (#759, A2 b and c, A5, M5)', () => {
  afterEach(() => (documentoFalso.activeElement = null));

  test('a session that needs you shows the card above the conversation with a dark primary button, and the focus goes to it', async () => {
    const { h, area, column } = await open(blocked());
    try {
      const card = area.querySelector('.sd-band')!;
      assert.ok(card, 'the card');
      const button = card.querySelector('button.btn.primary')!;
      assert.equal(texto(button), 'Responder');
      assert.equal(card.querySelectorAll('.open-action').length, 0, 'the one open action stays in the header');
      assert.doesNotMatch(button.getAttribute('class') ?? '', /filled/, 'the dark primary of the system, never the flat orange');
      assert.equal(documentoFalso.activeElement, button, 'the focus is on the button of the card');
      assert.equal(column.scrollTop, 0, 'the screen opens at the top');
      const order = [...area.querySelectorAll('.sd-top, .sd-tabs, .sd-body')].map((n) => n.getAttribute('class')?.split(' ')[0]);
      assert.deepEqual(order, ['sd-top', 'sd-tabs', 'sd-body'], 'header and card first, the conversation after');
      assert.ok(area.querySelector('.sd-top')!.querySelector('.sd-band'), 'the card is in the top, before the tabs');
    } finally {
      h.leave.abort();
    }
  });

  test('"Responder" takes the person to the reply field, on the Conversa tab', async () => {
    const { h, area } = await open(blocked(), {}, '#agents');
    try {
      area.querySelector('.sd-band')!.querySelector('button.btn.primary')!.click();
      await until(() => area.querySelector('.sd-tab[data-tab="conversation"]')?.getAttribute('aria-selected') === 'true', 'the Conversa tab');
      await until(() => documentoFalso.activeElement === area.querySelector('textarea'), 'the focus in the field');
    } finally {
      h.leave.abort();
    }
  });

  test('"Sua vez" (a paused session) has the same button and it leads to the field; no focus is taken when nothing is blocked', async () => {
    const { h, area } = await open(head({ status: 'waiting', attention: { level: 'idle', reason: 'turn_ended' } }));
    try {
      const idle = area.querySelector('.sd-idle')!;
      const button = idle.querySelector('button.btn.primary')!;
      assert.equal(texto(button), 'Responder');
      assert.notEqual(documentoFalso.activeElement, button, 'a paused session does not pull the focus');
      button.click();
      await until(() => documentoFalso.activeElement === area.querySelector('textarea'), 'the focus in the field');
    } finally {
      h.leave.abort();
    }
  });

  test('the address `#responder` opens the Conversa with the field focused', async () => {
    const { h, area } = await open(head(), {}, '#responder');
    try {
      assert.equal(area.querySelector('.sd-tab[data-tab="conversation"]')!.getAttribute('aria-selected'), 'true');
      await until(() => documentoFalso.activeElement === area.querySelector('textarea'), 'the focus in the field');
    } finally {
      h.leave.abort();
    }
  });

  test('a healthy session opens at the top on Conversa, with no focus taken', async () => {
    const { h, area, column } = await open(head());
    try {
      assert.equal(area.querySelector('.sd-tab[data-tab="conversation"]')!.getAttribute('aria-selected'), 'true');
      assert.equal(column.scrollTop, 0);
      assert.equal(documentoFalso.activeElement, null);
    } finally {
      h.leave.abort();
    }
  });

  test('only the conversation list sticks to the end: it scrolls by itself and the page column is left alone', async () => {
    const { h, area, column } = await open(head());
    try {
      const list = area.querySelector('.sd-messages')!;
      list.scrollHeight = 1000;
      list.clientHeight = 300;
      list.scrollTop = 700;
      list.dispatchEvent({ type: 'scroll' });
      h.deltas.push({ messages: [bot('m3', 'mais uma')], total: 3, cursor: 'k1' });
      h.fire();
      await until(() => area.querySelector('[data-mid="m3"]') !== null, 'the new message');
      assert.equal(list.scrollTop, list.scrollHeight, 'stuck to its own end');
      assert.equal(column.scrollTop, 0, 'the page did not move');
    } finally {
      h.leave.abort();
    }
  });

  test('the CSS gives the list its own scroll and the page keeps the header', () => {
    assert.match(css, /\.sd-messages\s*\{[^}]*overflow-y:\s*auto/);
    assert.match(css, /\.sd-messages\s*\{[^}]*max-height:/);
  });
});

describe('The plan and the usage numbers (#759)', () => {
  afterEach(() => (documentoFalso.activeElement = null));

  test('the plan lists every step with its icon: done, working, next; no state only by color', async () => {
    const { h, area } = await open(head());
    try {
      const card = area.querySelector('.sd-plan')!;
      assert.ok(card, 'the plan card');
      assert.match(texto(card.querySelector('header')), /Plano\s*2 de 5/);
      const items = card.querySelectorAll('li');
      assert.equal(items.length, 5);
      const kinds = items.map((li) => li.querySelector('.state-icon')?.getAttribute('class')?.match(/state-icon-(\w+)/)?.[1]);
      assert.deepEqual(kinds, ['completed', 'completed', 'working', 'queued', 'queued']);
      for (const li of items) assert.ok(li.querySelector('.cc-sr-only'), 'the state in words for a reader of the screen');
      assert.match(texto(items[2]), /Fazendo o passo 3/, 'the step in progress says what it is doing');
      assert.equal(items.filter((li) => li.getAttribute('aria-current') === 'step').length, 1);
    } finally {
      h.leave.abort();
    }
  });

  test('without a plan the card is not drawn', async () => {
    const { h, area } = await open(head(), { tasks: { total: 0, done: 0, current: null, steps: [] } });
    try {
      assert.equal(area.querySelector('.sd-plan'), null);
    } finally {
      h.leave.abort();
    }
  });

  test('the usage card: spent so far, the model and the branch, from what the screen reads today', async () => {
    const { h, area } = await open(head());
    try {
      const card = area.querySelector('.sd-usage')!;
      assert.ok(card);
      const text = texto(card);
      assert.match(text, /Gasto até agora\s*~US\$ 1,10/);
      assert.match(text, /Modelo\s*Sonnet 5/);
      assert.match(text, /Branch\s*test\/405-parser/);
      assert.doesNotMatch(text, /Uso da conversa/, 'no number of context use exists in the answers: nothing invented');
    } finally {
      h.leave.abort();
    }
  });

  test('a datum that is missing leaves its row out', async () => {
    const { h, area } = await open(head({ model: null }, { cost: null, branch: null }));
    try {
      assert.equal(area.querySelector('.sd-usage'), null, 'all three missing: no card');
    } finally {
      h.leave.abort();
    }
  });
});

describe('The tabs (#759, 0029)', () => {
  afterEach(() => (documentoFalso.activeElement = null));

  test('Conversa, Agentes with its count and Linha do tempo, in that order, with no icons and no parentheses', async () => {
    const { h, area } = await open(head({}, { counts: { agents: 3, events: 12 } }));
    try {
      const tabs = area.querySelectorAll('.sd-tab');
      assert.deepEqual(tabs.slice(0, 3).map((t) => t.getAttribute('data-tab')), ['conversation', 'agents', 'timeline']);
      assert.match(texto(tabs[0]!), /^Conversa$/);
      assert.match(texto(tabs[1]!), /^Agentes\s+3$/);
      assert.equal(tabs[1]!.querySelector('.sd-tab-count')!.textContent, '3');
      assert.match(texto(tabs[2]!), /^Linha do tempo\s+12$/);
      for (const t of tabs) {
        assert.equal(t.querySelector('svg'), null, 'no icon in a tab');
        assert.doesNotMatch(texto(t), /[()]/);
      }
    } finally {
      h.leave.abort();
    }
  });

  test('the CSS underlines the tab on the tokens: no pill fill, no raw radius anywhere in the sheet', () => {
    assert.match(css, /\.sd-tab\.on\s*\{[^}]*(border-bottom-color|box-shadow)[^}]*var\(--accent-line\)/);
    assert.doesNotMatch(/\.sd-tab(\.on)?\s*\{([^}]*)\}/.exec(css)?.[2] ?? '', /background:\s*var\(--(?!bg|surface)/);
    assert.deepEqual(css.match(/border-radius:\s*\d+px/g) ?? [], [], 'radii come from the --radius-* tokens');
  });
});
