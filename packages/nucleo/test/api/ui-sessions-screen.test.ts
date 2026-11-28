// Issue 759: the Sessões screen in the new language (ADR-0028). The columns Sessão, Estado, Máquina, Duração and
// Atualizada, the state tag in place of the pill, the filters in the one `.seg` with their counts, the neutral duration
// of a paused session, the session name as the title with folder and id as the secondary line, and one line per session
// below 860 px. Mounted in the fake DOM against a stubbed core; synthetic data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { ElementoFalso, documentoFalso, instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();

const page = { pathname: '/ui/sessions', search: '', hash: '' };
const setUrl = (url: string) => {
  const u = new URL(url, 'http://127.0.0.1');
  Object.assign(page, { pathname: u.pathname, search: u.search, hash: u.hash });
};
Object.assign(globalThis, {
  location: page,
  history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => setUrl(url), pushState: (_s: unknown, _t: string, url: string) => setUrl(url) },
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  getComputedStyle: () => ({ getPropertyValue: () => '', paddingBottom: '0' }),
});

// @ts-expect-error: browser module, plain JavaScript
const sessions = await import('../../ui/screens/sessions.js');
// @ts-expect-error: idem
const labels = await import('../../ui/state-labels.js');

const all = (root: ElementoFalso, sel: string) => root.querySelectorAll(sel);
const one = (root: ElementoFalso, sel: string) => root.querySelector(sel);
const until = async (cond: () => boolean, what = 'the condition', ms = 2000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};
const css = (file: string) => readFileSync(`${UI_FOLDER}${file}`, 'utf8');

const LOCAL = { id: 'local', label: 'Esta máquina' };
const WS = { id: 'ws', label: 'Workstation' };
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  identity: { provider: 'claude', profileId: null, machineId: null, environmentId: null, providerSessionId: id },
  title: `Sessão ${id}`,
  status: 'active',
  attention: null,
  lastActivity: '2026-10-22T22:00:00Z',
  running: false,
  durationMs: 12 * 60_000,
  agents: 1,
  costUsd: 1,
  cwd: '/simulacao/motor-de-regras',
  account: null,
  open: { target: 'none', command: null },
  machine: LOCAL,
  ...extra,
});
const ID = 'b91d04aa-0000-4000-8000-000000000001';
const items = [
  row(ID, { title: 'Migrar a fila de cobranças', status: 'waiting', attention: { level: 'blocked', reason: 'question' }, machine: WS }),
  row('s2', { title: 'Explorar o cache', status: 'waiting', attention: { level: 'idle', reason: 'turn_ended' }, running: true, durationMs: 47 * 60_000 }),
  row('s3', { title: 'Testes do leitor', status: 'active', running: true }),
  row('s4', { title: 'Atualizar as dependências', status: 'completed' }),
];
const list = {
  total: 4,
  registered: 4,
  page: 1,
  perPage: 10,
  pages: 1,
  directories: ['/simulacao/motor-de-regras'],
  counts: { all: 4, active: 1, blocked: 1, idle: 1, completed: 1, error: 0, abandoned: 0 },
  items,
  machines: [
    { id: 'local', label: 'Esta máquina', state: 'connected', reason: null, lastReadAt: '2026-10-22T23:00:00Z' },
    { id: 'ws', label: 'Workstation', state: 'connected', reason: null, lastReadAt: '2026-10-22T23:00:00Z' },
  ],
};

async function draw(body: unknown = list, mode = 'dev') {
  setUrl('/ui/sessions');
  labels.setStateLabelMode(mode);
  if (!documentoFalso.querySelector('link[data-screen="sessions"]')) {
    const sheet = new ElementoFalso('link');
    sheet.setAttribute('data-screen', 'sessions');
    Object.assign(sheet, { loaded: Promise.resolve() });
    documentoFalso.head.append(sheet);
  }
  const leave = new AbortController();
  const ctx = {
    params: {},
    signal: leave.signal,
    read: async (route: string) => structuredClone(route.endsWith('/messaging') ? { available: false, reason: 'no_live_process' } : body),
    write: async () => ({}),
    onChange: () => {},
    onRestart: () => {},
    liveState: () => 'live',
    counter: () => {},
    title: () => {},
    navigate: () => {},
  };
  const area = new ElementoFalso('main');
  const stop = await sessions.mount(area, ctx);
  await until(() => all(area, 'tr.session-row').length === items.length, 'the rows');
  return { area, done: () => (stop?.(), leave.abort()) };
}

describe('Sessões: the filters in the one .seg (issue 759)', () => {
  test('Todas, Precisam de você, Trabalhando, Em pausa, Concluídas and Com erro, each up to 28 characters and 4 words', () => {
    assert.deepEqual(
      sessions.PILLS.map(([v, label]: [string, string]) => `${v}:${label}`),
      ['all:Todas', 'active:Trabalhando', 'blocked:Precisam de você', 'idle:Em pausa', 'completed:Concluídas', 'error:Com erro'],
    );
    for (const mode of ['dev', 'project']) {
      labels.setStateLabelMode(mode);
      for (const [, label] of sessions.PILLS) assert.ok(label.length <= 28 && label.split(/\s+/).length <= 4, `${mode}: ${label}`);
    }
    labels.setStateLabelMode('dev');
  });

  test('the query parameters stay the ones the screen already used: status, search, dir, order, direction, page', () => {
    assert.equal(sessions.listRoute({ status: 'blocked', search: 'x', dir: '/a', order: 'cost', direction: 'asc', page: 2 }, 12), '/api/sessions?status=blocked&order=cost&direction=asc&page=2&perPage=12&search=x&dir=%2Fa');
    assert.equal(sessions.stateFromQuery('?status=waiting').status, 'blocked');
    assert.equal(sessions.stateFromQuery('?status=abandoned').status, 'abandoned', 'an old bookmark still filters');
    assert.equal(sessions.queryFromState({ ...sessions.stateFromQuery(''), status: 'idle' }), '?status=idle');
  });

  test('each filter says its count after the label ("Precisam de você 1") and the pressed one is marked', async () => {
    const { area, done } = await draw();
    try {
      const seg = one(area, '.seg')!;
      const buttons = all(seg, 'button');
      assert.deepEqual(buttons.map((b) => texto(b)), ['Todas 4', 'Trabalhando 1', 'Precisam de você 1', 'Em pausa 1', 'Concluídas 1', 'Com erro 0']);
      assert.equal(one(seg, 'button[aria-pressed="true"]')!.getAttribute('data-status'), 'all');
    } finally {
      done();
    }
  });

  test('a filter without a count from the core says only its label', async () => {
    const { area, done } = await draw({ ...list, counts: {} });
    try {
      assert.deepEqual(all(one(area, '.seg')!, 'button').map((b) => texto(b)), ['Todas', 'Trabalhando', 'Precisam de você', 'Em pausa', 'Concluídas', 'Com erro']);
    } finally {
      done();
    }
  });
});

describe('Sessões: the table in the new language (issue 759)', () => {
  test('the columns are Sessão, Estado, Máquina, Duração and Atualizada; Quem, Agentes, Custo and Diretório are gone', async () => {
    const { area, done } = await draw();
    try {
      const heads = all(area, 'th').map((th) => texto(th));
      assert.deepEqual(heads.slice(0, 5), ['Sessão', 'Estado', 'Máquina', 'Duração', 'Atualizada']);
      for (const gone of ['Quem', 'Agentes', 'Custo', 'Diretório', 'Status', 'Última atividade']) assert.ok(!heads.includes(gone), gone);
      assert.equal(all(area, 'tr.session-row')[0]!.querySelectorAll('td').length, heads.length, 'a cell for each header');
    } finally {
      done();
    }
  });

  test('the session cell: the monogram, the session name as the link, and folder, short id as the secondary line', async () => {
    const { area, done } = await draw();
    try {
      const first = all(area, 'tr.session-row')[0]!;
      const cell = one(first, 'td.nm')!;
      assert.ok(one(cell, '.agent-monogram'), 'the monogram');
      assert.equal(texto(one(cell, '.agent-monogram')), 'C');
      assert.equal(texto(one(cell, 'a')), 'Migrar a fila de cobranças');
      assert.equal(one(cell, 'a')!.getAttribute('href'), `/ui/sessions/${ID}?machine=ws`);
      const meta = texto(one(cell, '.sessions-meta'));
      assert.match(meta, /motor-de-regras/);
      assert.match(meta, /b91d04aa/);
      assert.doesNotMatch(meta, /\/simulacao/, 'the folder is its last part');
      assert.equal(all(cell, '.badge').length, 0);
    } finally {
      done();
    }
  });

  test('the state cell is the Mural tag, icon and words, with no coloured pill', async () => {
    const { area, done } = await draw();
    try {
      const rows = all(area, 'tr.session-row');
      assert.deepEqual(rows.map((r) => texto(one(r, 'td.st .state-tag-label'))), ['Pergunta', 'Em pausa', 'Trabalhando', 'Concluída']);
      assert.deepEqual(rows.map((r) => one(r, 'td.st .state-tag')!.getAttribute('data-state-kind')), ['needs', 'paused', 'working', 'completed']);
      assert.ok(rows.every((r) => all(r, '.badge, .attention-pill, .attention-chip').length === 0), 'no pill, no chip');
      assert.match(texto(one(rows[1]!, 'td.nm .sessions-meta')), /Sua vez/, 'the reason of a pause is on the secondary line');
    } finally {
      done();
    }
  });

  test('the state words follow the mode: Projeto says its own', async () => {
    const { area, done } = await draw(list, 'project');
    try {
      assert.equal(texto(one(all(area, 'tr.session-row')[0]!, 'td.st .state-tag-label')), 'Esperando sua resposta');
    } finally {
      labels.setStateLabelMode('dev');
      done();
    }
  });

  test('the machine cell names where it runs; Duração and Atualizada follow', async () => {
    const { area, done } = await draw();
    try {
      const rows = all(area, 'tr.session-row');
      assert.equal(texto(one(rows[0]!, 'td.mach')), 'Workstation');
      assert.equal(texto(one(rows[1]!, 'td.mach')), 'Esta máquina');
      assert.equal(texto(one(rows[3]!, 'td.dur')), '12 min');
      assert.match(texto(one(rows[3]!, 'td.when')), /^há \d+ d$/);
    } finally {
      done();
    }
  });

  test('M9: a paused session with "rodando · 47 min" is neutral text, nothing orange', async () => {
    const { area, done } = await draw();
    try {
      const paused = one(all(area, 'tr.session-row')[1]!, 'td.dur')!;
      assert.equal(texto(paused), 'rodando · 47 min');
      assert.equal(all(paused, '.c-active').length, 0);
      assert.doesNotMatch(css('sessions.css'), /c-active|status-active-text|status-waiting/, 'the sheet paints nothing with the state colours');
    } finally {
      done();
    }
  });

  test('the Mensagem and the open icon keep their cells, with their headers only for the reader', async () => {
    const { area, done } = await draw();
    try {
      const r = all(area, 'tr.session-row')[0]!;
      assert.ok(one(r, 'td.msg') && one(r, 'td.sessions-open'));
      const hidden = all(area, 'th.cc-sr-only, th .cc-sr-only').map((t) => texto(t));
      assert.deepEqual(hidden, ['Mensagem', 'Abrir']);
    } finally {
      done();
    }
  });
});

describe('Sessões: the sheet (issue 759)', () => {
  const sheet = () => css('sessions.css').replace(/\/\*[\s\S]*?\*\//g, '');

  test('the status pill is gone from the sheet, and the radii are the tokens', () => {
    assert.doesNotMatch(sheet(), /\.badge|\.b-(active|waiting|completed|error|abandoned)|\.reason\b/);
    assert.doesNotMatch(sheet(), /border-radius:\s*\d/, 'a radius is a token');
  });

  test('M15: below 860 px each session is one line, not a table row', () => {
    const block = /@media \(max-width: 859\.98px\)\s*\{([\s\S]*?)\n\}/.exec(sheet());
    assert.ok(block, 'a rule for the window under 860 px');
    assert.match(block![1]!, /\.session-row\s*\{[^}]*display:\s*grid/);
    assert.match(block![1]!, /thead/, 'the header leaves the layout');
  });

  test('the filters keep the 24 px touch target of the one .seg and the sheet does not redefine it', () => {
    assert.doesNotMatch(sheet(), /^\s*\.seg\b/m);
    assert.match(css('shell.css'), /\.seg button::after \{[^}]*max\(100%, 24px\)/);
  });
});
