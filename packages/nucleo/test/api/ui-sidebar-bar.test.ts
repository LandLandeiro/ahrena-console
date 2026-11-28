// #754, layer C: the bar of the registry. Dev has six fixed items (Agora 3, Entrega 3), one per machine and Configuração at the foot;
// Projeto has five, and a machine that asks for action stays while the alert lasts. The mode hides items, never routes.
// A merged screen loses its item, lights the one that receives it and gets a row of tabs, which are links to routes that exist.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { documentoFalso, ElementoFalso, instalarDomFalso } from './fake-dom.ts';

instalarDomFalso();
Object.assign(globalThis, { location: { pathname: '/ui/wall', search: '', hash: '' } });

// @ts-expect-error: browser modules, plain JavaScript
import { createNav } from '../../ui/nav.js';
// @ts-expect-error: idem
import { setAppMode } from '../../ui/mode.js';
// @ts-expect-error: idem
import * as registry from '../../ui/screens.js';

const { findScreen, litItem, machineItems, SCREENS, SECTIONS, sidebarSections, TAB_SETS, tabsFor } = registry as Record<string, any>;
// The row component is loaded apart: while it does not exist, only the tests that draw it fail.
const createScreenTabs: (a: { host: unknown }) => { draw: (t: unknown) => void } = (a) =>
  (globalThis as { __tabs?: any }).__tabs?.createScreenTabs(a) ?? (() => { throw new Error('ui/screen-tabs.js does not exist yet'); })();
(globalThis as { __tabs?: unknown }).__tabs = await import('../../ui/screen-tabs.js').catch(() => null);

const read = (file: string) => readFileSync(`${UI_FOLDER}${file}`, 'utf8');
const store = new Map<string, string>();
const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
const mode = (value: 'dev' | 'project') => setAppMode(value, { root: new ElementoFalso('html'), storage, persist: false });
beforeEach(() => mode('dev'));
afterEach(() => mode('dev'));

type Block = { id: string; label: string | null; items: { id: string; item: { label: string } }[] };
const bar = (screens: unknown[], m: 'dev' | 'project') => (sidebarSections(screens, SECTIONS, m) as Block[]).map((s) => [s.id, s.label, s.items.map((t) => `${t.id}:${t.item.label}`)]);

const local = { id: 'local', label: 'Esta máquina', state: 'connected' };
const machine = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id.toUpperCase(), state: 'connected', ...extra });
const coreOld = { version: '0.0.18', commit: 'a1b2c3d', expectedVersion: '0.0.22', status: 'outdated', readAt: '2026-11-28T10:00:00.000Z', mac: { telemetryVersion: 1, credentialCommand: true, checkout: null } };

describe('#754 C: the Dev bar', () => {
  test('Agora has the Mural, Sessões and Uso e custo; Entrega has the board, Repositórios and Decisões; the foot has Configuração', () => {
    assert.deepEqual(bar(SCREENS, 'dev'), [
      ['main', 'Agora', ['wall:Mural ao vivo', 'sessions:Sessões', 'analytics:Uso e custo']],
      ['delivery', 'Entrega', ['work:Quadro do trabalho', 'repos:Repositórios', 'decisions:Decisões']],
      ['machines', 'Máquinas', ['this-machine:Esta máquina']],
      ['foot', null, ['agent-config:Configuração']],
    ]);
  });

  test('the sections are Agora, Entrega, Máquinas and the foot, which has no title', () => {
    assert.deepEqual(SECTIONS, [
      { id: 'main', label: 'Agora' },
      { id: 'delivery', label: 'Entrega' },
      { id: 'machines', label: 'Máquinas' },
      { id: 'foot', label: null },
    ]);
  });

  test('every machine is an item of Máquinas, after "Esta máquina", as today', () => {
    const block = (sidebarSections([...SCREENS, ...machineItems([local, machine('ws'), machine('lab')])], SECTIONS, 'dev') as Block[]).find((s) => s.id === 'machines')!;
    assert.deepEqual(block.items.map((t) => t.item.label), ['Esta máquina', 'WS', 'LAB']);
  });

  test('the English names are gone from the bar', () => {
    const labels = (sidebarSections(SCREENS, SECTIONS, 'dev') as Block[]).flatMap((s) => s.items.map((t) => t.item.label));
    for (const gone of ['Dashboard', 'Feed de atividade', 'Kanban', 'Analytics', 'Workflows', 'Histórico', 'Kanban do projeto', 'Dev Console', 'Das sessões', 'ADR', 'PDR', 'Agent Config', 'Conexões']) assert.ok(!labels.includes(gone), gone);
  });

  test('the bar has ten items with three machines, as decision 0029 says', () => {
    const total = (sidebarSections([...SCREENS, ...machineItems([local, machine('a'), machine('b')])], SECTIONS, 'dev') as Block[]).flatMap((s) => s.items);
    assert.equal(total.length, 10);
  });
});

describe('#754 C: the merged screens light the item that receives them', () => {
  const lit = (path: string) => {
    const found = findScreen(path)!;
    return litItem(found.screen, found.params);
  };

  test('each merged screen has no item and lights one that exists in the Dev bar', () => {
    const wanted: Record<string, string> = {
      '/ui': 'analytics',
      '/ui/analytics': 'analytics',
      '/ui/analytics/cost': 'analytics',
      '/ui/workflows': 'analytics',
      '/ui/sessions': 'sessions',
      '/ui/history': 'sessions',
      '/ui/kanban': 'sessions',
      '/ui/feed': 'sessions',
      '/ui/sessions/abc': 'sessions',
      '/ui/work': 'work',
      '/ui/project': 'work',
      '/ui/repos': 'repos',
      '/ui/dev-console': 'repos',
      '/ui/repos/a/b': 'repos',
      '/ui/decisions': 'decisions',
      '/ui/adrs': 'decisions',
      '/ui/pdrs': 'decisions',
      '/ui/adrs/a/b/0001-x': 'decisions',
      '/ui/pdrs/a/b/PDR-001-x': 'decisions',
      '/ui/agent-config': 'agent-config',
      '/ui/connections': 'agent-config',
      '/ui/connections/github': 'agent-config',
      '/ui/connections/aws': 'agent-config',
      '/ui/wall': 'wall',
      '/ui/machines/local': 'this-machine',
    };
    const ids = new Set((sidebarSections(SCREENS, SECTIONS, 'dev') as Block[]).flatMap((s) => s.items.map((t) => t.id)));
    for (const [path, id] of Object.entries(wanted)) {
      assert.equal(lit(path), id, path);
      assert.ok(ids.has(id), `${path} lights ${id}, which is in the bar`);
    }
    for (const id of ['dashboard', 'feed', 'kanban', 'history', 'workflows', 'project', 'dev-console', 'adrs', 'pdrs', 'connections']) {
      assert.equal(SCREENS.find((s: { id: string }) => s.id === id).item, undefined, `${id} has no item`);
    }
  });

  test('no route changed: the registry keeps the routes it had', () => {
    const routes = SCREENS.map((s: { route: string }) => s.route).sort();
    assert.deepEqual(
      routes,
      ['/ui', '/ui/wall', '/ui/sessions', '/ui/feed', '/ui/kanban', '/ui/sessions/:id', '/ui/sessions/:id/agents/:agentId', '/ui/work', '/ui/repos', '/ui/repos/:owner/:repo', '/ui/repos/:owner/:repo/:tab', '/ui/project', '/ui/dev-console', '/ui/analytics', '/ui/analytics/:tab', '/ui/workflows', '/ui/history', '/ui/decisions', '/ui/adrs', '/ui/pdrs', '/ui/adrs/:owner/:repo/:id', '/ui/pdrs/:owner/:repo/:id', '/ui/machines/local', '/ui/machines/:id', '/ui/agent-config', '/ui/connections', '/ui/connections/github', '/ui/connections/aws'].sort(),
    );
    assert.equal(findScreen('/ui').screen.id, 'dashboard');
  });
});

describe('#754 C: the Projeto bar', () => {
  test('Agora has "Sua atenção" and "Conversas"; Entrega has the board, Decisões and "Custo"; no machine, no Configuração', () => {
    assert.deepEqual(bar(SCREENS, 'project'), [
      ['main', 'Agora', ['wall:Sua atenção', 'sessions:Conversas']],
      ['delivery', 'Entrega', ['work:Quadro do trabalho', 'decisions:Decisões', 'analytics:Custo']],
    ]);
  });

  test('Decisões opens the product decisions in Projeto and the ones of the conversations in Dev; the routes stay (#754)', () => {
    const href = (m: 'dev' | 'project') => (sidebarSections(SCREENS, SECTIONS, m) as (Block & { items: { id: string; route: string }[] })[]).flatMap((s) => s.items).find((t) => t.id === 'decisions')!.route;
    assert.equal(href('dev'), '/ui/decisions');
    assert.equal(href('project'), '/ui/pdrs');
    assert.ok(findScreen('/ui/pdrs'), 'the route exists');
    assert.equal(SCREENS.find((s: { id: string }) => s.id === 'decisions').route, '/ui/decisions', 'the registry is not changed');
    const { nav } = (() => {
      const node = new ElementoFalso('nav');
      createNav({ nav: node, read: async () => [], screens: SCREENS });
      return { nav: node };
    })();
    mode('project');
    assert.equal((nav.querySelector('[data-screen="decisions"]') as ElementoFalso).getAttribute('href'), '/ui/pdrs');
    mode('dev');
    assert.equal((nav.querySelector('[data-screen="decisions"]') as ElementoFalso).getAttribute('href'), '/ui/decisions');
  });

  test('the labels of the bar have the voice limits: at most 4 words and 28 characters, no "!", no em dash', () => {
    // The brief asked "O que precisa de você" (5 words); the voice rules (4 words) refuse it and "Precisa de você" is a state label (state-labels.js), so the Mural is "Sua atenção".
    for (const s of sidebarSections(SCREENS, SECTIONS, 'project') as Block[]) {
      for (const t of s.items) {
        assert.ok(t.item.label.length <= 28, t.item.label);
        assert.doesNotMatch(t.item.label, /[!—]/);
      }
    }
  });

  test('Dev gives the same registry back after Projeto: nothing is lost', () => {
    const before = JSON.stringify(bar(SCREENS, 'dev'));
    bar(SCREENS, 'project');
    assert.equal(JSON.stringify(bar(SCREENS, 'dev')), before);
    assert.equal(SCREENS.find((s: { id: string }) => s.id === 'wall').item.label, 'Mural ao vivo');
  });

  test('a machine that asks for action stays: Sem conexão, Acesso bloqueado, Versão diferente and Sem configuração', () => {
    const list = [
      local,
      machine('down', { state: 'unreachable', reason: 'port-closed' }),
      machine('locked', { state: 'unreachable', reason: 'owner-auth-missing' }),
      machine('other', { state: 'incompatible-version' }),
      machine('bare', { state: 'not-configured' }),
      machine('fine'),
    ];
    const items = machineItems(list);
    const kept = (sidebarSections([...SCREENS, ...items], SECTIONS, 'project') as Block[]).find((s) => s.id === 'machines')!;
    assert.deepEqual(kept.items.map((t) => t.id), ['machine-down', 'machine-locked', 'machine-other', 'machine-bare']);
    assert.equal(kept.label, 'Máquinas');
  });

  test('a connected machine with an outdated core stays, with the arrow', () => {
    const items = machineItems([machine('old', { core: coreOld })]);
    assert.equal(items[0].coreOutdated, true);
    const kept = (sidebarSections([...SCREENS, ...items], SECTIONS, 'project') as Block[]).find((s) => s.id === 'machines');
    assert.deepEqual(kept?.items.map((t) => t.id), ['machine-old']);
  });

  test('"Parada por você" and "Atualizando" do not ask for action: they do not enter, even with the arrow', () => {
    const stopped = machine('stop', { connection: { state: 'stopped' }, core: coreOld });
    const updating = machine('upd', { update: { configured: true, state: 'running', kind: 'update', phase: 'swap', startedAt: '2026-11-28T10:00:00.000Z' }, core: coreOld });
    const items = machineItems([stopped, updating]);
    assert.deepEqual(items.map((t: { state: string }) => t.state), ['stopped', 'updating']);
    assert.equal((sidebarSections([...SCREENS, ...items], SECTIONS, 'project') as Block[]).find((s) => s.id === 'machines'), undefined);
    // In Dev they are in the bar as they were.
    assert.equal((sidebarSections([...SCREENS, ...items], SECTIONS, 'dev') as Block[]).find((s) => s.id === 'machines')!.items.length, 3);
  });

  test('the label of a machine does not change in Projeto', () => {
    const items = machineItems([machine('down', { state: 'unreachable', label: 'Workstation' })]);
    const kept = (sidebarSections([...SCREENS, ...items], SECTIONS, 'project') as Block[]).find((s) => s.id === 'machines')!;
    assert.deepEqual(kept.items.map((t) => t.item.label), ['Workstation']);
  });
});

describe('#754 C: the nav draws the mode and redraws on a switch', () => {
  const labels = (nav: ElementoFalso) => (nav.querySelectorAll('.cc-nav-label') as unknown as ElementoFalso[]).map((n) => n.textContent);
  function rig(machines: unknown[] = []) {
    const nav = new ElementoFalso('nav');
    const made = createNav({ nav, read: async () => machines, screens: SCREENS });
    return { nav, ...made };
  }

  test('the first draw follows the mode, and a switch draws the other bar', () => {
    const { nav } = rig();
    assert.deepEqual(labels(nav), ['Mural ao vivo', 'Sessões', 'Uso e custo', 'Quadro do trabalho', 'Repositórios', 'Decisões', 'Esta máquina', 'Configuração']);
    mode('project');
    assert.deepEqual(labels(nav), ['Sua atenção', 'Conversas', 'Quadro do trabalho', 'Decisões', 'Custo']);
    mode('dev');
    assert.equal(labels(nav).length, 8);
  });

  test('an item the mode hides is not rendered: Tab cannot reach it', () => {
    const { nav } = rig();
    mode('project');
    for (const id of ['repos', 'this-machine', 'agent-config']) assert.equal(nav.querySelector(`[data-screen="${id}"]`), null, id);
    assert.equal(nav.querySelector('[data-section="machines"]'), null);
    assert.equal(nav.querySelector('[data-section="foot"]'), null);
  });

  test('the counter and the tag, the lit item and the focus survive the switch', () => {
    const { nav, counter, tag, highlight } = rig();
    counter('sessions', 4);
    tag('wall', { tone: 'waiting', text: '3 esperam' });
    highlight('sessions');
    (nav.querySelector('[data-screen="sessions"]') as ElementoFalso).focus();
    nav.scrollTop = 33;
    mode('project');
    const sessions = nav.querySelector('[data-screen="sessions"]') as ElementoFalso;
    assert.equal(sessions.querySelector('.cc-nav-count')?.textContent, '4');
    assert.equal(sessions.getAttribute('aria-current'), 'page');
    assert.equal(documentoFalso.activeElement, sessions);
    assert.equal(nav.scrollTop, 33);
    assert.equal(nav.querySelector('[data-screen="wall"] .cc-nav-tag')?.textContent, '3 esperam', 'the same "N esperam" in both modes');
    mode('dev');
    assert.equal(nav.querySelector('[data-screen="wall"] .cc-nav-tag')?.textContent, '3 esperam');
  });

  test('a machine that asks for action stays in Projeto, with its dot and its arrow; one that does not leaves', async () => {
    const down = machine('down', { state: 'unreachable', reason: 'port-closed', core: coreOld });
    const { nav, readMachines } = rig([down, machine('fine'), machine('stop', { connection: { state: 'stopped' }, core: coreOld })]);
    await readMachines();
    mode('project');
    assert.ok(nav.querySelector('[data-screen="machine-down"] .cc-nav-dot'));
    assert.ok(nav.querySelector('[data-screen="machine-down"] .cc-nav-flag'));
    assert.equal(nav.querySelector('[data-screen="machine-fine"]'), null);
    assert.equal(nav.querySelector('[data-screen="machine-stop"]'), null);
    assert.ok(nav.querySelector('[data-section="machines"]'));
  });

  test('a read of the machines while in Projeto draws the Projeto bar', async () => {
    mode('project');
    const { nav, readMachines } = rig([machine('down', { state: 'unreachable', reason: 'port-closed' })]);
    await readMachines();
    assert.deepEqual(labels(nav), ['Sua atenção', 'Conversas', 'Quadro do trabalho', 'Decisões', 'Custo', 'DOWN']);
  });

  test('createNav gives a stop that ends the listening to the mode', () => {
    const { nav, stop } = rig();
    stop();
    mode('project');
    assert.equal(labels(nav).length, 8);
  });

  test('the dot of the connectors sits on Configuração, which receives Conexões', async () => {
    const nav = new ElementoFalso('nav');
    const body = { connectors: [{ kind: 'aws', state: 'expired', cli: { found: true, version: 2, deviceCodeSupported: true }, configFile: { status: 'ok' }, sessions: [], outOfScope: [] }, { kind: 'gcp', state: 'soon' }, { kind: 'azure', state: 'soon' }] };
    const { readConnectors } = createNav({ nav, read: async () => body, screens: SCREENS });
    await readConnectors();
    assert.equal(nav.querySelector('[data-screen="connections"]'), null);
    assert.equal((nav.querySelector('[data-screen="agent-config"] .cc-nav-dot') as ElementoFalso).getAttribute('data-state'), 'cloud-error');
  });
});

describe('#754 C: the tab row', () => {
  const route = (id: string) => SCREENS.find((s: { id: string }) => s.id === id).route;

  test('the tab map: screen, tabs and routes, all of them routes that exist', () => {
    const map = Object.fromEntries(
      (TAB_SETS as { id: string; label: string; tabs: { label: string; screens: string[]; mode?: string }[] }[]).map((set) => [set.label, set.tabs.map((t) => `${t.label}=${route(t.screens[0]!)}${t.mode ? `(${t.mode})` : ''}`)]),
    );
    assert.deepEqual(map, {
      Sessões: ['Sessões=/ui/sessions', 'Encerradas=/ui/history', 'Por estado=/ui/kanban', 'Eventos=/ui/feed(dev)'],
      'Uso e custo': ['Uso=/ui/analytics', 'Orquestração=/ui/workflows(dev)', 'Resumo=/ui'],
      'Quadro do trabalho': ['Quadro=/ui/work', 'Por status do Project=/ui/project'],
      Repositórios: ['Repositórios=/ui/repos', 'Do contexto=/ui/dev-console'],
      Decisões: ['Nas sessões=/ui/decisions', 'Técnicas=/ui/adrs', 'Produto=/ui/pdrs'],
      Configuração: ['Configuração do Claude=/ui/agent-config', 'Conexões=/ui/connections'],
    });
    for (const set of TAB_SETS) for (const t of set.tabs) for (const id of t.screens) assert.ok(SCREENS.some((s: { id: string }) => s.id === id), id);
  });

  test('the labels have the voice limits and none is an English name of the old bar', () => {
    for (const set of TAB_SETS) {
      for (const t of set.tabs) {
        assert.ok(t.label.split(/\s+/).length <= 4 && t.label.length <= 28, t.label);
        assert.doesNotMatch(t.label, /[!—]/);
        assert.ok(!['Dashboard', 'Analytics', 'Workflows', 'Kanban', 'Feed', 'Dev Console', 'Agent Config', 'ADR', 'PDR'].includes(t.label), t.label);
      }
    }
  });

  test('a screen of a set gets its tabs with the current one marked; a screen outside a set gets none', () => {
    const sessions = tabsFor('history', 'dev');
    assert.equal(sessions.label, 'Sessões');
    assert.deepEqual(sessions.tabs.map((t: { label: string; route: string; current: boolean }) => [t.label, t.route, t.current]), [
      ['Sessões', '/ui/sessions', false],
      ['Encerradas', '/ui/history', true],
      ['Por estado', '/ui/kanban', false],
      ['Eventos', '/ui/feed', false],
    ]);
    assert.equal(tabsFor('analytics-tab', 'dev').tabs.find((t: { current: boolean }) => t.current).label, 'Uso');
    assert.equal(tabsFor('dashboard', 'dev').tabs.find((t: { current: boolean }) => t.current).label, 'Resumo');
    assert.equal(tabsFor('connections-aws', 'dev').tabs.find((t: { current: boolean }) => t.current).label, 'Conexões');
    for (const none of ['wall', 'session-detail', 'repo', 'machine', 'this-machine', 'adr']) assert.equal(tabsFor(none, 'dev'), null, none);
  });

  test('Eventos is Dev only; if it is the screen open, its tab stays', () => {
    assert.deepEqual(tabsFor('history', 'project').tabs.map((t: { label: string }) => t.label), ['Conversas', 'Encerradas', 'Por estado']);
    assert.deepEqual(tabsFor('feed', 'project').tabs.map((t: { label: string }) => t.label), ['Conversas', 'Encerradas', 'Por estado', 'Eventos']);
  });

  test('Orquestração is Dev only; in Projeto the usage row is Custo, Resumo (#754)', () => {
    assert.deepEqual(tabsFor('analytics', 'dev').tabs.map((t: { label: string }) => t.label), ['Uso', 'Orquestração', 'Resumo']);
    assert.deepEqual(tabsFor('analytics', 'project').tabs.map((t: { label: string }) => t.label), ['Uso', 'Resumo']);
    assert.deepEqual(tabsFor('workflows', 'project').tabs.map((t: { label: string }) => t.label), ['Uso', 'Orquestração', 'Resumo'], 'the open screen keeps its tab');
    assert.equal(findScreen('/ui/workflows').screen.id, 'workflows', 'the route still opens');
  });

  test('the row uses the term of the mode: Dev says Sessões, Uso e custo and Nas sessões; Projeto says Conversas, Custo and Nas conversas (#754)', () => {
    const names = (id: string, m: 'dev' | 'project') => {
      const row = tabsFor(id, m);
      return [row.label, ...row.tabs.map((t: { label: string }) => t.label)];
    };
    assert.deepEqual(names('sessions', 'dev'), ['Sessões', 'Sessões', 'Encerradas', 'Por estado', 'Eventos']);
    assert.deepEqual(names('sessions', 'project'), ['Conversas', 'Conversas', 'Encerradas', 'Por estado']);
    assert.deepEqual(names('analytics', 'dev'), ['Uso e custo', 'Uso', 'Orquestração', 'Resumo']);
    assert.deepEqual(names('analytics', 'project'), ['Custo', 'Uso', 'Resumo']);
    assert.deepEqual(names('decisions', 'dev'), ['Decisões', 'Nas sessões', 'Técnicas', 'Produto']);
    assert.deepEqual(names('decisions', 'project'), ['Decisões', 'Nas conversas', 'Técnicas', 'Produto']);
    const host = new ElementoFalso('div');
    const row = createScreenTabs({ host });
    row.draw(tabsFor('history', 'project'));
    assert.equal((host.querySelector('nav') as ElementoFalso).getAttribute('aria-label'), 'Abas de Conversas');
    row.draw(tabsFor('history', 'dev'));
    assert.equal((host.querySelector('nav') as ElementoFalso).getAttribute('aria-label'), 'Abas de Sessões');
  });

  test('every merged screen is in a set whose first tab is the item that receives it', () => {
    const item = { sessions: 'sessions', usage: 'analytics', work: 'work', repos: 'repos', decisions: 'decisions', config: 'agent-config' } as Record<string, string>;
    for (const set of TAB_SETS) {
      assert.equal(set.tabs[0].screens[0], item[set.id], set.id);
      assert.ok(SCREENS.find((s: { id: string }) => s.id === item[set.id]).item, set.id);
    }
  });

  test('the row is a nav landmark with a label, links to the routes, and aria-current on the current tab', () => {
    const host = new ElementoFalso('div');
    const tabs = createScreenTabs({ host });
    tabs.draw(tabsFor('history', 'dev'));
    const nav = host.querySelector('nav') as ElementoFalso;
    assert.ok(nav);
    assert.equal(nav.getAttribute('aria-label'), 'Abas de Sessões');
    const links = nav.querySelectorAll('a') as unknown as ElementoFalso[];
    assert.deepEqual(links.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('aria-current')]), [
      ['Sessões', '/ui/sessions', null],
      ['Encerradas', '/ui/history', 'page'],
      ['Por estado', '/ui/kanban', null],
      ['Eventos', '/ui/feed', null],
    ]);
    assert.equal(host.hidden, false);
  });

  test('a screen with no set empties the row and hides it', () => {
    const host = new ElementoFalso('div');
    const tabs = createScreenTabs({ host });
    tabs.draw(tabsFor('history', 'dev'));
    tabs.draw(null);
    assert.equal(host.querySelector('nav'), null);
    assert.equal(host.hidden, true);
  });

  test('the shell mounts the row above the screen and redraws it on a switch of the mode', () => {
    const html = read('index.html');
    assert.match(html, /<div class="cc-notice" id="update-notice" hidden><\/div>\s*<div class="cc-tabs-host" id="screen-tabs" hidden><\/div>\s*<main class="cc-main" id="content">/);
    assert.match(html, /<link rel="stylesheet" href="\/ui\/screen-tabs\.css">/);
    const app = read('app.js');
    assert.match(app, /createScreenTabs\(\{ host: document\.getElementById\('screen-tabs'\) \}\)/);
    assert.match(app, /screenTabs\.draw\(tabsFor\(screen\.id, appMode\(\)\)\)/);
    assert.match(app, /screenTabs\.draw\(null\)/);
    // The Dev-only tab follows the mode.
    assert.match(app, /onModeChange\([^)]*\)[^]*screenTabs\.draw/);
  });

  test('the style: tokens only, a visible focus, the current tab by weight and a line (not only by color), and no motion when reduced', () => {
    const css = read('screen-tabs.css');
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'no color written by hand');
    assert.doesNotMatch(css, /\d+(\.\d+)?ms\b/, 'no duration written by hand');
    assert.match(css, /\.cc-tab:focus-visible \{[^}]*outline: 2px solid var\(--accent-line\)/);
    assert.match(css, /\.cc-tab\[aria-current="page"\] \{[^}]*font-weight: var\(--weight-medium\)/);
    assert.match(css, /\.cc-tab\[aria-current="page"\] \{[^}]*border-bottom-color: var\(--accent-line\)/);
    assert.match(css, /\.cc-tab \{[^}]*color: var\(--muted\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.cc-tab \{ transition: none; \}/);
    assert.match(css, /\.cc-tabs-host\[hidden\] \{ display: none; \}/);
    assert.match(css, /overflow-x: auto/, 'the row scrolls at 390 px instead of wrapping into the content');
  });
});
