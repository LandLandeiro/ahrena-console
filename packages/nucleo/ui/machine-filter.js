// The sessions of every machine on the list screens (issue 243, wireframes C45 to C49): the "Máquina"
// filter, the tag of a remote item, the neutral notice of a remote that is down and the keys that keep
// two machines' ids apart. Sessões, Mural ao vivo, Kanban, Feed, Histórico and Dashboard use it, and the
// session Detail uses the URL and the notice.
//
// - The list routes are always read with `?machine=` (`all` by default, `local` or a remote's id); the
//   answer carries `machines: [{ id, label, state, reason, lastReadAt }]` and each item its `machine`.
// - The choice lives in the /ui URL as `?machine=` (`all` is left out), changed with
//   `history.replaceState` like the other filters. The last choice is also kept in memory, so a link
//   between the six screens (the sidebar, "Ver em Sessões") opens on the same machine.
// - With no remote configured, nothing shows: no filter, no tag, no notice.
// - A remote that is down only says so in the neutral band (C48), never the red error band: its items
//   are simply absent from the answer.
// - The remote items change nothing on `/api/changes` (it reports this machine only), so while a
//   remote is known the screen re-reads every `REMOTE_REREAD_MS`, and soon after an `alert` or a
//   `<id>:machine-unreachable` change.
//
// Everything above the "DOM" line is pure: the tests import it directly. The styles are in
// `machine-filter.css` (classes `mf-`), loaded once by `index.html`.

import { el, icon } from './dom.js';

export const ALL = 'all';
export const LOCAL = 'local';
/** The /ui URL parameter and the API one. */
export const MACHINE_PARAM = 'machine';
/** The machine id of the core (src/telemetry/model.ts `MACHINE_ID`). */
const MACHINE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STATES = new Set(['connected', 'unreachable', 'incompatible-version', 'not-configured']);
/** How often a screen re-reads while a remote is known (the same pace as the machine screen). */
export const REMOTE_REREAD_MS = 30_000;
/** A burst of machine changes becomes one re-read. */
const CHANGE_WAIT_MS = 1000;
/** What this machine is called on screen. */
export const LOCAL_LABEL = 'Esta máquina';
export const MACHINES_ROUTE = '/api/machines';

// ---------- The choice ----------

/** A valid choice: `all`, `local` or a remote id; anything else is `null`. */
export function validChoice(v) {
  if (v === ALL || v === LOCAL) return v;
  return typeof v === 'string' && MACHINE_ID.test(v) ? v : null;
}

/** The choice in a query string (`?machine=workstation`), or `null` when it has none (or a bad one). */
export function machineFromQuery(search) {
  return validChoice(new URLSearchParams(search ?? '').get(MACHINE_PARAM));
}

let remembered = ALL;

/** The choice a screen opens with: the URL's, or else the last one made on any of the six screens. */
export function initialChoice(search) {
  return machineFromQuery(search) ?? remembered;
}

/** Keeps the choice for the next screen. */
export function rememberChoice(choice) {
  remembered = validChoice(choice) ?? ALL;
}

/** Forgets the choice (tests). */
export function resetMachineChoice() {
  remembered = ALL;
}

/**
 * A query string with some parameters changed (`null` or `''` removes one), the others kept as they are.
 * Returns `''` or `?a=b`.
 */
export function withQuery(search, changes) {
  const p = new URLSearchParams(search ?? '');
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined || v === '') p.delete(k);
    else p.set(k, String(v));
  }
  const q = p.toString();
  return q ? `?${q}` : '';
}

/** The /ui query with the machine choice: `all` is the default and stays out of the URL. */
export function queryWithMachine(search, choice) {
  return withQuery(search, { [MACHINE_PARAM]: choice === ALL ? null : validChoice(choice) });
}

/** An API route with `machine=<choice>` (the list routes always carry it; `all` by default). */
export function routeWithMachine(route, choice) {
  const text = String(route);
  const i = text.indexOf('?');
  const path = i < 0 ? text : text.slice(0, i);
  const query = i < 0 ? '' : text.slice(i + 1);
  const value = validChoice(choice) ?? ALL;
  // The rest of the query stays byte for byte as the screen wrote it; only `machine` is set.
  if (new URLSearchParams(query).has(MACHINE_PARAM)) return `${path}${withQuery(query, { [MACHINE_PARAM]: value })}`;
  return `${path}?${query ? `${query}&` : ''}${MACHINE_PARAM}=${encodeURIComponent(value)}`;
}

// ---------- The items ----------

/** The machine id of an item (`local` when it has none). */
export const machineIdOf = (item) => (typeof item?.machine?.id === 'string' && item.machine.id ? item.machine.id : LOCAL);

/** Whether an item comes from a remote machine. */
export const isRemote = (item) => machineIdOf(item) !== LOCAL;

/** The key of an id on a machine: ids repeat across machines, so every map, set and DOM key uses it. */
export const machineKey = (machineId, id) => `${machineId || LOCAL}:${id}`;

/** The key of an item (`<machine>:<id>`); `idOf` picks which id (the session's, the event's…). */
export const itemKey = (item, idOf = (i) => i?.id) => machineKey(machineIdOf(item), idOf(item));

/** The Detail of a session: `/ui/sessions/<id>`, with `?machine=<id>` when it runs on a remote. */
export function sessionHref(id, machineId = LOCAL) {
  const base = `/ui/sessions/${encodeURIComponent(id)}`;
  return machineId && machineId !== LOCAL && MACHINE_ID.test(machineId) ? `${base}?${MACHINE_PARAM}=${encodeURIComponent(machineId)}` : base;
}

/** The Detail of an item's session (`sessionId` picks the id when the item is not the session). */
export const itemHref = (item, sessionId = item?.id) => sessionHref(sessionId, machineIdOf(item));

// ---------- The machines ----------

/** The `machines` of an answer, checked: `[{ id, label, state, reason, lastReadAt }]`, this machine first. */
export function normalizeMachines(list) {
  const out = [];
  const seen = new Set();
  for (const m of Array.isArray(list) ? list.slice(0, 50) : []) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !(m.id === LOCAL || MACHINE_ID.test(m.id)) || seen.has(m.id)) continue;
    seen.add(m.id);
    const label = m.id === LOCAL ? LOCAL_LABEL : typeof m.label === 'string' && m.label.trim() ? m.label.trim().slice(0, 40) : 'Máquina remota';
    const lastReadAt = typeof m.lastReadAt === 'string' && Number.isFinite(Date.parse(m.lastReadAt)) ? m.lastReadAt : null;
    out.push({ id: m.id, label, state: m.id === LOCAL ? 'connected' : STATES.has(m.state) ? m.state : 'unreachable', reason: typeof m.reason === 'string' ? m.reason : null, lastReadAt });
  }
  return out.sort((a, b) => (a.id === LOCAL ? -1 : b.id === LOCAL ? 1 : 0));
}

/** The remote machines of a list. */
export const remotesOf = (machines) => (machines ?? []).filter((m) => m.id !== LOCAL);

/** Whether a remote is not answering (its items are absent from the lists). */
export const isDown = (m) => m.id !== LOCAL && m.state !== 'connected';

/** The remotes that are down and concern the choice: every one with Todas, the chosen one, none with local. */
export function downFor(machines, choice) {
  if (choice === LOCAL) return [];
  return remotesOf(machines).filter((m) => isDown(m) && (choice === ALL || m.id === choice));
}

/** "há 14 min", "há 2 h", "há 3 d"; under a minute, "há menos de 1 min". */
export function sinceText(iso, now = Date.now()) {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!(min >= 1)) return 'há menos de 1 min';
  if (min < 60) return `há ${min} min`;
  if (min < 48 * 60) return `há ${Math.floor(min / 60)} h`;
  return `há ${Math.floor(min / 1440)} d`;
}

const two = (n) => String(n).padStart(2, '0');

/**
 * The C48 notice of a remote that is down: "Workstation sem conexão desde 22:41 (há 14 min)." and
 * "As sessões de lá voltam quando ela responder." Without a last read, just "sem conexão".
 */
export function downText(machine, now = Date.now()) {
  const at = machine.lastReadAt ? new Date(machine.lastReadAt) : null;
  const since = at && !Number.isNaN(at.getTime()) ? ` desde ${two(at.getHours())}:${two(at.getMinutes())} (${sinceText(machine.lastReadAt, now)})` : '';
  return { title: `${machine.label} sem conexão${since}.`, text: 'As sessões de lá voltam quando ela responder.' };
}

/** The "3 na Workstation" pieces: how many of `count(entry)` each remote of `byMachine` has (zeros left out). */
export function remoteParts(byMachine, machines, count) {
  const labels = new Map((machines ?? []).map((m) => [m.id, m.label]));
  const out = [];
  for (const b of Array.isArray(byMachine) ? byMachine : []) {
    if (!b || b.id === LOCAL || !labels.has(b.id)) continue;
    const n = Number(count(b));
    if (Number.isInteger(n) && n > 0) out.push(`${n} na ${labels.get(b.id)}`);
  }
  return out;
}

const WHERE_FORMS = {
  // "Um card por sessão aberta, nas duas máquinas"
  in: { local: 'nesta máquina', one: 'na', all: 'nas' },
  // "As sessões das duas máquinas por status"
  of: { local: 'desta máquina', one: 'da', all: 'das' },
  // "Abra uma sessão em uma das máquinas e ela aparece aqui"
  any: { local: 'nesta máquina', one: 'na', all: null },
};

/**
 * Where the screen's items come from, for the subtitles and the empty states. `form`: `in` ("nas duas
 * máquinas", "nesta máquina", "na Workstation"), `of` ("das duas máquinas", "desta máquina", "da
 * Workstation") or `any` (as `in`, but Todas is "em uma das máquinas").
 */
export function whereText(choice, machines, { form = 'in' } = {}) {
  const w = WHERE_FORMS[form] ?? WHERE_FORMS.in;
  if (choice === LOCAL) return w.local;
  if (choice !== ALL) return `${w.one} ${(machines ?? []).find((m) => m.id === choice)?.label ?? 'máquina remota'}`;
  if (!w.all) return 'em uma das máquinas';
  const n = (machines ?? []).length;
  return n === 2 ? `${w.all} duas máquinas` : `${w.all} ${n} máquinas`;
}

/** The items of `/api/attention` (this machine's have no `machine`) that belong to the choice. */
export function attentionForChoice(attention, choice) {
  if (!attention || choice === ALL) return attention;
  const items = (attention.items ?? []).filter((i) => machineIdOf(i) === choice);
  // The route's counts cover every machine: without them, the screen counts the items it kept.
  return { ...attention, items, blocked: undefined, idle: undefined };
}

/**
 * The numbers of the machine menu, from what the last answer holds: `all` (the total on screen) and one per
 * machine that answered. A machine that is down has none; with one machine chosen the answer holds only it, so
 * only its number is known.
 */
export function machineCounts(items, machines, choice) {
  const list = items ?? [];
  const known = machines ?? [];
  if (choice !== ALL) return known.some((m) => m.id === choice && isDown(m)) ? {} : { [choice]: list.length };
  const out = { all: list.length };
  for (const m of known) if (!isDown(m)) out[m.id] = list.filter((i) => machineIdOf(i) === m.id).length;
  return out;
}

/** The Detail's 503 of a remote that does not answer. */
export const isMachineUnreachable = (e) => e?.status === 503 && e?.body?.error === 'machine-unreachable';

/** The 400 of a choice the core does not know (a remote removed from machines.json). */
export const isUnknownMachine = (e) => e?.status === 400 && /^machine:/.test(String(e?.body?.error ?? e?.message ?? ''));

/** "há 6 s", "há 2 min": the age of the Detail's last read of a remote. */
export function readAgeText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  return `há ${Math.floor(s / 3600)} h`;
}

/** Whether a batch of `/api/changes` can change a remote's items or state (`alert`, `<id>:machine-unreachable`). */
export function touchesRemotes(changes) {
  return (changes ?? []).some((c) => c && (c.type === 'alert' || (typeof c.key === 'string' && c.key.endsWith(':machine-unreachable'))));
}

// ---------- DOM ----------

/**
 * The tag of a remote item (C45 to C47): the muted server icon and the label; `iconOnly` keeps the icon
 * with the label in the tooltip (Kanban card, Dashboard inbox and activity). `null` for a local item.
 */
export function machineTag(item, { iconOnly = false } = {}) {
  if (!isRemote(item)) return null;
  const label = typeof item.machine.label === 'string' && item.machine.label ? item.machine.label : 'Máquina remota';
  if (iconOnly) return el('span', { class: 'mf-tag mf-tag-icon', title: label, 'aria-label': label, role: 'img' }, icon('server'));
  return el('span', { class: 'mf-tag' }, icon('server'), el('span', {}, label));
}

/** What an item's machine is called and drawn as: a laptop for this machine, a server for a remote. */
export function machineLabel(item) {
  if (!isRemote(item)) return { remote: false, icon: 'laptop', text: LOCAL_LABEL };
  const label = typeof item.machine.label === 'string' && item.machine.label ? item.machine.label : 'Máquina remota';
  return { remote: true, icon: 'server', text: label };
}

/** The machine of an item with its icon and its name written, for the foot of a card and a row. */
export function machineMark(item) {
  const m = machineLabel(item);
  return el('span', { class: 'mf-mach', 'data-machine-kind': m.remote ? 'remote' : 'local' }, icon(m.icon), el('span', {}, m.text));
}

/** The C48 band: neutral, the wifi-off icon, the text and "Ver a <label>" to the machine screen. */
export function downNotice(machine, { now = Date.now(), title = null } = {}) {
  const t = downText(machine, now);
  return el(
    'div',
    { class: 'mf-notice', role: 'status', 'data-machine': machine.id },
    el('span', { class: 'mf-notice-icon' }, icon('wifi-off')),
    el('p', {}, el('b', {}, title ?? t.title), ` ${t.text}`),
    el('a', { class: 'btn outline mf-notice-link', href: `/ui/machines/${encodeURIComponent(machine.id)}` }, `Ver a ${machine.label}`, icon('chevron-right')),
  );
}

/** The segmented control: Todas · Esta máquina · one per remote (grey with wifi-off when it is down). */
export function machineControl(machines, choice, onChoose) {
  const options = [
    { id: ALL, label: 'Todas', iconName: null, down: false },
    ...normalizeMachines(machines).map((m) => ({ id: m.id, label: m.label, iconName: m.id === LOCAL ? 'monitor' : isDown(m) ? 'wifi-off' : 'server', down: isDown(m) })),
  ];
  const group = el(
    'div',
    { class: 'mf-seg', role: 'group', 'aria-label': 'Máquina' },
    ...options.map((o) =>
      el(
        'button',
        { type: 'button', class: o.down ? 'mf-off' : null, 'data-machine': o.id, 'aria-pressed': o.id === choice ? 'true' : 'false', title: o.down ? `${o.label}: sem conexão` : null, onClick: () => onChoose(o.id) },
        o.iconName ? icon(o.iconName) : null,
        o.label,
      ),
    ),
  );
  return el('div', { class: 'mf-filter' }, el('span', { class: 'mf-label' }, 'Máquina'), group);
}

const ALL_LABEL = 'Todas as máquinas';
let menuSerial = 0;

/** The icon of an option of the menu: the grid for all, the monitor for this machine, the server, or wifi-off when it is down. */
const menuIcon = (id, down) => (down ? 'wifi-off' : id === ALL ? 'wall' : id === LOCAL ? 'monitor' : 'server');

/**
 * The machine filter as a button with a menu (ADR-0028). The button, the panel and the options live as long as the
 * screen: `draw(machines, choice, counts)` reconciles the options by machine, so the focus is never lost to a redraw.
 */
function createMenu({ pick, signal, fallbackFocus }) {
  const id = `mf-menu-${++menuSerial}`;
  const button = el('button', { type: 'button', class: 'btn outline mf-menu-button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-machine-menu': '' });
  const panel = el('div', { id, class: 'mf-menu-panel', role: 'menu', 'aria-label': 'Máquina', hidden: true });
  const root = el('div', { class: 'mf-menu' }, button, panel);
  let items = new Map();
  const isOpen = () => !panel.hidden;
  const outside = (ev) => {
    if (!root.contains(ev.target)) close(false);
  };

  function close(returnFocus) {
    if (!isOpen()) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-controls');
    document.removeEventListener('click', outside);
    if (returnFocus) button.focus({ preventScroll: true });
  }

  function open(where) {
    if (!isOpen()) {
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-controls', id);
      document.addEventListener('click', outside);
    }
    const list = [...items.values()].map((v) => v.node);
    const target = where === 'last' ? list.at(-1) : where === 'first' ? list[0] : (list.find((n) => n.getAttribute('aria-checked') === 'true') ?? list[0]);
    target?.focus({ preventScroll: true });
  }

  function makeItem(machine) {
    const parts = { icon: el('span', { class: 'mf-menu-icon' }), label: el('span', { class: 'mf-menu-label' }), off: el('span', { class: 'mf-menu-off' }, ' sem conexão'), count: el('span', { class: 'mf-menu-count' }), check: el('span', { class: 'mf-menu-check' }, icon('done')) };
    const node = el('button', { type: 'button', role: 'menuitemradio', tabindex: '-1', class: 'mf-menu-item', 'data-machine': machine, 'aria-checked': 'false', onClick: () => (close(true), pick(machine)) }, parts.icon, parts.label, parts.count, parts.check);
    return { node, parts };
  }

  function draw(entries, choice, counts) {
    const focused = [...items].find(([, v]) => v.node === document.activeElement)?.[0] ?? null;
    const order = [...items.keys()];
    const next = new Map();
    for (const e of entries) {
      const item = items.get(e.id) ?? makeItem(e.id);
      const { node, parts } = item;
      if (node.getAttribute('data-icon') !== menuIcon(e.id, e.down)) {
        node.setAttribute('data-icon', menuIcon(e.id, e.down));
        parts.icon.replaceChildren(icon(menuIcon(e.id, e.down)));
      }
      if (parts.label.textContent !== e.label) parts.label.textContent = e.label;
      if (e.down && !parts.off.parentNode) node.insertBefore(parts.off, parts.count);
      else if (!e.down && parts.off.parentNode) parts.off.remove();
      const n = counts[e.id];
      const count = Number.isInteger(n) && !e.down ? String(n) : '';
      if (parts.count.textContent !== count) parts.count.textContent = count;
      node.setAttribute('aria-checked', e.id === choice ? 'true' : 'false');
      if (e.down) node.setAttribute('class', 'mf-menu-item mf-off');
      else node.setAttribute('class', 'mf-menu-item');
      next.set(e.id, item);
    }
    const nodes = [...next.values()].map((v) => v.node);
    if (nodes.length !== panel.children.length || nodes.some((n, i) => panel.children[i] !== n)) panel.replaceChildren(...nodes);
    items = next;
    const chosen = entries.find((e) => e.id === choice);
    const name = chosen?.label ?? (choice === LOCAL ? LOCAL_LABEL : choice === ALL ? ALL_LABEL : 'Máquina remota');
    button.replaceChildren(...[icon(menuIcon(choice, chosen?.down)), el('span', { class: 'mf-menu-label' }, name), chosen?.down ? el('span', { class: 'mf-menu-off' }, ' sem conexão') : null, icon('chevron-down')].filter(Boolean));
    if (focused === null || !isOpen()) return;
    // The option under the focus is gone: the next one, else the one before it, else the button.
    const at = order.indexOf(focused);
    const sensible = [focused, ...order.slice(at + 1), ...order.slice(0, at).reverse()].find((k) => next.has(k));
    const target = sensible ? next.get(sensible).node : button;
    if (document.activeElement !== target) target.focus({ preventScroll: true });
  }

  function keydown(ev) {
    const list = [...items.values()].map((v) => v.node);
    if (!isOpen()) {
      if (ev.target === button && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
        ev.preventDefault();
        open(ev.key === 'ArrowDown' ? 'first' : 'last');
      }
      return;
    }
    const at = list.indexOf(document.activeElement);
    const go = (i) => (ev.preventDefault(), list[(i + list.length) % list.length]?.focus({ preventScroll: true }));
    if (ev.key === 'ArrowDown') go(at + 1);
    else if (ev.key === 'ArrowUp') go(at < 0 ? -1 : at - 1);
    else if (ev.key === 'Home') go(0);
    else if (ev.key === 'End') go(-1);
    else if (ev.key === 'Escape') (ev.preventDefault(), close(true));
    else if (ev.key === 'Tab') close(true);
  }

  button.addEventListener('click', () => (isOpen() ? close(false) : open('checked')));
  root.addEventListener('keydown', keydown);
  signal?.addEventListener?.('abort', () => close(false));

  return {
    root,
    button,
    draw,
    close,
    /** Whether the focus is inside the control, to put it somewhere when the control goes away. */
    holdsFocus: () => root.contains(document.activeElement),
    fallbackFocus,
  };
}

/**
 * The filter of one screen. `onChange(choice)` re-reads the screen with the new choice; `reread()` is
 * the screen's quiet re-read (the periodic one and the machine changes). A screen with a clock of its own
 * passes `periodic: false` (no 30 s timer here), and one that already re-reads on every change passes
 * `watchChanges: false` (no second debounce on the machine changes). `onLayout()` is called when
 * the known machines change outside a read (the screen redraws its last answer). Returns:
 * - `choice`; `route(apiRoute)`: the route with `machine=`;
 * - `update(body)`: takes the answer's `machines` and redraws the control and the notices;
 * - `row`: the control on its own row; `control()`: a new control for a screen that places it itself
 *   (Sessões); `notices`: the slot of the C48 notices;
 * - `parts()`: `[row, notices]` when there is a remote, else `[]` (the screen exactly as before);
 * - `hasRemotes()`, `machines()`, `chosenDown()` (the chosen remote is down: the empty list says no more);
 * - `recover(error)`: a choice the core no longer knows goes back to Todas (true when it did).
 *
 * With `menu: { itemsOf(body) }` (the wall, ADR-0028) the control is a button with a menu and a number per machine, from the
 * items `itemsOf` takes of an answer; `row` holds it (the screen places it), `parts()` is the notices only, and when the
 * last remote goes while the focus is in it, `fallbackFocus()` says where the focus goes.
 */
export function createMachineFilter(ctx, { onChange = () => {}, reread = onChange, onLayout = () => {}, periodic = true, watchChanges = true, menu = null, fallbackFocus = () => null } = {}) {
  let choice = initialChoice(globalThis.location?.search ?? '');
  rememberChoice(choice);
  let known = [];
  let timer = null;
  let wait = null;

  const row = el('div', { class: 'mf-row' });
  const notices = el('div', { class: 'mf-notices' });
  // Nothing on screen until an answer says there is a remote.
  row.hidden = true;
  notices.hidden = true;
  const menuUi = menu ? createMenu({ pick: (id) => choose(id), signal: ctx.signal, fallbackFocus }) : null;
  if (menuUi) row.append(menuUi.root);
  // The items of the last answer, for the numbers of the menu; forgotten when the choice changes (they were of the old one).
  let lastItems = null;

  function writeUrl() {
    const l = globalThis.location;
    if (!l || typeof globalThis.history?.replaceState !== 'function') return;
    globalThis.history.replaceState(globalThis.history.state ?? null, '', `${l.pathname}${queryWithMachine(l.search, choice)}${l.hash ?? ''}`);
  }
  // The URL says the choice even when it came from memory, so a reload keeps it.
  if (choice !== ALL && machineFromQuery(globalThis.location?.search ?? '') !== choice) writeUrl();

  function choose(next) {
    const fresh = validChoice(next) ?? ALL;
    if (fresh === choice) return;
    choice = fresh;
    rememberChoice(choice);
    writeUrl();
    lastItems = null;
    draw();
    onChange(choice);
  }

  function draw() {
    const remotes = remotesOf(known).length > 0;
    // ADR-0028: the control is drawn again on every answer; the focus stays on the same machine.
    const held = !menuUi && row.contains(document.activeElement) ? document.activeElement.getAttribute('data-machine') : null;
    // ADR-0028: the link of a notice is found again by the machine of its notice; with the notice gone, the focus goes to that machine's segment.
    const heldNotice = notices.contains(document.activeElement) ? (document.activeElement.closest?.('.mf-notice')?.getAttribute('data-machine') ?? null) : null;
    if (menuUi) drawMenu(remotes);
    else row.replaceChildren(...(remotes ? [machineControl(known, choice, choose)] : []));
    row.hidden = !remotes;
    const segment = (id) => (menuUi ? menuUi.button : [...row.querySelectorAll('[data-machine]')].find((b) => b.getAttribute('data-machine') === id));
    if (held !== null) segment(held)?.focus({ preventScroll: true });
    const now = Date.now();
    const down = remotes ? downFor(known, choice) : [];
    notices.replaceChildren(...down.map((m) => downNotice(m, { now })));
    notices.hidden = down.length === 0;
    if (heldNotice !== null) {
      const notice = [...notices.querySelectorAll('.mf-notice')].find((n) => n.getAttribute('data-machine') === heldNotice);
      (notice?.querySelector('.mf-notice-link') ?? segment(heldNotice))?.focus({ preventScroll: true });
    }
    tick();
  }

  function drawMenu(remotes) {
    if (!remotes) {
      const inside = menuUi.holdsFocus();
      menuUi.close(false);
      if (inside) menuUi.fallbackFocus()?.focus?.({ preventScroll: true });
      return;
    }
    const entries = [{ id: ALL, label: ALL_LABEL, down: false }, ...normalizeMachines(known).map((m) => ({ id: m.id, label: m.label, down: isDown(m) }))];
    menuUi.draw(entries, choice, lastItems ? machineCounts(lastItems, known, choice) : {});
  }

  /** The periodic re-read runs only while a remote is known. */
  function tick() {
    const want = periodic && remotesOf(known).length > 0 && !ctx.signal?.aborted;
    if (want && !timer) {
      timer = setInterval(() => reread(), REMOTE_REREAD_MS);
      timer?.unref?.();
    } else if (!want && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function merge(list, replace) {
    const fresh = normalizeMachines(list);
    if (replace) known = fresh;
    else {
      const byId = new Map(known.map((m) => [m.id, m]));
      for (const m of fresh) byId.set(m.id, m);
      known = normalizeMachines([...byId.values()]);
    }
  }

  if (watchChanges) ctx.onChange?.((changes) => {
    if (!remotesOf(known).length || !touchesRemotes(changes)) return;
    clearTimeout(wait);
    wait = setTimeout(() => reread(), CHANGE_WAIT_MS);
    wait?.unref?.();
  });
  ctx.signal?.addEventListener?.('abort', () => {
    clearInterval(timer);
    clearTimeout(wait);
    timer = null;
  });

  // With one machine chosen, the answer lists only it: the other segments come from `/api/machines`.
  if (choice !== ALL) {
    Promise.resolve()
      .then(() => ctx.read(MACHINES_ROUTE))
      .then((list) => {
        if (ctx.signal?.aborted) return;
        merge(list, false);
        draw();
        onLayout();
      })
      .catch(() => {});
  }

  return {
    get choice() {
      return choice;
    },
    route: (apiRoute) => routeWithMachine(apiRoute, choice),
    update(body) {
      if (!Array.isArray(body?.machines)) return;
      if (menu) lastItems = menu.itemsOf(body) ?? [];
      merge(body.machines, choice === ALL);
      draw();
    },
    row,
    notices,
    control: () => (remotesOf(known).length ? machineControl(known, choice, choose) : null),
    parts: () => (remotesOf(known).length ? [...(menuUi ? [] : [row]), ...(notices.hidden ? [] : [notices])] : []),
    hasRemotes: () => remotesOf(known).length > 0,
    machines: () => known,
    chosenDown: () => choice !== ALL && choice !== LOCAL && known.some((m) => m.id === choice && isDown(m)),
    recover(e) {
      if (choice === ALL || !isUnknownMachine(e)) return false;
      choose(ALL);
      return true;
    },
  };
}
