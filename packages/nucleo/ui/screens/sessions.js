// A tela Sessões (C3, #28): a tabela das sessões com busca, filtro por diretório, ordenação, as
// filtros de estado no `.seg` (com a contagem de cada um, issue 759) e as linhas que cabem na altura da janela (issue 279; no mínimo 10). Filtro, ordem
// e página vão para o servidor (`GET /api/sessions`, src/api/sessions.ts) e ficam na query da URL, para
// o Voltar do Detalhe cair no mesmo lugar.
// A linha leva ao Detalhe, `/ui/sessions/<id>`. The last column is the icon that opens the session
// where it runs (C71, issue 285); its click stays in the cell and never navigates the row.

import { rememberSessions } from '../session-seed.js';
import { header, el, icon } from '../dom.js';
import { loading, error, errorBand, empty } from '../states.js';
import { attentionOf, reasonLabel } from '../attention.js';
import { stateOfSession, stateTag } from '../state-icon.js';
import { agentMonogram } from '../agent-monogram.js';
import { lastAvailability, loadAvailability, messageAction, useMessageStyle } from './session-message.js';
import { openAction } from '../open-action.js';
import { stateLabel } from '../state-labels.js';
import { newSessionButton } from '../new-session.js';
import { createMachineFilter, isRemote, itemHref, itemKey, machineLabel, machineTag, queryWithMachine, remoteParts, whereText } from '../machine-filter.js';

/* ADR-0028: the `status` and `order` values of `/api/sessions` (English since phase 2b of issue 173). issue 245: the
   old waiting pill split in two, "Precisam de você" (`blocked`, with the errors) and "Em pausa" (`idle`). Issue 759: the six
   filters of the new language; `abandoned` is still a valid `status` (a bookmark keeps filtering) but has no button, the
   sessions it holds show under Todas. The words are in state-labels.js: each is `[value, label]` and its label is read
   when the button is drawn. */
const pill = (value, id, options) => {
  const p = [value, null];
  Object.defineProperty(p, 1, { enumerable: true, get: () => stateLabel(id, options) });
  return p;
};
export const PILLS = [
  ['all', 'Todas'],
  pill('blocked', 'blocked', { plural: true }),
  pill('active', 'active', { plural: true }),
  pill('idle', 'idle', { plural: true }),
  pill('completed', 'completed', { plural: true }),
  pill('error', 'error'),
];

// O rótulo da ordem diz também o sentido: o ⇅ ao lado inverte.
const ORDERS = {
  activity: { desc: 'Atividade: recente', asc: 'Atividade: antiga' },
  duration: { desc: 'Duração: maior', asc: 'Duração: menor' },
  cost: { desc: 'Custo: maior', asc: 'Custo: menor' },
};

/** An old bookmark's `?status=waiting` opens the ones that need you. */
const STATUS_ALIASES = { waiting: 'blocked' };

/** The `status` values the query may carry: the six filters and the one bookmarks may still hold. */
const STATUSES = [...PILLS.map(([v]) => v), 'abandoned'];

const DEFAULTS = { status: 'all', search: '', dir: '', order: 'activity', direction: 'desc', page: 1 };

/**
 * The screen state from the query (`?status=waiting&page=2`); what is not valid falls back to the
 * default.
 */
export function stateFromQuery(query) {
  const p = new URLSearchParams(query);
  const page = Number(p.get('page'));
  const status = STATUS_ALIASES[p.get('status') ?? ''] ?? p.get('status');
  const order = p.get('order');
  return {
    status: STATUSES.includes(status) ? status : DEFAULTS.status,
    search: (p.get('search') ?? '').slice(0, 200),
    dir: (p.get('dir') ?? '').startsWith('/') ? p.get('dir') : '',
    order: Object.hasOwn(ORDERS, order ?? '') ? order : DEFAULTS.order,
    direction: p.get('direction') === 'asc' ? 'asc' : 'desc',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** A query do estado, só com o que difere do padrão (`''` quando é tudo padrão). */
export function queryFromState(state) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v !== DEFAULTS[k] && v !== '') p.set(k, String(v));
  const q = p.toString();
  return q ? `?${q}` : '';
}

/** A rota da API para o estado: sempre com status, ordem, sentido e página; `perPage` quando há. */
export function listRoute(state, perPage = null) {
  const p = new URLSearchParams({ status: state.status, order: state.order, direction: state.direction, page: String(state.page) });
  if (perPage) p.set('perPage', String(perPage));
  if (state.search.trim()) p.set('search', state.search.trim());
  if (state.dir) p.set('dir', state.dir);
  return `/api/sessions?${p}`;
}

/** "agora", "há 2 min", "há 1 h", "há 3 d". */
export function age(iso, now = Date.now()) {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!(min >= 1)) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.floor(min / 60)} h`;
  return `há ${Math.floor(min / (60 * 24))} d`;
}

/** "< 1 min", "12 min", "3 h 10", "2 d 4 h". */
export function duration(ms) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${String(min % 60).padStart(2, '0')}` : `${h} h`;
  return h % 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${Math.floor(h / 24)} d`;
}

/** "~US$ 1,84", ou "sem preço" quando o uso não tem preço. */
export function cost(usd) {
  if (usd === null || usd === undefined) return 'sem preço';
  return `~US$ ${usd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "1–10 de 12"; "0 de 0" sem nada. */
export function band({ total, page, perPage }) {
  if (!total) return '0 de 0';
  const from = (page - 1) * perPage + 1;
  return `${from}–${Math.min(total, page * perPage)} de ${total}`;
}

// Issue 279: the page size follows the window height, never below the old 10 nor above the API's 100.
export const MIN_ROWS = 10;
export const MAX_ROWS = 100;

/** How many rows of `rowHeight` fit in `available` pixels, between `min` and `max`. */
export function fitRows({ available, rowHeight, min = MIN_ROWS, max = MAX_ROWS }) {
  if (!(rowHeight > 0) || !Number.isFinite(available)) return min;
  return Math.min(max, Math.max(min, Math.floor(available / rowHeight)));
}

/** The page that still shows the first row of `page` once the page size goes from `perPage` to `nextPerPage`. */
export function pageKeepingRow({ page, perPage, nextPerPage }) {
  return Math.floor(((page - 1) * perPage) / nextPerPage) + 1;
}

/**
 * The page after a new page size. The first measure only corrects the CSS estimate: the page in the URL
 * was written under the real size (Voltar from the Detalhe, a reload), so it stays. A resize keeps the row.
 */
export function pageAfterRefit({ page, perPage, nextPerPage, first }) {
  return first ? page : pageKeepingRow({ page, perPage, nextPerPage });
}

/**
 * The room the rows have, in pixels: from the top of the rows to the bottom of the scrolling area,
 * minus its bottom padding, the gap and the pager below the table, and the card's bottom border.
 */
export function roomForRows({ rowsTop, areaBottom, paddingBottom, gap, footerHeight, border = 1 }) {
  return areaBottom - paddingBottom - rowsTop - gap - footerHeight - border;
}

/** O id curto da linha: os 8 primeiros de um UUID; o id inteiro nos outros casos. */
export function shortId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id) ? id.slice(0, 8) : id;
}

// As colunas, na ordem; a classe dá a largura de cada uma (sessions.css). The last two have no visible header
// (the Mensagem button and the open icon say what they are); the third item says so for the reader.
export const COLUMNS = [
  ['c-session', 'Sessão', true],
  ['c-status', 'Estado', true],
  ['c-machine', 'Máquina', true],
  ['c-duration', 'Duração', true],
  ['c-activity', 'Atualizada', true],
  ['c-message', 'Mensagem', false],
  ['c-open', 'Abrir', false],
];

/**
 * #61: whether a row can have a live process to message. A completed session ended its process, so
 * it is "sem processo vivo" without asking the core; the others are asked (only the rows on screen).
 */
export const mayHaveLiveProcess = (s) => s.status !== 'completed';

/** The Mensagem cell's content: the action, "sem processo vivo", or nothing while unknown. */
export function messageCell(s, availability, navigate) {
  // Issue 243: a remote session's process runs over there; this core has no inbox for it.
  if (isRemote(s)) return null;
  if (!mayHaveLiveProcess(s)) return el('span', { class: 'sm-none', title: 'Sem processo vivo nesta máquina' }, 'sem processo vivo');
  return messageAction(s.id, availability, navigate);
}

const COLOR = /^#[0-9a-f]{3,8}$/i;
const lastPart = (cwd) => cwd.replace(/\/+$/, '').split('/').pop() || cwd;

function selector(label, options, value, onChange) {
  const s = el('select', { class: 'field-sel', 'aria-label': label });
  for (const [v, text] of options) s.append(el('option', { value: v, selected: v === value }, text));
  s.addEventListener('change', () => onChange(s.value));
  return el('label', { class: 'field' }, s, icon('open-list'));
}

const KNOWN_STATUSES = ['active', 'waiting', 'completed', 'error', 'abandoned'];

/** The state cell: the tag of the Mural, icon and words, in the words of the mode (issue 759); no coloured pill. */
export function stateCell(status, attention) {
  if (!attentionOf(attention) && !KNOWN_STATUSES.includes(status)) return null;
  const { kind, label } = stateOfSession({ attention, status });
  return kind ? stateTag({ kind, label }) : null;
}

/** The monogram of the row: the initial of the provider that runs it (the list does not carry the agent's name). */
const PROVIDER_NAMES = { claude: 'Claude', codex: 'Codex' };
export const providerName = (s) => PROVIDER_NAMES[s?.identity?.provider] ?? 'Claude';

/**
 * The subtitle (C45): "15 sessões registradas · 3 na Workstation" with Todas; one machine chosen,
 * where they are ("nesta máquina", "na Workstation"); with no remote, as before.
 */
export function registeredText(list, { choice = 'all', machines = [] } = {}) {
  const n = list.registered;
  const base = n === 1 ? '1 sessão registrada' : `${n} sessões registradas`;
  if (!machines.some((m) => m.id !== 'local')) return base;
  if (choice === 'all') return [base, ...remoteParts(list.byMachine, machines, (b) => b.registered)].join(' · ');
  return `${base} ${whereText(choice, machines)}`;
}

/** "Precisam de você 5": the pill label and the count of `counts` (none when the core did not say). */
export function pillCount(counts, status) {
  const n = counts?.[status];
  return Number.isInteger(n) ? String(n) : null;
}

function account(c) {
  if (!c) return null;
  const dot = el('i', { class: 'account-dot' });
  if (COLOR.test(c.color)) dot.style.setProperty('--cor-da-conta', c.color);
  return el('span', { class: 'account' }, dot, c.label);
}

export async function mount(area, ctx) {
  // O estilo da tela, uma vez por página. Issue 279: the row count measures the styled screen, so the first
  // read waits for it.
  let sheet = document.querySelector('link[data-screen="sessions"]');
  if (!sheet) {
    sheet = el('link', { rel: 'stylesheet', href: '/ui/sessions.css', 'data-screen': 'sessions' });
    sheet.loaded = new Promise((done) => (sheet.onload = sheet.onerror = done));
    document.head.append(sheet);
  }
  useMessageStyle();

  let state = stateFromQuery(location.search);
  // Issue 243 (C45, C48): the machine filter, in the URL as `?machine=` beside the other filters.
  // Sessões places its own control (`placeMachineFilter`), so a choice redraws it at once, before the read.
  const machines = createMachineFilter(ctx, {
    onChange: () => {
      placeMachineFilter();
      change({ page: 1 });
    },
    reread: () => read(),
    onLayout: () => placeMachineFilter(),
  });
  const url = () => `${location.pathname}${queryWithMachine(queryFromState(state), machines.choice)}`;
  let last = null;
  let request = 0;
  // Issue 279: the rows that fit; measured again after the first table and on every resize.
  let perPage = MIN_ROWS;
  let fitted = false;

  const head = header({
    icon: 'sessions',
    title: 'Sessões',
    sub: null,
    actions: [el('button', { type: 'button', class: 'btn', onClick: () => read() }, icon('refresh'), 'Atualizar'), newSessionButton({ read: ctx.read, write: ctx.write })],
  });

  // ---------- filtros ----------
  const search = el('input', { type: 'search', placeholder: 'Buscar sessões…', 'aria-label': 'Buscar sessões', value: state.search, maxlength: 200 });
  let searchWait = null;
  search.addEventListener('input', () => {
    clearTimeout(searchWait);
    searchWait = setTimeout(() => change({ search: search.value, page: 1 }), 250);
  });
  const searchField = el('label', { class: 'field search' }, icon('search'), search);
  const dirSlot = el('span', { class: 'dir-slot' });
  const orderSlot = el('span', { class: 'order-slot' });
  const invert = el('button', { type: 'button', class: 'field square', 'aria-label': 'Inverter a ordem', title: 'Inverter a ordem', onClick: () => change({ direction: state.direction === 'desc' ? 'asc' : 'desc', page: 1 }) }, icon('invert'));
  const pills = el('div', { class: 'seg', role: 'group', 'aria-label': 'Estado' });
  for (const [v, label] of PILLS) pills.append(el('button', { type: 'button', 'data-status': v, onClick: () => change({ status: v, page: 1 }) }, label, el('b', { class: 'sessions-pill-count' })));
  // With a remote, the machine filter and the status pills share a row of their own (in 1100 they fold
  // into two); with none, the pills stay where they always were.
  const statusSlot = el('span', { class: 'sessions-status-slot' }, pills);
  const filters = el('div', { class: 'card filters' }, searchField, dirSlot, orderSlot, invert, statusSlot);

  function placeMachineFilter() {
    const control = machines.control();
    if (!control) {
      statusSlot.setAttribute('class', 'sessions-status-slot');
      statusSlot.replaceChildren(pills);
      return;
    }
    statusSlot.setAttribute('class', 'sessions-status-slot sessions-machine-row');
    statusSlot.replaceChildren(control, el('span', { class: 'sessions-status-group' }, el('span', { class: 'sessions-filter-label' }, 'Estado'), pills));
  }

  const body = el('div', { class: 'sessions-body' }, loading({ label: 'Carregando as sessões' }));
  area.replaceChildren(head, machines.notices, filters, body);

  function drawFilters(directories, counts = null) {
    const dirs = state.dir && !directories.includes(state.dir) ? [...directories, state.dir] : directories;
    dirSlot.replaceChildren(selector('Diretório', [['', 'Todos os projetos'], ...dirs.map((d) => [d, lastPart(d)])], state.dir, (dir) => change({ dir, page: 1 })));
    orderSlot.replaceChildren(selector('Ordenar por', Object.entries(ORDERS).map(([v, r]) => [v, r[state.direction]]), state.order, (order) => change({ order: order, page: 1 })));
    for (const b of pills.children) {
      b.setAttribute('aria-pressed', String(b.dataset.status === state.status));
      const n = b.querySelector('.sessions-pill-count');
      const count = pillCount(counts, b.dataset.status);
      if (n) n.replaceChildren(count === null ? '' : ` ${count}`);
    }
  }

  /** The rows that fit now: real row heights once a table is on screen, the CSS sizes before that. */
  function rowsThatFit() {
    const scroller = area.closest('.cc-main');
    if (!scroller || !body.isConnected) return perPage;
    const css = getComputedStyle(body);
    const px = (name) => parseFloat(css.getPropertyValue(name)) || 0;
    const tbody = body.querySelector('.table tbody');
    const rows = tbody ? [...tbody.rows] : [];
    const top = scroller.getBoundingClientRect().top - scroller.scrollTop;
    const rowsTop = tbody ? tbody.getBoundingClientRect().top : body.getBoundingClientRect().top + px('--sessions-head-height');
    const rowHeight = rows.length ? rows.reduce((sum, r) => sum + r.getBoundingClientRect().height, 0) / rows.length : px('--sessions-row-height');
    const available = roomForRows({
      rowsTop: rowsTop - top,
      areaBottom: scroller.clientHeight,
      paddingBottom: parseFloat(getComputedStyle(scroller).paddingBottom) || 0,
      gap: px('row-gap'),
      footerHeight: body.querySelector('.sessions-footer')?.getBoundingClientRect().height || px('--sessions-footer-height'),
    });
    return fitRows({ available, rowHeight });
  }

  /** A new page size keeps the first row on screen: the page follows the row, not its number. */
  function refit() {
    const first = !fitted;
    fitted = true;
    const next = rowsThatFit();
    if (next === perPage) return false;
    const page = pageAfterRefit({ page: state.page, perPage, nextPerPage: next, first });
    perPage = next;
    if (page !== state.page) {
      state = { ...state, page };
      history.replaceState(null, '', url());
    }
    return true;
  }

  // The scrolling area changes size with the window (and the filters wrap with its width).
  let resizeWait = null;
  const resizing = new ResizeObserver(() => {
    clearTimeout(resizeWait);
    resizeWait = setTimeout(() => {
      if (last?.items.length && refit()) read();
    }, 150);
  });
  resizing.observe(area.closest('.cc-main') ?? area);

  function change(partial) {
    state = { ...state, ...partial };
    history.replaceState(null, '', url());
    read();
  }

  // ---------- tabela ----------
  // #61: the Mensagem cell of each row on screen, filled as its availability comes back.
  let messageCells = new Map();
  const fillMessage = (s, td, a) => {
    const content = messageCell(s, a, ctx.navigate);
    td.replaceChildren(...(content ? [content] : []));
  };
  function askAvailability(items) {
    const ids = items.filter((s) => !isRemote(s) && mayHaveLiveProcess(s)).map((s) => s.id);
    loadAvailability(ctx.read, ids, (id, a) => {
      const cell = messageCells.get(itemKey({ id }));
      if (cell) fillMessage(cell.s, cell.td, a);
    }).catch(() => {});
  }

  /** The secondary line of the Sessão cell: why a pause (when it is one), the folder, the short id and the account. */
  function metaOf(s) {
    const a = attentionOf(s.attention);
    const why = a?.level === 'idle' ? reasonLabel(a) : null;
    const parts = [why ? el('span', { class: 'sessions-why' }, why) : null, s.cwd ? el('span', { class: 'sessions-folder', title: s.cwd }, lastPart(s.cwd)) : null, el('span', { class: 'mono sessions-id' }, shortId(s.id)), account(s.account)];
    return el('small', { class: 'sessions-meta' }, ...parts.filter(Boolean));
  }

  function machineCell(s) {
    if (isRemote(s)) return machineTag(s);
    const m = machineLabel(s);
    return el('span', { class: 'sessions-machine' }, icon(m.icon), m.text);
  }

  function row(s) {
    // Issue 243 (C49): a remote session opens its Detail with `?machine=<id>`.
    const target = itemHref(s);
    const tr = el(
      'tr',
      { class: 'session-row', 'data-key': itemKey(s) },
      // Issue 759 (A9): the title is the session's name; the folder and the id are the secondary line.
      el('td', { class: 'nm' }, el('div', { class: 'sessions-who' }, agentMonogram(providerName(s)), el('div', { class: 'sessions-text' }, el('a', { href: target, title: s.title }, el('b', {}, s.title)), metaOf(s)))),
      el('td', { class: 'st' }, stateCell(s.status, s.attention)),
      el('td', { class: 'mach' }, machineCell(s)),
      // Issue 759 (M9): "rodando ·" is plain text, never a state colour: a paused session is not working.
      el('td', { class: 'mono dur' }, s.running ? el('span', { class: 'sessions-running' }, 'rodando ·') : null, s.running ? ' ' : null, el('span', {}, duration(s.durationMs))),
      el('td', { class: 'when', title: new Date(s.lastActivity).toLocaleString('pt-BR') }, age(s.lastActivity)),
      messageTd(s),
      // Empty when there is nothing to open: the column keeps its width, the others stay aligned.
      el('td', { class: 'sessions-open' }, openAction({ id: s.id, open: s.open, machine: s.machine }, { size: 'icon', write: ctx.write, machine: s.machine?.label ?? null })),
    );
    tr.addEventListener('click', (ev) => {
      if (ev.target instanceof Element && ev.target.closest('a')) return;
      ctx.navigate(target);
    });
    return tr;
  }

  function messageTd(s) {
    const td = el('td', { class: 'msg' });
    fillMessage(s, td, isRemote(s) ? undefined : lastAvailability(s.id));
    messageCells.set(itemKey(s), { s, td });
    return td;
  }

  function table(list) {
    return el(
      'div',
      { class: 'card' },
      el('table', { class: 'table' }, el('thead', {}, el('tr', {}, ...COLUMNS.map(([className, c, shown]) => el('th', { scope: 'col', class: className }, shown ? c : el('span', { class: 'cc-sr-only' }, c))))), el('tbody', {}, ...list.items.map(row))),
    );
  }

  function footer(list) {
    return el(
      'div',
      { class: 'sessions-footer' },
      el('span', {}, band(list)),
      el(
        'span',
        { class: 'pages' },
        el('button', { type: 'button', class: 'btn outline', disabled: list.page <= 1, onClick: () => change({ page: list.page - 1 }) }, 'Anterior'),
        el('button', { type: 'button', class: 'btn outline', disabled: list.page >= list.pages, onClick: () => change({ page: list.page + 1 }) }, 'Próxima'),
      ),
    );
  }

  function draw(list) {
    machines.update(list);
    placeMachineFilter();
    // A página pedida pode ter sumido (a lista encolheu): fica a que o núcleo devolveu.
    if (list.page !== state.page) {
      state = { ...state, page: list.page };
      history.replaceState(null, '', url());
    }
    drawFilters(list.directories, list.counts);
    if (list.items.length) {
      // Issue 765: the detail of a session opens with its header from what this list showed.
      rememberSessions(list.items);
      messageCells = new Map();
      body.replaceChildren(table(list), footer(list));
      askAvailability(list.items);
      // The first table measures the real rows; a different count reads the page again, once.
      if (!fitted && refit()) read();
      return;
    }
    // C48: the chosen remote is down; the notice above already says why the list is empty.
    if (machines.chosenDown()) return void body.replaceChildren();
    const filtering = state.status !== 'all' || state.search.trim() || state.dir;
    body.replaceChildren(
      filtering
        ? empty({ title: 'Nenhuma sessão com esses filtros', text: 'Mude a busca, o diretório ou o status.', action: { label: 'Limpar os filtros', onClick: () => ((search.value = ''), change({ status: 'all', search: '', dir: '', page: 1 })) } })
        : empty({ icon: 'sessions', title: 'Nenhuma sessão ainda', text: `As sessões do Claude Code ${machines.hasRemotes() ? whereText(machines.choice, machines.machines(), { form: 'of' }) : 'desta máquina'} aparecem aqui assim que o núcleo as vê.` }),
    );
  }

  async function read() {
    const mine = ++request;
    try {
      const list = await ctx.read(machines.route(listRoute(state, perPage)));
      if (mine !== request) return;
      last = list;
      draw(list);
    } catch (e) {
      if (e?.name === 'AbortError' || mine !== request) return;
      if (machines.recover(e)) return;
      // Com uma lista na tela, ela fica e a faixa avisa; sem lista, o erro ocupa o lugar.
      if (last) {
        body.querySelector('.error-band')?.remove();
        body.prepend(errorBand({ title: 'Não deu para atualizar.', text: e.message, action: { label: 'Tentar de novo', onClick: () => read() } }));
      } else body.replaceChildren(error({ text: e.message, retry: () => read() }));
    }
  }

  // Ao vivo: qualquer mudança de sessão relê a página atual, no máximo uma vez por segundo.
  let liveWait = null;
  ctx.onChange(() => {
    if (liveWait) return;
    liveWait = setTimeout(() => {
      liveWait = null;
      read();
    }, 1000);
  });
  ctx.onRestart(() => read());

  drawFilters([]);
  await sheet.loaded;
  // Before the first table, the CSS sizes give the count, so the first read already fills the window.
  perPage = rowsThatFit();
  await read();
  return () => {
    resizing.disconnect();
    clearTimeout(resizeWait);
    clearTimeout(searchWait);
    clearTimeout(liveWait);
  };
}
