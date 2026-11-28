// #755: the search of the sidebar, a field "Buscar" that opens a modal dialog with Sessões and Telas, filtered here on what the screens read.
// #755: one route is read (the sessions list the Dashboard asks too) and nothing is written; Cmd+K and Ctrl+K work from anywhere, a field included.
// #755: the keys of the Mural (wall-keys.js) are bare letters that this file never reads, and typing in the field of the dialog is left alone by them.
// #755: the field keeps the focus, the arrows move `aria-activedescendant`, Enter opens the row through the shell's `navigate`, Esc closes and the focus goes back.
// #755: in Projeto the screens the bar hides are found too, tagged "Fora da barra", so nothing becomes unreachable (ADR-0028).

import { el, icon } from './dom.js';
import { appMode } from './mode.js';
import { isRemote, itemHref, machineLabel } from './machine-filter.js';
import { trapFocus } from './popover.js';
import { sidebarSections } from './screens.js';
import { stateIcon, stateOfSession } from './state-icon.js';

/** The sessions the screens already read (the Dashboard asks the same list), newest activity first. */
export const SESSIONS_ROUTE = '/api/sessions?order=activity&direction=desc&perPage=100';

const MAX_SESSIONS = 6;
const MAX_SCREENS = 8;
const HIDDEN_TAG = 'Fora da barra';

/** Lower case, no accents: "Migração" is found by "migracao". */
export const normalize = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** Whether the platform string is one of Apple's, where the key is Cmd. */
export const isMacPlatform = (platform) => /mac|iphone|ipad|ipod/i.test(String(platform ?? ''));

/** The hint on the field: `⌘K` on a Mac, `Ctrl K` off it. */
export const shortcutLabel = (platform) => (isMacPlatform(platform) ? '⌘K' : 'Ctrl K');

/**
 * Whether the keydown is the chord: Cmd with K on a Mac, Ctrl with K off it, alone, not taken, not repeated and not part of
 * a composition. The other modifier is left to the page: Ctrl K on a Mac is the text field's own (kill to the end of the line).
 */
export function isSearchChord(ev, platform = '') {
  if (!ev || ev.defaultPrevented || ev.isComposing || ev.repeat || ev.altKey || ev.shiftKey) return false;
  const mod = isMacPlatform(platform) ? ev.metaKey && !ev.ctrlKey : ev.ctrlKey && !ev.metaKey;
  return Boolean(mod) && typeof ev.key === 'string' && ev.key.toLowerCase() === 'k';
}

function screenEntries(screens, mode) {
  const bar = sidebarSections(screens, undefined, mode).flatMap((s) => s.items.map((t) => ({ id: t.id, label: t.item.label, href: t.route, iconName: t.item.icon, outOfBar: false })));
  if (mode !== 'project') return bar;
  const shown = new Set(bar.map((e) => e.id));
  return [...bar, ...screens.filter((t) => t.item && !shown.has(t.id)).map((t) => ({ id: t.id, label: t.item.label, href: t.route, iconName: t.item.icon, outOfBar: true }))];
}

function sessionEntries(items) {
  return (Array.isArray(items) ? items : [])
    .filter((s) => s && typeof s.id === 'string' && s.id)
    .map((s) => {
      const { kind, label } = stateOfSession({ attention: s.attention, status: s.status });
      return { id: s.id, label: typeof s.title === 'string' && s.title ? s.title : 'Sessão sem título', href: itemHref(s), kind, stateText: label, machine: machineLabel(s).text, remote: isRemote(s) };
    });
}

const rank = (entry, query) => {
  const name = normalize(entry.label);
  return name.startsWith(query) ? 0 : name.includes(query) ? 1 : 2;
};

function filter(entries, query, haystack) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  const whole = words.join(' ');
  return entries
    .filter((e) => {
      const text = normalize(haystack(e));
      return words.every((w) => text.includes(w));
    })
    .map((e, i) => [e, i])
    .sort((a, b) => rank(a[0], whole) - rank(b[0], whole) || a[1] - b[1])
    .map(([e]) => e);
}

/**
 * The results for `query`: `{ sessions, screens }`. `sessions` are the items of the sessions list, `screens` the registry,
 * `mode` the bar's mode; the words of the query may come in any order and each must be in the title or the machine (a session)
 * or in the label (a screen).
 */
export function searchResults({ sessions = [], screens = [], query = '', mode = 'dev' } = {}) {
  return {
    sessions: filter(sessionEntries(sessions), query, (e) => `${e.label} ${e.machine}`).slice(0, MAX_SESSIONS),
    screens: filter(screenEntries(screens, mode), query, (e) => e.label).slice(0, MAX_SCREENS),
  };
}

const platformOf = () => globalThis.navigator?.userAgentData?.platform ?? globalThis.navigator?.platform ?? '';

export function createCommandSearch({ host, read, navigate = null, screens, background = [], dialogHost = globalThis.document?.body, platform = platformOf() }) {
  const doc = globalThis.document;
  const hint = shortcutLabel(platform);
  const button = el('button', { type: 'button', class: 'cc-search', 'aria-haspopup': 'dialog', 'aria-keyshortcuts': isMacPlatform(platform) ? 'Meta+K' : 'Control+K' }, icon('search'), el('span', { class: 'cc-search-label' }, 'Buscar'), el('kbd', { class: 'cc-search-key' }, hint));
  host.append(button);

  let sessions = [];
  let state = { dialog: null };
  let previous = null;
  let failed = false;
  let pending = false;
  let rows = [];
  let active = 0;
  let query = '';
  let input = null;
  let list = null;
  let status = null;
  let count = 0;
  // #755: ids stay unique to the page whatever the number of times it opens.
  let opening = 0;

  const isOpen = () => state.dialog !== null;

  function paintActive() {
    rows.forEach((row, i) => {
      const on = i === active;
      row.node.classList.toggle('on', on);
      row.node.setAttribute('aria-selected', String(on));
      row.node.querySelector('.cs-enter')?.remove();
      if (on) row.node.append(el('kbd', { class: 'cs-enter', 'aria-hidden': 'true' }, '↵'));
    });
    if (rows[active]) {
      input.setAttribute('aria-activedescendant', rows[active].node.getAttribute('id'));
      rows[active].node.scrollIntoView?.({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function sessionRow(entry, id) {
    const state_ = entry.kind ? el('span', { class: 'cs-state', title: entry.stateText }, stateIcon(entry.kind), el('span', { class: 'cc-sr-only' }, entry.stateText)) : null;
    return el('a', { class: 'cs-row', role: 'option', id, href: entry.href, tabindex: '-1', 'aria-selected': 'false' }, state_, el('span', { class: 'cs-title', title: entry.label }, entry.label), el('span', { class: 'cs-where' }, entry.machine));
  }

  function screenRow(entry, id) {
    return el('a', { class: 'cs-row', role: 'option', id, href: entry.href, tabindex: '-1', 'aria-selected': 'false' }, entry.iconName ? icon(entry.iconName) : null, el('span', { class: 'cs-title' }, entry.label), entry.outOfBar ? el('span', { class: 'cs-tag' }, HIDDEN_TAG) : null);
  }

  function render() {
    const found = searchResults({ sessions, screens: screens(), query, mode: appMode() });
    const groups = [];
    rows = [];
    let n = 0;
    const group = (name, key, entries, make) => {
      if (!entries.length) return;
      const titleId = `cs-${opening}-title-${key}`;
      const items = entries.map((entry) => {
        const node = make(entry, `cs-${opening}-opt-${n++}`);
        rows.push({ node, href: entry.href });
        return node;
      });
      groups.push(el('div', { role: 'group', class: 'cs-group', 'aria-labelledby': titleId }, el('div', { role: 'presentation', class: 'cs-group-title', id: titleId }, name), ...items));
    };
    group('Sessões', 'sessions', found.sessions, sessionRow);
    group('Telas', 'screens', found.screens, screenRow);
    list.replaceChildren(...groups);
    count = rows.length;
    active = Math.min(active, Math.max(0, count - 1));
    const parts = [count ? `${count} ${count === 1 ? 'resultado' : 'resultados'}` : 'Nada encontrado'];
    if (pending && !sessions.length) parts.push('Buscando sessões');
    else if (failed) parts.push('Sessões indisponíveis agora');
    status.textContent = parts.join(' · ');
    input.setAttribute('aria-expanded', String(count > 0));
    paintActive();
  }

  async function load() {
    pending = true;
    failed = false;
    try {
      const list_ = await read(SESSIONS_ROUTE);
      sessions = Array.isArray(list_?.items) ? list_.items : [];
    } catch {
      // #755: the cause is the read layer's and the reader gets one sentence; the screens do not depend on this read.
      failed = true;
    }
    pending = false;
    if (isOpen()) render();
  }

  function go(row) {
    if (!row) return;
    close();
    if (navigate) navigate(row.href);
    else globalThis.location?.assign?.(row.href);
  }

  function onKey(ev) {
    if (ev.key === 'Escape') {
      // ADR-0028: the Escape is this layer's, so it does not climb to the document, where the layer under it would close too.
      ev.preventDefault?.();
      ev.stopPropagation?.();
      return close();
    }
    if (ev.isComposing) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault?.();
      if (!count) return;
      active = (active + (ev.key === 'ArrowDown' ? 1 : count - 1)) % count;
      paintActive();
    } else if (ev.key === 'Enter') {
      ev.preventDefault?.();
      go(rows[active]);
    }
  }

  function open() {
    if (isOpen()) return input.focus();
    const at = doc.activeElement;
    previous = at && at !== doc.body ? at : button;
    opening += 1;
    query = '';
    active = 0;
    const listId = `cs-${opening}-list`;
    input = el('input', { class: 'cs-input', type: 'text', role: 'combobox', 'aria-label': 'Buscar sessão ou tela', 'aria-controls': listId, 'aria-expanded': 'true', 'aria-autocomplete': 'list', autocomplete: 'off', spellcheck: 'false', placeholder: 'Buscar sessão ou tela' });
    list = el('div', { class: 'cs-list', role: 'listbox', id: listId, 'aria-label': 'Resultados' });
    status = el('div', { class: 'cs-status', role: 'status', 'aria-live': 'polite' });
    const closeButton = el('button', { type: 'button', class: 'cs-close', 'aria-label': 'Fechar' }, icon('x'));
    closeButton.addEventListener('click', () => close());
    const dialog = el('div', { class: 'cs-dialog', role: 'dialog', 'aria-label': 'Buscar' }, el('div', { class: 'cs-head' }, icon('search'), input, closeButton), list, status);
    const scrim = el('div', { class: 'cs-scrim' }, dialog);
    scrim.addEventListener('click', (ev) => {
      if (ev.target === scrim) close();
    });
    // #755: a click on a row is a navigation of the shell's (the row is a link): the dialog only gets out of the way.
    list.addEventListener('click', (ev) => {
      if (ev.target instanceof Element && ev.target.closest('a[href]')) close();
    });
    input.addEventListener('input', () => {
      query = input.value;
      active = 0;
      render();
    });
    dialog.addEventListener('keydown', onKey);
    trapFocus(dialog);
    state = { dialog: scrim };
    for (const node of background) node.inert = true;
    dialogHost.append(scrim);
    button.setAttribute('aria-expanded', 'true');
    render();
    input.focus();
    load().catch(reportError);
  }

  function close() {
    if (!isOpen()) return;
    state.dialog.remove();
    state = { dialog: null };
    for (const node of background) node.inert = false;
    button.removeAttribute('aria-expanded');
    const back = previous && previous.isConnected !== false ? previous : button;
    previous = null;
    back.focus?.();
  }

  function onChord(ev) {
    if (!isSearchChord(ev, platform)) return;
    ev.preventDefault?.();
    open();
  }

  button.addEventListener('click', () => open());
  doc.addEventListener('keydown', onChord);

  return {
    open,
    close,
    isOpen,
    button,
    stop() {
      doc.removeEventListener('keydown', onChord);
      close();
      button.remove();
    },
  };
}
