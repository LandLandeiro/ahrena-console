// The screen registry: the route, the sidebar item and the file of each screen (see README.md).
//
// - `route`: the path in the browser; `:id` matches one segment.
// - `item`: the sidebar item, `{ label, icon, section, project? }`. `section` is the id of a `SECTIONS` entry
//   and says which block of the sidebar the item goes in; inside the block, the order of this
//   registry holds. Without `item`, the screen is not in the sidebar and `highlights` says which
//   item stays lit while it is open (the session detail lights Sessions, as in A5; a merged screen lights the item
//   that receives it, decision 0029).
// - `item.project`: the item in the Projeto mode (#754). Without it, the mode hides the item (never its route: the screen
//   opens by link). With it, `{ label?, section?, order? }` say what changes there: the label and the block (the Dev
//   ones when missing) and the place inside the block (`order`, ascending; the registry order when missing). The labels
//   of the two modes are here and nowhere else.
// - `file`: the screen module in `ui/screens/`. Without it, the shell shows the header and the empty state.
// - `title`, `sub` and `icon`: the header of the empty state and the window title.

// The sidebar blocks (decision 0029): the everyday screens ("Agora", ADR-0028), Delivery, Machines and the foot, which
// has Configuração and no title. A block without items does not show. The merged screens (Histórico, Kanban, Feed,
// Workflows, the project Kanban, Dev Console, ADR, PDR, Conexões) have no item: they light the one that receives them
// and carry a row of tabs (`TAB_SETS`, below).
import { coreOutdated, normalizeCore } from './screens/machine-core-format.js';
import { OWNER_AUTH } from './screens/machine-format.js';
import { normalizeUpdate, updatingNow } from './screens/machine-update-format.js';

export const SECTIONS = [
  { id: 'main', label: 'Agora' },
  { id: 'delivery', label: 'Entrega' },
  { id: 'machines', label: 'Máquinas' },
  { id: 'foot', label: null },
];

export const SCREENS = [
  {
    id: 'dashboard',
    route: '/ui',
    highlights: 'analytics',
    title: 'Dashboard',
    sub: 'O agora das suas sessões',
    icon: 'dashboard',
    file: '/ui/screens/dashboard.js',
  },
  {
    id: 'wall',
    route: '/ui/wall',
    item: { label: 'Mural ao vivo', icon: 'wall', section: 'main', project: { label: 'Sua atenção', order: 1 } },
    title: 'Mural ao vivo',
    sub: 'Um card por sessão aberta nesta máquina',
    icon: 'wall',
    file: '/ui/screens/wall.js', // #34
  },
  {
    id: 'sessions',
    route: '/ui/sessions',
    item: { label: 'Sessões', icon: 'sessions', section: 'main', project: { label: 'Conversas', order: 2 } },
    title: 'Sessões',
    sub: 'As sessões registradas nesta máquina',
    icon: 'sessions',
    file: '/ui/screens/sessions.js', // #28
  },
  {
    id: 'feed',
    route: '/ui/feed',
    highlights: 'sessions',
    title: 'Feed de atividade',
    sub: 'Todos os eventos das sessões, ao vivo',
    icon: 'activity',
    file: '/ui/screens/feed.js', // #94
  },
  {
    id: 'kanban',
    route: '/ui/kanban',
    highlights: 'sessions',
    title: 'Kanban',
    sub: 'As sessões por status, só leitura',
    icon: 'kanban',
    file: '/ui/screens/kanban.js', // #31
  },
  {
    id: 'session-detail',
    route: '/ui/sessions/:id',
    highlights: 'sessions',
    title: 'Sessão',
    sub: null,
    icon: 'sessions',
    file: '/ui/screens/session-detail.js', // #29 and #30
  },
  {
    // One agent seen from the inside (issue 521, wireframe 521-1). The agent id has a ":" in it and travels encoded;
    // the shell decodes it into `params.agentId`. It lights the Sessions item, like the session it belongs to (issue 540).
    id: 'agent-view',
    route: '/ui/sessions/:id/agents/:agentId',
    highlights: 'sessions',
    title: 'Agente',
    sub: null,
    icon: 'sessions',
    file: '/ui/screens/agent-view.js',
  },
  {
    id: 'work',
    route: '/ui/work',
    item: { label: 'Quadro do trabalho', icon: 'columns-3', section: 'delivery', project: { order: 1 } },
    title: 'Quadro do trabalho',
    sub: 'As issues de um GitHub Project pelo ciclo do agente',
    icon: 'columns-3',
    file: '/ui/screens/work-board.js',
  },
  {
    id: 'repos',
    route: '/ui/repos',
    item: { label: 'Repositórios', icon: 'repos', section: 'delivery' },
    title: 'Repositórios',
    sub: 'Organizações e repositórios da sua conta do GitHub',
    icon: 'repos',
    file: '/ui/screens/repos.js', // C22
  },
  {
    id: 'repo',
    route: '/ui/repos/:owner/:repo',
    highlights: 'repos',
    title: 'Repositório',
    sub: null,
    icon: 'repos',
    file: '/ui/screens/repo.js', // C23
  },
  {
    // The tabs of a repository with their own URL (/ui/repos/<owner>/<repo>/instructions, C32 and issue 183):
    // the same screen, which reads the tab from `params.tab`; an unknown tab shows "Aba não encontrada".
    id: 'repo-tab',
    route: '/ui/repos/:owner/:repo/:tab',
    highlights: 'repos',
    title: 'Repositório',
    sub: null,
    icon: 'repos',
    file: '/ui/screens/repo.js',
  },
  {
    id: 'project',
    route: '/ui/project',
    highlights: 'work',
    title: 'Kanban do projeto',
    sub: 'O GitHub Project por Status',
    icon: 'github',
    file: '/ui/screens/project.js', // #80 (C11)
  },
  {
    id: 'dev-console',
    route: '/ui/dev-console',
    highlights: 'repos',
    title: 'Dev Console',
    sub: 'PRs, issues e sessões dos repositórios do contexto',
    icon: 'gauge',
    file: '/ui/screens/dev-console.js', // C27, issue 179
  },
  {
    id: 'analytics',
    route: '/ui/analytics',
    item: { label: 'Uso e custo', icon: 'analytics', section: 'main', project: { label: 'Custo', section: 'delivery', order: 3 } },
    title: 'Analytics',
    sub: 'Uso, custo e produtividade das sessões',
    icon: 'analytics',
    file: '/ui/screens/analytics.js', // #95 and #32
  },
  {
    // The Cost tab (/ui/analytics/cost): the same screen, which reads the tab from `params.tab`.
    id: 'analytics-tab',
    route: '/ui/analytics/:tab',
    highlights: 'analytics',
    title: 'Analytics',
    sub: null,
    icon: 'analytics',
    file: '/ui/screens/analytics.js',
  },
  {
    id: 'workflows',
    route: '/ui/workflows',
    highlights: 'analytics',
    title: 'Workflows',
    sub: 'Como os agentes se orquestram: delegação, rodadas de review e resultado',
    icon: 'workflows',
    file: '/ui/screens/workflows.js', // #96
  },
  {
    id: 'history',
    route: '/ui/history',
    highlights: 'sessions',
    title: 'Histórico',
    sub: 'Sessões encerradas, por dia',
    icon: 'history',
    file: '/ui/screens/history.js', // #33
  },
  {
    id: 'decisions',
    route: '/ui/decisions',
    item: { label: 'Decisões', icon: 'decision', section: 'delivery', project: { order: 2 } },
    title: 'Decisões',
    sub: 'O que você e os agentes decidiram, em todas as sessões',
    icon: 'decision',
    file: '/ui/screens/decisions.js', // issue 103
  },
  {
    // As decisões de arquitetura dos repositórios da conta (C28, issue 174).
    id: 'adrs',
    route: '/ui/adrs',
    highlights: 'decisions',
    title: 'ADR',
    sub: 'Decisões de arquitetura dos repositórios da sua conta',
    icon: 'scroll-text',
    file: '/ui/screens/adrs.js',
  },
  {
    // As decisões de produto (C38): a mesma tela, com outro rótulo.
    id: 'pdrs',
    route: '/ui/pdrs',
    highlights: 'decisions',
    title: 'PDR',
    sub: 'Decisões de produto dos repositórios da sua conta',
    icon: 'lightbulb',
    file: '/ui/screens/adrs.js',
  },
  {
    // Um registro aberto (C30): /ui/adrs/<owner>/<repo>/<id>; acende ADR.
    id: 'adr',
    route: '/ui/adrs/:owner/:repo/:id',
    // O id é o nome do arquivo: acento e espaço valem (`0004-decisão de fila`).
    params: { id: 'record' },
    highlights: 'decisions',
    title: 'ADR',
    sub: null,
    icon: 'scroll-text',
    file: '/ui/screens/adr-record.js',
  },
  {
    id: 'pdr',
    route: '/ui/pdrs/:owner/:repo/:id',
    params: { id: 'record' },
    highlights: 'decisions',
    title: 'PDR',
    sub: null,
    icon: 'lightbulb',
    file: '/ui/screens/adr-record.js',
  },
  {
    // This machine (C24, issue 178): always in the sidebar, before the remote ones.
    id: 'this-machine',
    route: '/ui/machines/local',
    item: { label: 'Esta máquina', icon: 'monitor', section: 'machines' },
    title: 'Esta máquina',
    sub: 'A telemetria medida pelo núcleo daqui',
    icon: 'monitor',
    file: '/ui/screens/machine.js',
  },
  {
    // A remote machine (C25, C26): one sidebar item per machine of `GET /api/machines`, which the
    // shell adds with `machineItems()` (below); the open one stays lit through `highlights(params)`.
    id: 'machine',
    route: '/ui/machines/:id',
    highlights: (params) => machineItemId(params.id),
    title: 'Máquina',
    sub: null,
    icon: 'server',
    file: '/ui/screens/machine.js',
  },
  { id: 'agent-config', route: '/ui/agent-config', item: { label: 'Configuração', icon: 'bot', section: 'foot' }, title: 'Agent Config', sub: 'Seu Claude Code: skills, subagentes, comandos, MCP, hooks e memória', icon: 'bot', file: '/ui/screens/agent-config.js' }, // #63
  {
    // The console's own connections (C39 to C44, issue 241): GitHub, by the device flow.
    id: 'connections',
    route: '/ui/connections',
    highlights: 'agent-config',
    title: 'Conexões',
    sub: 'As contas de fora que o console usa',
    icon: 'plug',
    file: '/ui/screens/connections.js',
  },
  {
    // The GitHub detail (C39 to C44) once Conexões is a catalog (issue 277, C57): the same screen.
    id: 'connections-github',
    route: '/ui/connections/github',
    highlights: 'agent-config',
    title: 'Conexões · GitHub',
    sub: null,
    icon: 'github',
    file: '/ui/screens/connections.js',
  },
  {
    // The AWS sessions and profiles of this Mac or a remote machine (`?machine=<id>`, C58 to C60, issue 277).
    id: 'connections-aws',
    route: '/ui/connections/aws',
    highlights: 'agent-config',
    title: 'Conexões · AWS',
    sub: null,
    icon: 'cloud',
    file: '/ui/screens/cloud-connections.js',
  },
];

// ---------- The remote machines in the sidebar (issue 178) ----------
//
// The registry is static; the remote machines come from `machines.json`, which only the core reads.
// So the shell reads `GET /api/machines` and passes `[...SCREENS, ...machineItems(list)]` to
// `sidebarSections`: each remote becomes an item of the `machines` block, after "Esta máquina", in
// the core's order, with its state for the dot. Without remotes, the list adds nothing.

/** The core route the shell reads for the remote items. */
export const MACHINES_ROUTE = '/api/machines';

/** The sidebar id of a remote machine's item. */
export const machineItemId = (id) => `machine-${id}`;

// The machine id of the core (src/telemetry/model.ts `MACHINE_ID`).
const MACHINE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MACHINE_STATES = new Set(['connected', 'unreachable', 'incompatible-version', 'not-configured']);
// A connection the person stopped (issue 278) is not a drop: its own state, a grey dot.
const stoppedByYou = (m) => m.connection && typeof m.connection === 'object' && m.connection.state === 'stopped';
// The tunnel is up and the core over there asks for the owner proof (issue 388): one state for the three
// reasons, its own yellow dot, and the reason on the dot's label (the color alone does not say it).
// The labels come from machine-format.js's OWNER_AUTH, so the pill and the dot cannot drift apart.
const ownerAuthOf = (m) => (m.state === 'unreachable' && Object.hasOwn(OWNER_AUTH, m.reason ?? '') ? m.reason : null);
/*
 * The núcleo over there is being updated, by a click or by the Mac itself (issue 484, decision 0024 section 4): its own
 * dot, "Atualizando", from the --check until the new version answers. Only a connection the person stopped wins over it.
 * (ADR-0024)
 */
const updatingOf = (m) => {
  const u = normalizeUpdate(m.update);
  return Boolean(u && updatingNow(u));
};

// A machine asks for action when its state says so (Sem conexão, Acesso bloqueado, Versão diferente, Sem configuração) or
// its núcleo is older than the app (the arrow). "Parada por você" and "Atualizando" do not, even with the arrow (0029).
const asksForAction = (state, outdated) => state !== 'stopped' && state !== 'updating' && (outdated || state !== 'connected');

/** The sidebar entries of the remote machines in `GET /api/machines` (this machine is in SCREENS). */
export function machineItems(machines) {
  if (!Array.isArray(machines)) return [];
  const seen = new Set();
  const out = [];
  for (const m of machines.slice(0, 50)) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !MACHINE_ID.test(m.id) || m.id === 'local' || seen.has(m.id)) continue;
    seen.add(m.id);
    const label = typeof m.label === 'string' && m.label.trim() ? m.label.slice(0, 40) : m.id;
    const updating = !stoppedByYou(m) && updatingOf(m);
    const auth = stoppedByYou(m) || updating ? null : ownerAuthOf(m);
    const state = stoppedByYou(m) ? 'stopped' : updating ? 'updating' : auth ? 'owner-auth' : MACHINE_STATES.has(m.state) ? m.state : 'unreachable';
    const outdated = coreOutdated(normalizeCore(m.core));
    out.push({
      id: machineItemId(m.id),
      route: `/ui/machines/${m.id}`,
      // In Projeto the item stays only while the alert lasts (decision 0029); the label and the block are the same.
      item: { label, icon: 'server', section: 'machines', ...(asksForAction(state, outdated) ? { project: {} } : {}) },
      state,
      ...(auth ? { stateLabel: OWNER_AUTH[auth].dot } : {}),
      // The núcleo over there is older than the app (issue 449): a yellow arrow beside the name, nothing else of `core`.
      ...(outdated ? { coreOutdated: true } : {}),
      title: label,
      icon: 'server',
    });
  }
  return out;
}

/** The item a screen lights: its own, or the one its `highlights` names (a function of the params). */
export function litItem(screen, params = {}) {
  if (screen.item) return screen.id;
  return typeof screen.highlights === 'function' ? screen.highlights(params) : (screen.highlights ?? null);
}

/**
 * The sidebar blocks with their items, in `SECTIONS` order; empty blocks are left out. An item
 * without a known `section` falls in the first block, so a screen never disappears from the sidebar
 * (the registry test refuses such an item).
 *
 * `mode` is `dev` (every item, as registered) or `project` (#754): only the items that carry `item.project`, each with
 * the label and the block it says there, in the order it says; the others are not here, so nothing draws them and Tab
 * does not reach them. The registry itself is not changed: the screen of a hidden item still opens by its route.
 */
export function sidebarSections(screens = SCREENS, sections = SECTIONS, mode = 'dev') {
  const known = new Set(sections.map((s) => s.id));
  const sectionOf = (t) => (known.has(t.item.section) ? t.item.section : sections[0].id);
  const shown = mode === 'project' ? screens.filter((t) => t.item?.project).map(inProject) : screens;
  return sections
    .map((s) => ({ ...s, items: orderedFor(shown.filter((t) => t.item && sectionOf(t) === s.id), mode) }))
    .filter((s) => s.items.length);
}

// The screen as the Projeto bar draws it: the label and the block of `item.project`, the Dev ones where it is silent.
function inProject(screen) {
  const { label = screen.item.label, section = screen.item.section } = screen.item.project;
  return { ...screen, item: { ...screen.item, label, section } };
}

// In Projeto, `project.order` sets the place inside a block; an item without one goes after, in registry order.
function orderedFor(items, mode) {
  if (mode !== 'project') return items;
  const place = (t) => t.item.project?.order ?? Number.POSITIVE_INFINITY;
  return items.map((t, i) => [t, i]).sort((a, b) => place(a[0]) - place(b[0]) || a[1] - b[1]).map(([t]) => t);
}

// A session id or a GitHub name (dot, hyphen and underscore); `.` and `..` never.
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
// The other parameter shapes a screen may ask for in `params` (issue 174: o id de um registro de
// decisão é o nome do arquivo, com acento e espaço; nunca barra nem caractere de controle).
const PARAM_SHAPES = { record: /^[^/\u0000-\u001f]{1,200}$/u };

/** The screen and the parameters of a path, or `null` when none matches. */
export function findScreen(path, screens = SCREENS) {
  const parts = path.replace(/\/+$/, '').split('/');
  for (const screen of screens) {
    const pattern = screen.route.split('/');
    if (pattern.length !== parts.length) continue;
    const params = {};
    let matches = true;
    for (let i = 0; i < pattern.length && matches; i++) {
      if (pattern[i].startsWith(':')) {
        let value = '';
        try {
          value = decodeURIComponent(parts[i]);
        } catch {}
        const name = pattern[i].slice(1);
        const shape = PARAM_SHAPES[screen.params?.[name]] ?? ID;
        if (shape.test(value) && value !== '.' && value !== '..') params[name] = value;
        else matches = false;
      } else matches = pattern[i] === parts[i];
    }
    if (matches) return { screen, params };
  }
  return null;
}

// ---------- The tabs of the merged screens (decision 0029) ----------
//
// A screen that lost its item to a merge keeps its route and gets, at its top, a row of tabs: links to routes that already
// exist (ui/screen-tabs.js draws it). Each set is named after the item that receives its screens; its first tab is that item's
// screen. A tab names the screens it covers (`screens`, the first one gives the route; the others are the same screen with a
// parameter and keep the tab current) and may be for one mode only (`mode`).
export const TAB_SETS = [
  {
    id: 'sessions',
    label: 'Sessões',
    tabs: [
      { label: 'Sessões', screens: ['sessions'] },
      { label: 'Encerradas', screens: ['history'] },
      { label: 'Por estado', screens: ['kanban'] },
      { label: 'Eventos', screens: ['feed'], mode: 'dev' },
    ],
  },
  {
    id: 'usage',
    label: 'Uso e custo',
    tabs: [
      { label: 'Uso', screens: ['analytics', 'analytics-tab'] },
      { label: 'Orquestração', screens: ['workflows'] },
      { label: 'Resumo', screens: ['dashboard'] },
    ],
  },
  {
    id: 'work',
    label: 'Quadro do trabalho',
    tabs: [
      { label: 'Quadro', screens: ['work'] },
      { label: 'Por status do Project', screens: ['project'] },
    ],
  },
  {
    id: 'repos',
    label: 'Repositórios',
    tabs: [
      { label: 'Repositórios', screens: ['repos'] },
      { label: 'Do contexto', screens: ['dev-console'] },
    ],
  },
  {
    id: 'decisions',
    label: 'Decisões',
    tabs: [
      { label: 'Nas sessões', screens: ['decisions'] },
      { label: 'Técnicas', screens: ['adrs'] },
      { label: 'Produto', screens: ['pdrs'] },
    ],
  },
  {
    id: 'config',
    label: 'Configuração',
    tabs: [
      { label: 'Configuração do Claude', screens: ['agent-config'] },
      { label: 'Conexões', screens: ['connections', 'connections-github', 'connections-aws'] },
    ],
  },
];

/**
 * The tab row of a screen: `{ label, tabs: [{ label, route, current }] }`, or `null` when the screen is in no set. A tab of the
 * other mode is left out unless it is the screen open. The routes are read from the registry, so they cannot drift.
 */
export function tabsFor(screenId, mode = 'dev', screens = SCREENS, sets = TAB_SETS) {
  const set = sets.find((s) => s.tabs.some((t) => t.screens.includes(screenId)));
  if (!set) return null;
  const tabs = [];
  for (const t of set.tabs) {
    const current = t.screens.includes(screenId);
    const route = screens.find((s) => s.id === t.screens[0])?.route;
    if (!route || (t.mode && t.mode !== mode && !current)) continue;
    tabs.push({ label: t.label, route, current });
  }
  return { label: set.label, tabs };
}
