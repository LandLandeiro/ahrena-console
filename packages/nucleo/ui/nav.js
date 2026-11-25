// The sidebar (C1, C24): one block per section of the registry, and the remote machines (issue 178).
//
// The registry is static; the remote machines come from `machines.json`, which only the core reads.
// `readMachines()` reads `GET /api/machines` and, when the list changed, draws the sidebar again with
// `machineItems(list)` added: each remote is an item of the Máquinas block, after "Esta máquina",
// with its state dot. The counters, the tags ("3 esperam" of the Mural, issue 750) and the lit item survive the redraw, and so
// does the scroll of the list: the sidebar draws again every 60 s while the person reads.
// `readConnectors()` reads `GET /api/connectors` (issue 277) and puts on Conexões the dot that sums up the
// worst cloud connector; a core without the route (404) shows no dot.

import { el, icon } from './dom.js';
import { machineItems, MACHINES_ROUTE, SCREENS, sidebarSections } from './screens.js';
import { CONNECTORS_ROUTE, connectorsDot } from './screens/cloud-format.js';

/** The state of a remote machine, said on its dot: the color alone does not say it. */
export const MACHINE_STATE_LABELS = { connected: 'Conectada', unreachable: 'Sem conexão', 'incompatible-version': 'Versão diferente', 'not-configured': 'Sem configuração', stopped: 'Parada por você', 'owner-auth': 'Acesso bloqueado', updating: 'Atualizando' };

/** How soon the sidebar reads the machines again while one is being updated (issue 484): the dot must not lag. (ADR-0024) */
const UPDATING_REREAD_MS = 5000;

/** The yellow arrow of a remote whose núcleo is older than the app (issue 449): the color alone does not say it. */
const CORE_OUTDATED_LABEL = 'Núcleo defasado';

/** A label this long may be cut by the item (one line, an ellipsis): the full text goes in the tooltip. */
const LONG_LABEL = 24;

/** Draws the sidebar into `nav` at once; `read` is the shell's read layer; `onMachines(n)` hears how many machines there are. */
export function createNav({ nav, read, screens = SCREENS, onMachines = () => {} }) {
  const items = new Map();
  const counts = new Map();
  // The tag of an item: `{ tone, text, note }`, drawn at the right in place of the plain number (issue 750).
  const tags = new Map();
  let lit = null;
  let remoteItems = [];
  // The dots that are not a machine's: `id → { state, label }` (Conexões, issue 277).
  const dots = new Map();
  // The one re-read pending while a machine is being updated; never two at once. (ADR-0024)
  let updatingTimer = null;

  // The right side of an item holds one thing: the tag when there is one, else the plain number.
  function side(id) {
    const tag = tags.get(id);
    if (tag) {
      const text = tag.note ? `${tag.text} ${tag.note}` : tag.text;
      return el('span', { class: 'cc-nav-tag', 'data-tone': tag.tone, title: tag.note ? text : null }, tag.text, tag.note ? el('span', { class: 'cc-sr-only' }, ` ${tag.note}`) : null);
    }
    const n = counts.get(id);
    return n ? el('span', { class: 'cc-nav-count' }, String(n)) : null;
  }

  function draw() {
    // Emptying the list sends the scroll to the top: put it back after drawing.
    const scrolled = nav.scrollTop;
    items.clear();
    const groups = [];
    for (const section of sidebarSections([...screens, ...remoteItems])) {
      const titleId = section.label ? `cc-nav-title-${section.id}` : null;
      const group = el(
        'div',
        { class: 'cc-nav-section', 'data-section': section.id, role: titleId && 'group', 'aria-labelledby': titleId },
        titleId && el('div', { class: 'cc-nav-title', id: titleId }, section.label),
      );
      for (const screen of section.items) {
        const mark = screen.state ? { state: screen.state, label: screen.stateLabel ?? MACHINE_STATE_LABELS[screen.state] ?? screen.state } : (dots.get(screen.id) ?? null);
        const dot = mark ? el('span', { class: 'cc-nav-dot', 'data-state': mark.state, role: 'img', 'aria-label': mark.label, title: mark.label }) : null;
        const flag = screen.coreOutdated ? el('span', { class: 'cc-nav-flag', role: 'img', 'aria-label': CORE_OUTDATED_LABEL, title: CORE_OUTDATED_LABEL }, icon('arrow-up-circle')) : null;
        const a = el('a', { class: 'cc-nav', href: screen.route, 'data-screen': screen.id }, icon(screen.item.icon), el('span', { class: 'cc-nav-label', title: screen.item.label.length > LONG_LABEL ? screen.item.label : null }, screen.item.label), flag, dot, side(screen.id));
        items.set(screen.id, { a });
        group.append(a);
      }
      groups.push(group);
    }
    nav.replaceChildren(...groups);
    nav.scrollTop = scrolled;
    highlight(lit);
  }

  function highlight(id) {
    lit = id;
    for (const [k, { a }] of items) {
      a.classList.toggle('on', k === id);
      if (k === id) {
        a.setAttribute('aria-current', 'page');
        // On a short window the list scrolls: the lit item must not stay out of sight.
        a.scrollIntoView?.({ block: 'nearest' });
      } else a.removeAttribute('aria-current');
    }
  }

  // The right side of one item again, without drawing the list: the focus and the scroll stay where they are.
  function redrawSide(id) {
    const item = items.get(id);
    if (!item) return;
    item.a.querySelector('.cc-nav-tag, .cc-nav-count')?.remove();
    const next = side(id);
    if (next) item.a.append(next);
  }

  /** A plain number at the right of an item (mono, subtle); zero takes it away. */
  function counter(id, n) {
    counts.set(id, n);
    redrawSide(id);
  }

  /** A tag at the right of an item (`{ tone: 'waiting' | 'active', text, note? }`); `null` takes it away. */
  function tag(id, next) {
    if (next) tags.set(id, next);
    else tags.delete(id);
    redrawSide(id);
  }

  async function readMachines() {
    let list;
    try {
      list = await read(MACHINES_ROUTE);
    } catch {
      // Without telemetry (404) or offline: the remote items stay as they were.
      return;
    }
    const next = machineItems(list);
    // This machine is always one; the remotes of the list are the others.
    onMachines(1 + next.length);
    if (!updatingTimer && next.some((item) => item.state === 'updating')) {
      updatingTimer = setTimeout(() => {
        updatingTimer = null;
        readMachines();
      }, UPDATING_REREAD_MS);
      // In Node (the tests) the pending re-read does not keep the process alive; a browser timer has no unref. (ADR-0024)
      updatingTimer?.unref?.();
    }
    if (JSON.stringify(next) === JSON.stringify(remoteItems)) return;
    remoteItems = next;
    draw();
  }

  async function readConnectors() {
    let next;
    try {
      next = connectorsDot(await read(CONNECTORS_ROUTE));
    } catch (e) {
      // A core without the cloud routes (404): no dot. Offline: the dot stays as it was.
      if (e?.status !== 404) return;
      next = null;
    }
    const before = dots.get('connections') ?? null;
    if (JSON.stringify(before) === JSON.stringify(next)) return;
    if (next) dots.set('connections', next);
    else dots.delete('connections');
    draw();
  }

  draw();
  return { draw, readMachines, readConnectors, highlight, counter, tag };
}
