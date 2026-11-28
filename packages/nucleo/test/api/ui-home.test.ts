// issue 759: the Início in the new language: the greeting, the sentence under it, three numbers, the bars by hour,
// the recent activity with the state icon instead of the pill, and a redraw that keeps the focus (M6).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { ElementoFalso, documentoFalso, instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();
Object.assign(globalThis, {
  location: { pathname: '/ui', search: '', hash: '' },
  history: { state: null, replaceState: () => {}, pushState: () => {} },
  ResizeObserver: class { observe() {} disconnect() {} },
  reportError: (e: unknown) => { throw e; },
});

// @ts-expect-error: browser module, plain JavaScript
const home = await import('../../ui/home-today.js');
// @ts-expect-error: browser module, plain JavaScript
const dashboard = await import('../../ui/screens/dashboard.js');
// @ts-expect-error: browser module, plain JavaScript
const { resetMachineChoice } = await import('../../ui/machine-filter.js');

const at = (h: number, m = 0, day = 28) => new Date(2026, 10, day, h, m, 0).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const session = (id: string, start: number, last: number, status = 'completed', attention: unknown = null) => ({ id, status, attention, start: iso(start), lastActivity: iso(last), running: status === 'active' });
// The shape `GET /api/sessions` answers: the rows are `items` (the Sessões reads `list.items` too).
const page = (rows: unknown[], total = rows.length) => ({ total, items: rows });
const NOW = at(16, 20);

describe('issue 759: the greeting', () => {
  test('by the hour of the person: Bom dia, Boa tarde, Boa noite', () => {
    assert.equal(home.greeting(at(5)), 'Bom dia');
    assert.equal(home.greeting(at(11, 59)), 'Bom dia');
    assert.equal(home.greeting(at(12)), 'Boa tarde');
    assert.equal(home.greeting(at(17, 59)), 'Boa tarde');
    assert.equal(home.greeting(at(18)), 'Boa noite');
    assert.equal(home.greeting(at(2)), 'Boa noite');
  });
});

describe('issue 759: what the sessions of the day say', () => {
  const rows = [
    session('a', at(8, 10), at(9, 40), 'completed'),
    session('b', at(8, 30), at(10, 5), 'completed'),
    session('c', at(14, 0), NOW, 'active'),
    session('d', at(15, 0), at(16, 10), 'waiting', { level: 'blocked', reason: 'permission' }),
    session('e', at(15, 30), at(16, 0), 'waiting', { level: 'idle', reason: 'turn_ended' }),
    session('y1', at(10, 0, 27), at(11, 0, 27), 'completed'),
    session('y2', at(12, 0, 27), at(13, 0, 27), 'completed'),
  ];
  const figures = home.todayFigures(page(rows), NOW);

  test('counts today, yesterday and the completed ones of today', () => {
    assert.deepEqual([figures.today, figures.yesterday, figures.completed], [5, 2, 2]);
  });

  test('a page that stops before the start of the day says nothing instead of a short number', () => {
    const cut = home.todayFigures(page(rows.slice(0, 4), 40), NOW);
    assert.deepEqual([cut.today, cut.yesterday, cut.completed], [null, null, null]);
    assert.deepEqual(cut.hours, []);
  });

  test('a page that reaches back before yesterday knows both days even when more exist', () => {
    const deep = home.todayFigures(page([...rows, session('old', at(9, 0, 20), at(9, 30, 20))], 60), NOW);
    assert.deepEqual([deep.today, deep.yesterday], [5, 2]);
  });

  test('what is not a page says nothing', () => {
    for (const bad of [null, undefined, {}, { available: true }, { items: 'x' }, { sessions: [] }]) {
      const f = home.todayFigures(bad, NOW);
      assert.deepEqual([f.today, f.yesterday, f.completed, f.hours], [null, null, null, []]);
    }
  });

  test('nine hours up to now, one bar per session open in that hour, the colour by state', () => {
    assert.deepEqual(figures.hours.map((h: { hour: number }) => h.hour), [8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const kinds = (h: number) => figures.hours.find((x: { hour: number }) => x.hour === h).bars.map((b: { kind: string }) => b.kind);
    assert.deepEqual(kinds(8), ['completed', 'completed']);
    assert.deepEqual(kinds(11), []);
    assert.deepEqual(kinds(15), ['blocked', 'active', 'paused'], 'the needs-you bar first, then the working one, then the paused one');
    assert.deepEqual(kinds(16), ['blocked', 'active']);
  });

  test('a bar has a height between a quarter and the whole hour', () => {
    for (const h of figures.hours) for (const b of h.bars) assert.ok(b.share >= 0.25 && b.share <= 1, `${h.hour}h ${b.kind} ${b.share}`);
  });
});

describe('issue 759: the sentence under the greeting', () => {
  test('all the data: the number, the difference, who waits and the spend', () => {
    assert.equal(
      home.summarySentence({ today: 10, yesterday: 7, waiting: 3, spend: 14.88 }),
      'Hoje foram 10 sessões nas máquinas, 3 a mais que ontem. 3 esperam por você, e o gasto do dia está em US$ 14,88.',
    );
  });
  test('singular and fewer than yesterday', () => {
    assert.equal(home.summarySentence({ today: 1, yesterday: 3, waiting: 1, spend: 0.5 }), 'Hoje foi 1 sessão nas máquinas, 2 a menos que ontem. 1 espera por você, e o gasto do dia está em US$ 0,50.');
    assert.equal(home.summarySentence({ today: 4, yesterday: 4, waiting: 0, spend: 2 }), 'Hoje foram 4 sessões nas máquinas, o mesmo que ontem. Ninguém espera por você, e o gasto do dia está em US$ 2,00.');
  });
  test('the part whose data is missing is left out, nothing is made up', () => {
    assert.equal(home.summarySentence({ today: 10, yesterday: null, waiting: 3, spend: null }), 'Hoje foram 10 sessões nas máquinas. 3 esperam por você.');
    assert.equal(home.summarySentence({ today: null, yesterday: null, waiting: 2, spend: 9.5 }), '2 esperam por você, e o gasto do dia está em US$ 9,50.');
    assert.equal(home.summarySentence({ today: null, yesterday: null, waiting: null, spend: 9.5 }), 'O gasto do dia está em US$ 9,50.');
    assert.equal(home.summarySentence({ today: null, yesterday: null, waiting: null, spend: null }), null);
  });
});

// ---------- the screen ----------

const machines = [{ id: 'local', label: 'Esta máquina', state: 'connected' }];
const numbers = (active: number) => ({
  sessions: { total: 9, active, blocked: 1, idle: 1 },
  agents: { active, sessions: active },
  subagents: { active: 0, sessions: 0 },
  events: { today: 3, lastHour: 1, total: 9 },
  cost: { usd: 31.5, days: 30, unpriced: [] },
});
const rowOf = (id: string, status: string, attention: unknown = null) => ({ session: id, status, attention, text: `Texto de ${id}`, project: 'demo', at: new Date().toISOString(), machine: null });
const dashboardBody = (active: number, activity = [rowOf('s1', 'active'), rowOf('s2', 'completed'), rowOf('s3', 'waiting', { level: 'blocked', reason: 'permission' })]) => ({ numbers: numbers(active), agents: [], activity, machines });
const attention = { total: 1, blocked: 1, idle: 0, items: [{ session: 's3', title: 's3', project: 'demo', account: null, level: 'needs', reason: 'permission', attention: { level: 'blocked', reason: 'permission' }, shortReason: 'Pede permissão', longReason: 'pede permissão', since: '', minutes: 2, local: null }] };
const costBody = (usd: number | null) => ({ todaySummary: { usd, sessions: 4 }, byDay: [] });

const stops: (() => void)[] = [];
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function rig(answer: { dash?: () => unknown; sessions?: () => unknown; cost?: () => unknown }) {
  const leave = new AbortController();
  const reads: string[] = [];
  const listeners: (() => void)[] = [];
  const ctx = {
    params: {},
    signal: leave.signal,
    read: async (route: string) => {
      reads.push(route);
      if (route === '/api/attention') return attention;
      if (route.startsWith('/api/dashboard')) return (answer.dash ?? (() => dashboardBody(3)))();
      if (route.startsWith('/api/sessions')) return (answer.sessions ?? (() => page([])))();
      if (route.startsWith('/api/analytics/cost')) {
        // The core answers 400 `days: 7, 30 ou 90` to any other period: the stub does the same, so a wrong one shows as a dash.
        const days = Number(new URL(route, 'http://core').searchParams.get('days') ?? 30);
        if (![7, 30, 90].includes(days)) throw new Error('days: 7, 30 ou 90');
        return (answer.cost ?? (() => costBody(14.88)))();
      }
      return { available: true };
    },
    write: async () => ({}),
    onChange: (f: () => void) => listeners.push(f),
    onRestart: () => {},
    counter: () => {},
    title: () => {},
    navigate: () => {},
    liveState: () => 'live',
  };
  const area = new ElementoFalso('main');
  return { ctx, area, reads, leave, listeners };
}
const liveRows = () => {
  const now = Date.now();
  const h = new Date(now);
  const start = new Date(h.getFullYear(), h.getMonth(), h.getDate(), 0, 5).getTime();
  return [session('k1', start, Math.min(now, start + 60_000), 'completed'), session('k2', Math.min(start + 120_000, now - 1000), now, 'active')];
};

describe('issue 759: the Início mounted', () => {
  afterEach(() => (stops.splice(0).forEach((s) => s()), resetMachineChoice(), (documentoFalso.activeElement = null)));

  test('the greeting is the title, the sentence is the subtitle, and the three numbers say their name', async () => {
    const { ctx, area, leave } = rig({ sessions: () => page(liveRows()) });
    stops.push(await dashboard.mount(area, ctx));
    assert.equal(texto(area.querySelector('h1')), home.greeting(Date.now()));
    const sub = texto(area.querySelector('.sub'));
    assert.match(sub, /^Hoje foram \d+ sessões? nas máquinas/);
    assert.match(sub, /1 espera por você, e o gasto do dia está em US\$ 14,88\.$/);
    const cards = area.querySelectorAll('[data-card]');
    assert.deepEqual(cards.map((c) => c.getAttribute('data-card')), ['working-now', 'spend-today', 'completed-today']);
    assert.deepEqual(cards.map((c) => texto(c.querySelector('.label'))), ['Trabalhando agora', 'Gasto hoje', 'Concluídas hoje']);
    assert.equal(texto(cards[0]!.querySelector('.v')), '3 sessões');
    assert.equal(texto(cards[1]!.querySelector('.v')), 'US$ 14,88');
    assert.equal(texto(cards[2]!.querySelector('.v')), '1');
    leave.abort();
  });

  test('without the sessions and the cost, the sentence keeps only who waits and the numbers show a dash', async () => {
    const { ctx, area, leave } = rig({
      sessions: () => {
        throw new Error('o núcleo respondeu 500');
      },
      cost: () => {
        throw new Error('o núcleo respondeu 500');
      },
    });
    stops.push(await dashboard.mount(area, ctx));
    assert.equal(texto(area.querySelector('.sub')), '1 espera por você.');
    const cards = area.querySelectorAll('[data-card]');
    assert.equal(texto(cards[0]!.querySelector('.v')), '3 sessões', 'the working number is of the dashboard itself');
    assert.equal(texto(cards[1]!.querySelector('.v')), '—');
    assert.equal(texto(cards[2]!.querySelector('.v')), '—');
    assert.equal(area.querySelectorAll('.home-bars').length, 0, 'no bars without the sessions');
    leave.abort();
  });

  test('the bars: 8 px wide, a class per state, the legend and each hour in words, no state by colour alone', async () => {
    const { ctx, area, leave } = rig({ sessions: () => page(liveRows()) });
    stops.push(await dashboard.mount(area, ctx));
    const chart = area.querySelector('.home-bars')!;
    assert.ok(chart, 'the chart is on screen');
    const bars = chart.querySelectorAll('.home-bar');
    assert.ok(bars.length >= 1);
    for (const b of bars) assert.match(b.getAttribute('data-kind') ?? '', /^(completed|active|blocked|paused)$/);
    for (const b of bars) assert.match(b.getAttribute('title') ?? '', /\S/, 'each bar names its state');
    const legend = texto(area.querySelector('.home-legend'));
    assert.match(legend, /Concluída/);
    assert.match(legend, /Trabalhando/);
    for (const g of chart.querySelectorAll('.home-hour')) assert.match(g.getAttribute('aria-label') ?? '', /^\d{1,2}h/);
    const css = readFileSync(`${UI_FOLDER}dashboard.css`, 'utf8');
    assert.match(css, /\.home-bar\s*\{[^}]*width:\s*8px/);
    leave.abort();
  });

  test('the recent activity shows the state icon and its words, not the pill', async () => {
    const { ctx, area, leave } = rig({});
    stops.push(await dashboard.mount(area, ctx));
    const rows = area.querySelectorAll('a.row');
    assert.equal(rows.length, 3);
    for (const r of rows) {
      assert.equal(r.querySelectorAll('.badge, .attention-pill').length, 0, 'no pill');
      assert.equal(r.querySelectorAll('.state-tag').length, 1);
      assert.equal(r.querySelectorAll('.state-icon').length, 1);
    }
    assert.deepEqual(rows.map((r) => texto(r.querySelector('.state-tag-label'))), ['Trabalhando', 'Concluída', 'Pede permissão']);
    assert.equal(area.querySelectorAll('.badge').length, 0);
    leave.abort();
  });

  test('the cost is asked for a period the core accepts (7, 30 or 90 days) and today comes from its todaySummary', async () => {
    const { ctx, area, reads, leave } = rig({ sessions: () => page(liveRows()) });
    stops.push(await dashboard.mount(area, ctx));
    const asked = reads.filter((r) => r.startsWith('/api/analytics/cost'));
    assert.equal(asked.length, 1);
    const days = Number(new URL(asked[0]!, 'http://core').searchParams.get('days'));
    assert.ok([7, 30, 90].includes(days), `days=${days} is not one the core accepts`);
    assert.equal(texto(area.querySelector('[data-card="spend-today"] .v')), 'US$ 14,88');
    leave.abort();
  });

  test('the cards of "precisam de você" say the state as the Mural does: the icon and the words, no coloured chip', async () => {
    const { ctx, area, leave } = rig({});
    stops.push(await dashboard.mount(area, ctx));
    const cards = area.querySelectorAll('.dash-mini');
    assert.equal(cards.length, 1);
    assert.equal(cards[0]!.querySelectorAll('.attention-chip').length, 0, 'no chip with a background');
    assert.equal(cards[0]!.querySelectorAll('.state-tag').length, 1);
    assert.equal(cards[0]!.querySelectorAll('.state-icon').length, 1);
    assert.equal(texto(cards[0]!.querySelector('.state-tag-label')), 'Pede permissão');
    leave.abort();
  });

  test('the state column of the recent activity is as wide as the longest label needs, never an ellipsis', () => {
    const css = readFileSync(`${UI_FOLDER}dashboard.css`, 'utf8');
    const rule = (selector: string) => new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const tag = rule('.row .state-tag');
    assert.match(tag, /flex:\s*0 0 (?!auto)\S+|width:\s*\S+/, 'the tag has a width of its own and is not squeezed');
    assert.doesNotMatch(tag, /flex:\s*(0 )?1/);
    const label = rule('.row .state-tag-label');
    assert.doesNotMatch(label, /text-overflow:\s*ellipsis/);
    assert.match(label, /white-space:\s*normal/, 'a longer word wraps instead of being cut');
  });

  test('the state tag of the active agent cards is never cut with an ellipsis and keeps its icon', () => {
    const css = readFileSync(`${UI_FOLDER}dashboard.css`, 'utf8');
    const rule = (selector: string) => new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const tag = rule('.ac .l1 .state-tag');
    assert.match(tag, /flex:\s*0 1 auto|flex:\s*none/, 'the tag sizes itself by its content, the title is what yields');
    assert.doesNotMatch(tag, /overflow:\s*hidden|text-overflow:\s*ellipsis/);
    const label = rule('.ac .l1 .state-tag-label');
    assert.ok(label, 'the label has its own rule in the active agent cards');
    assert.doesNotMatch(label, /text-overflow:\s*ellipsis|overflow:\s*hidden/);
    assert.match(label, /overflow:\s*visible/);
    assert.match(label, /white-space:\s*normal/, 'a longer word wraps instead of being cut');
    assert.match(readFileSync(`${UI_FOLDER}state-icon.css`, 'utf8'), /\.state-icon\s*\{[^}]*flex:\s*none/, 'the icon keeps its size');
  });

  test('the sections keep their h2: the inbox, the active agents and the recent activity', async () => {
    const { ctx, area, leave } = rig({});
    stops.push(await dashboard.mount(area, ctx));
    assert.deepEqual(area.querySelectorAll('h2.ttl').map((h) => texto(h).replace(/\s+/g, ' ').slice(0, 14)), ['1 precisa de v', 'Agentes ativos', 'Atividade rece']);
    leave.abort();
  });

  test('M6: an update that changes the numbers keeps the focus on the row that had it, and the header stays the same node', async () => {
    let active = 3;
    const { ctx, area, leave, listeners } = rig({ dash: () => dashboardBody(active), sessions: () => page(liveRows()) });
    stops.push(await dashboard.mount(area, ctx));
    const head = area.childNodes[0];
    const link = area.querySelectorAll('a.row').find((a) => a.getAttribute('data-session') === 's2')!;
    link.focus();
    assert.equal(documentoFalso.activeElement, link);
    active = 5;
    for (const f of listeners) f();
    await tick(700);
    assert.equal(area.childNodes[0], head, 'the header is not rebuilt');
    assert.equal(texto(area.querySelector('[data-card="working-now"] .v')), '5 sessões', 'the new number is on screen');
    const now = documentoFalso.activeElement!;
    assert.ok(area.contains(now), 'the focus is on screen');
    assert.equal(now.getAttribute('data-session'), 's2');
    leave.abort();
  });

  test('the sessions and the cost are read once for a burst of redraws, not at every one', async () => {
    const { ctx, area, reads, leave, listeners } = rig({ sessions: () => page(liveRows()) });
    stops.push(await dashboard.mount(area, ctx));
    for (let i = 0; i < 3; i++) {
      for (const f of listeners) f();
      await tick(450);
    }
    assert.equal(reads.filter((r) => r.startsWith('/api/sessions')).length, 1);
    assert.equal(reads.filter((r) => r.startsWith('/api/analytics/cost')).length, 1);
    assert.ok(reads.filter((r) => r.startsWith('/api/dashboard')).length >= 3);
    leave.abort();
  });
});

describe('issue 759: the style of the Início', () => {
  const css = readFileSync(`${UI_FOLDER}dashboard.css`, 'utf8');
  test('the radii are tokens, and the old pill is gone', () => {
    assert.doesNotMatch(css, /border-radius:\s*\d+(px)?\b/, 'a radius is a token, not a number');
    assert.doesNotMatch(css, /\.badge|\.b-active|\.b-waiting|\.b-completed|\.b-error|\.b-abandoned/);
  });
  test('the bars do not move for a person who asked for less motion', () => {
    assert.doesNotMatch(css, /@keyframes|transition:/);
  });
  test('the screen reads no state word by hand and no pill', () => {
    const source = readFileSync(`${UI_FOLDER}screens/dashboard.js`, 'utf8');
    assert.doesNotMatch(source, /class: `badge|attentionPill/);
  });
});
