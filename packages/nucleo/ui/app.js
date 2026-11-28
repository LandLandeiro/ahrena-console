// The console shell (#26): sidebar, client-side routing, "Ao vivo" and the screen area.
// Screens register in screens.js; the screen contract is in README.md.

import { write, read } from './api.js';
import { startLive } from './live.js';
import { header } from './dom.js';
import { error, empty } from './states.js';
import { findScreen, litItem, tabsFor } from './screens.js';
import { createNav } from './nav.js';
import { afterWrite, createCounts } from './counts.js';
import { internalRoute } from './internal-link.js';
import { createGithubFooter, connectionChanged } from './github-connect.js';
import { createAppUpdate, appUpdateChanged, hasUpdate } from './app-update.js';
import { createTheme } from './theme.js';
import { createModeButton, onModeChange, appMode } from './mode.js';
import { createScreenTabs } from './screen-tabs.js';
import { createLiveBlock, LIVE_LABELS } from './live-block.js';
import { createAccountMenu } from './account-menu.js';
import { createEscape } from './escape.js';
import { createDrawer } from './drawer.js';
import { createScreenGate, createShellLoad, shareReads } from './shell-load.js';

const nav = document.getElementById('nav');
const area = document.getElementById('content');
const liveCard = document.getElementById('live');
const live = createLiveBlock({ node: liveCard, onVersion: () => (appUpdate.toggle(), drawLive()) });
const port = document.getElementById('port');

port.textContent = location.host;

/**
 * #750: a shell read of a route that is already in flight shares its promise; the screen's own reads (`ctx.read`)
 * go through the plain `read`, with their own signal. The shell reads start once the first screen has settled (mounted or failed).
 */
const shellRead = shareReads(read);
const gate = createScreenGate();

// ---------- Sidebar ----------

let machineCount = null;

// One block per section (C1, C24): the everyday screens, then Delivery, Decisions, Machines and Control. The remote
// machines (issue 178) come from `GET /api/machines` and are added by nav.js (`createNav`).
const { readMachines, readConnectors, highlight, counter, tag } = createNav({
  nav,
  read: shellRead,
  onMachines(n) {
    machineCount = n;
    drawLive();
  },
});
// ADR-0028: the Mural tag also goes to the menu button; one read, two places.
const counts = createCounts({ read: shellRead, nav: { tag: (id, next) => { tag(id, next); if (id === 'wall') drawer.waiting(next); } } });
// ADR-0028: the screens write through this one, so a write to the board moves the orange number.
const writeCounted = afterWrite(write, counts);
// A remote's state also changes without an alert (another version over there): re-read now and then.
setInterval(readMachines, 60_000);
// The Conexões dot (#277): on boot, on every `connector` change, on restart and every minute (an expiry is no event).
setInterval(readConnectors, 60_000);

// The GitHub connection in the footer (ghFooter, #241): read on boot, on every `connections` change and on restart.
const githubFooter = createGithubFooter({ node: document.getElementById('github'), read: shellRead });

// The app's update notice (issue 330): the card above the screens, and the panel the footer's version opens.
const appUpdate = createAppUpdate({ read: shellRead, write, noticeNode: document.getElementById('update-notice'), panelNode: document.getElementById('update-panel') });
// The relative times in the open panel ("verificado há 3 min") move on their own.
setInterval(() => appUpdate.tick(), 30_000);
// A click outside the panel and the footer's version closes it, like Esc.
document.addEventListener('click', (ev) => {
  if (!appUpdate.isOpen || !(ev.target instanceof Element) || ev.target.closest('#update-panel, .up-version')) return;
  appUpdate.close();
  drawLive();
});

createTheme({ button: document.getElementById('theme-button') });
// #754: the mode (Dev or Projeto) is applied here, before the first screen draws.
createModeButton({ button: document.getElementById('mode-button') });
const accountMenu = createAccountMenu({ button: document.getElementById('account-button'), menu: document.getElementById('account-menu') });
// ADR-0028: the notice and the content are the inert background while the drawer is open; the top bar stays in reach.
const drawer = createDrawer({ button: document.getElementById('menu-button'), side: document.getElementById('sidebar'), scrim: document.getElementById('scrim'), closeButton: document.getElementById('drawer-close'), background: [document.getElementById('update-notice'), document.getElementById('content')] });
createEscape(document, [
  { isOpen: () => appUpdate.isOpen, close: () => (appUpdate.close(), drawLive(), live.focusVersion()) },
  accountMenu,
  drawer,
]);

// ---------- Live ----------

let version = null;
let liveState = { state: 'connecting', error: null, nextAttempt: null };
const listeners = { change: new Set(), restart: new Set(), mode: new Set() };

/**
 * #750: boot reads the shell once, after the first screen has settled (or after 1 s). The first `restart` is the
 * connection's: the screen has just read and so has the shell, so it reads nothing. After it (or after a drop), every
 * `restart` that comes once boot has read reads the shell again and makes the screen re-read.
 */
const shell = createShellLoad({
  gate,
  loaders: [readVersion, readMachines, readConnectors, githubFooter.refresh, () => appUpdate.refresh().then(drawLive), counts.refresh],
});
shell.boot();
function restart() {
  if (!shell.restart()) return;
  if (screenFailed) return open();
  for (const f of listeners.restart) f();
}

async function readVersion() {
  try {
    version = (await shellRead('/api/overview')).version ?? null;
  } catch {}
  drawLive();
}

// The version in the footer is a button (issue 330): it opens the version panel, and has a dot while a newer one waits.
function versionButton() {
  if (!version) return null;
  const fresh = hasUpdate(appUpdate.view);
  return { label: `versão ${version}`, title: fresh ? 'Há uma versão nova do app' : 'Versão do app', fresh, expanded: appUpdate.isOpen };
}

function drawLive() {
  const { state, error: e, nextAttempt } = liveState;
  const seconds = nextAttempt ? Math.max(1, Math.round((nextAttempt - Date.now()) / 1000)) : null;
  liveCard.title = state === 'offline' ? `${e?.message ?? 'O núcleo não respondeu'}. Tentando de novo${seconds ? ` em ${seconds} s` : ''}.` : '';
  live.draw({ state, machines: machineCount, version: versionButton() });
  for (const p of document.querySelectorAll('[data-live]')) {
    p.dataset.state = state;
    p.textContent = LIVE_LABELS[state];
  }
}

startLive({
  read,
  onState(next) {
    // After a drop, the next answer re-reads everything, even if it is the first.
    if (next.state === 'offline') shell.dropped();
    liveState = next;
    drawLive();
  },
  onRestart: restart,
  onChange(changes) {
    // #750: the dot blinks once for each batch of events (at most every 2 s); a restart or a reset is not an event.
    live.blink();
    // A machine that goes down or comes back (`<id>:machine-unreachable`) changes its dot.
    if (changes.some((c) => c.type === 'alert')) readMachines();
    counts.changed(changes);
    if (connectionChanged(changes)) githubFooter.refresh();
    if (changes.some((c) => c.type === 'connector')) readConnectors();
    if (appUpdateChanged(changes)) appUpdate.refresh().then(drawLive);
    for (const f of listeners.change) f(changes);
  },
});

// ---------- Routing ----------

// #754: the tab row of the merged screens (decision 0029) sits above the screen, outside what a screen redraws.
const screenTabs = createScreenTabs({ host: document.getElementById('screen-tabs') });
let openScreenId = null;

let leaving = null;
let screenFailed = false;
// issue 754: the open of a switch of the mode leaves the drawer as it is, so the focus stays on the button that was pressed.
let keepDrawer = false;

// `route` may carry the query (`/ui/agent-config?tab=skills`): it stays in the URL for the screen to read.
// `state` goes into the history entry: a screen can tell a navigation from this page apart from a link
// another site opened (Conexões starts the device flow only on the C42 button's state).
function navigate(route, state = null) {
  if (state || route !== location.pathname + location.search + location.hash) history.pushState(state, '', route);
  open();
}

// #750: the shell reads wait for the first screen: it opens the gate whether it mounted or failed.
async function open() {
  try {
    await showScreen();
  } finally {
    gate.open();
  }
}

async function showScreen() {
  if (keepDrawer) keepDrawer = false;
  else drawer.close();
  leaving?.abort();
  const leave = new AbortController();
  leaving = leave;
  screenFailed = false;
  const found = findScreen(location.pathname);
  if (!found) {
    highlight(null);
    openScreenId = null;
    screenTabs.draw(null);
    document.title = 'Ahrena Console';
    area.replaceChildren(empty({ title: 'Página não encontrada', text: `Nada em ${location.pathname}.`, action: { label: 'Ir para o Dashboard', onClick: () => navigate('/ui') } }));
    return;
  }
  const { screen, params } = found;
  highlight(litItem(screen, params));
  openScreenId = screen.id;
  screenTabs.draw(tabsFor(screen.id, appMode()));
  document.title = `Ahrena Console · ${screen.title}`;
  if (!screen.file) {
    area.replaceChildren(
      header({ icon: screen.icon, title: screen.title, sub: screen.sub ?? params.id ?? null }),
      empty({ title: 'Esta tela ainda não existe', text: 'Ela chega na próxima versão do console.' }),
    );
    drawLive();
    return;
  }
  const ctx = {
    params,
    read: (route, options) => read(route, { signal: leave.signal, ...options }),
    write: (route, body, options) => writeCounted(route, body, { signal: leave.signal, ...options }),
    signal: leave.signal,
    navigate,
    counter,
    title: (text) => (document.title = `Ahrena Console · ${text}`),
    onChange: (f) => (listeners.change.add(f), leave.signal.addEventListener('abort', () => listeners.change.delete(f))),
    onRestart: (f) => (listeners.restart.add(f), leave.signal.addEventListener('abort', () => listeners.restart.delete(f))),
    // #754: a screen that redraws itself on a switch of the mode (the Mural, keeping focus and scroll) asks for it here.
    onModeChange: (f) => (listeners.mode.add(f), leave.signal.addEventListener('abort', () => listeners.mode.delete(f))),
    liveState: () => liveState.state,
  };
  try {
    const module = await import(screen.file);
    if (leave.signal.aborted) return;
    area.replaceChildren();
    const cleanup = await module.mount(area, ctx);
    if (typeof cleanup === 'function') leave.signal.addEventListener('abort', cleanup);
    drawLive();
  } catch (e) {
    if (leave.signal.aborted || e?.name === 'AbortError') return;
    screenFailed = true;
    area.replaceChildren(error({ title: 'A tela não abriu', text: e?.message ?? String(e), retry: () => open() }));
  }
}

// Internal links (`/ui...`) switch screens without reloading the page.
document.addEventListener('click', (ev) => {
  const a = ev.target instanceof Element ? ev.target.closest('a[href]') : null;
  if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const route = internalRoute(a.href, location.href);
  if (route === null) return;
  ev.preventDefault();
  navigate(route);
});
addEventListener('popstate', open);
// #754: a switch of the mode redraws the current screen; one that follows it by itself keeps its focus and scroll, the others open again (the drawer stays as it is).
onModeChange(() => {
  // The Dev-only tab (Eventos) follows the mode; the open screen keeps its own tab.
  if (openScreenId) screenTabs.draw(tabsFor(openScreenId, appMode()));
  if (listeners.mode.size === 0) return ((keepDrawer = true), open());
  for (const f of [...listeners.mode]) f();
});

open();
