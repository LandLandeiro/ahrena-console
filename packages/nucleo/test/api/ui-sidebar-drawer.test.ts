// #750: below 860 px the bar is a drawer: inert background, focus to the first item and back to the menu button.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { documentoFalso, ElementoFalso, instalarDomFalso } from './fake-dom.ts';

instalarDomFalso();

// @ts-expect-error: browser module, plain JavaScript
import { createAccountMenu } from '../../ui/account-menu.js';
// @ts-expect-error: browser module, plain JavaScript
import { createDrawer, DRAWER_QUERY } from '../../ui/drawer.js';
// @ts-expect-error: browser module, plain JavaScript
import { createEscape } from '../../ui/escape.js';

const html = readFileSync(`${UI_FOLDER}index.html`, 'utf8');
const drawerCss = readFileSync(`${UI_FOLDER}drawer.css`, 'utf8');
const update = readFileSync(`${UI_FOLDER}app-update.css`, 'utf8');
const app = readFileSync(`${UI_FOLDER}app.js`, 'utf8');

function rig(narrow: boolean) {
  const button = new ElementoFalso('button');
  const side = new ElementoFalso('aside');
  const nav = new ElementoFalso('nav');
  nav.setAttribute('id', 'nav');
  const first = new ElementoFalso('a');
  first.setAttribute('href', '/ui');
  const second = new ElementoFalso('a');
  second.setAttribute('href', '/ui/wall');
  nav.append(first, second);
  side.append(nav);
  const scrim = new ElementoFalso('div');
  scrim.hidden = true;
  const column = new ElementoFalso('div');
  const notice = new ElementoFalso('div');
  const closeButton = new ElementoFalso('button');
  closeButton.setAttribute('id', 'drawer-close');
  side.append(closeButton);
  const count = new ElementoFalso('span');
  count.hidden = true;
  button.append(count);
  const listeners = new Set<(ev: { matches: boolean }) => void>();
  const media = { matches: narrow, addEventListener: (_: string, f: (ev: { matches: boolean }) => void) => void listeners.add(f) };
  const cross = (matches: boolean) => { media.matches = matches; listeners.forEach((f) => f({ matches })); };
  const drawer = createDrawer({ button, side, scrim, background: [column, notice], closeButton, count, media });
  return { button, side, first, second, scrim, column, notice, closeButton, count, nav, cross, drawer, media };
}

describe('issue 750: the drawer', () => {
  test('the query is the width the CSS uses', () => {
    assert.equal(DRAWER_QUERY, '(max-width: 859px)');
    assert.match(drawerCss, /@media \(max-width: 859px\)/);
  });

  test('closed on a narrow window: the bar is outside the tab and the button says so', () => {
    const { side, button, scrim, column } = rig(true);
    assert.equal(side.inert, true);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(scrim.hidden, true);
    assert.notEqual(column.inert, true);
    assert.equal(side.getAttribute('data-open'), null);
  });

  test('on a wide window the bar is a plain column: nothing is inert', () => {
    const { side, drawer, column } = rig(false);
    assert.notEqual(side.inert, true);
    assert.notEqual(column.inert, true);
    drawer.open();
    assert.equal(drawer.isOpen(), false, 'there is nothing to open on a wide window');
  });

  test('opening: the bar is reachable, the background is inert, the scrim shows and the first item has the focus', () => {
    const { side, button, scrim, column, first, drawer } = rig(true);
    button.click();
    assert.equal(drawer.isOpen(), true);
    assert.equal(side.inert, false);
    assert.equal(side.getAttribute('data-open'), '');
    assert.equal(column.inert, true);
    assert.equal(scrim.hidden, false);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(documentoFalso.activeElement, first);
  });

  test('close() puts everything back and the focus on the button', () => {
    const { side, button, scrim, column, drawer } = rig(true);
    button.click();
    drawer.close();
    assert.equal(drawer.isOpen(), false);
    assert.equal(side.inert, true);
    assert.equal(side.getAttribute('data-open'), null);
    assert.equal(column.inert, false);
    assert.equal(scrim.hidden, true);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(documentoFalso.activeElement, button);
  });

  test('the scrim, a click on an item and Escape close it, each with the focus back on the button', () => {
    for (const how of ['scrim', 'item', 'escape'] as const) {
      const { button, scrim, second, drawer } = rig(true);
      const escape = createEscape(documentoFalso, [drawer]);
      button.click();
      assert.equal(drawer.isOpen(), true, how);
      if (how === 'scrim') scrim.click();
      if (how === 'item') second.click();
      if (how === 'escape') documentoFalso.dispatchEvent({ type: 'keydown', key: 'Escape' });
      assert.equal(drawer.isOpen(), false, how);
      assert.equal(documentoFalso.activeElement, button, how);
      escape.stop();
    }
  });

  test('any link of the bar closes it, not only the items: the brand, the account menu and the GitHub link', () => {
    for (const where of ['brand', 'menu', 'github'] as const) {
      const { button, side, drawer } = rig(true);
      const link = new ElementoFalso('a');
      link.setAttribute('href', where === 'brand' ? '/ui' : '/ui/connections');
      const holder = new ElementoFalso('div');
      holder.append(link);
      side.append(holder);
      button.click();
      assert.equal(drawer.isOpen(), true, where);
      link.click();
      assert.equal(drawer.isOpen(), false, where);
      assert.equal(documentoFalso.activeElement, button, where);
    }
  });

  test('a button of the bar (theme, version, menu) does not close it', () => {
    const { button, side, drawer } = rig(true);
    const theme = new ElementoFalso('button');
    side.append(theme);
    button.click();
    theme.click();
    assert.equal(drawer.isOpen(), true);
  });

  test('a route change of the shell closes it: open() (navigate and popstate) closes the drawer', () => {
    assert.match(/async function open\(\) \{([\s\S]*?)\n\}\n/.exec(app)?.[1] ?? '', /await showScreen\(\)/);
    const body = /async function showScreen\(\) \{([\s\S]*?)\n\}\n/.exec(app)?.[1] ?? '';
    assert.match(body, /beginLeave\(\)/);
    // beginLeave is where the drawer closes: the open of a mode switch keeps it.
    assert.match(/function beginLeave\(\) \{([\s\S]*?)\n\}\n/.exec(app)?.[1] ?? '', /drawer\.close\(\)/);
    assert.match(app, /addEventListener\('popstate', open\)/);
  });

  test('close() with the drawer already closed takes no focus (the first open() of the page, a navigation on a wide window)', () => {
    const { drawer, second } = rig(true);
    second.focus();
    drawer.close();
    assert.equal(documentoFalso.activeElement, second);
  });

  test('a click on the bar itself, not on an item, keeps it open', () => {
    const { button, side, drawer } = rig(true);
    button.click();
    side.click();
    assert.equal(drawer.isOpen(), true);
  });

  test('crossing 860 px while open clears the state, the inert and the scrim, and does not take the focus', () => {
    const { button, side, scrim, column, cross, drawer, second } = rig(true);
    button.click();
    second.focus();
    cross(false);
    assert.equal(drawer.isOpen(), false);
    assert.equal(side.inert, false);
    assert.equal(column.inert, false);
    assert.equal(scrim.hidden, true);
    assert.equal(side.getAttribute('data-open'), null);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(documentoFalso.activeElement, second);
  });

  test('crossing into a narrow window closes the bar out of the tab again', () => {
    const { side, cross } = rig(false);
    cross(true);
    assert.equal(side.inert, true);
    cross(false);
    assert.equal(side.inert, false);
  });
});

describe('issue 750: the markup and the rules of the drawer', () => {
  test('the top bar holds the menu button, the logo and the name; the scrim is hidden; the bar has an id', () => {
    assert.match(html, /<header class="cc-top">/);
    assert.match(html, /<button type="button" class="cc-ibtn" id="menu-button" aria-label="Menu" aria-expanded="false" aria-controls="sidebar">/);
    assert.match(html, /<aside class="cc-side" id="sidebar">/);
    assert.match(html, /<div class="cc-scrim" id="scrim" hidden><\/div>/);
    assert.match(html, /<link rel="stylesheet" href="\/ui\/drawer\.css">/);
    assert.match(html, /<div class="cc-notice" id="update-notice" hidden><\/div>\s*<div class="cc-tabs-host" id="screen-tabs" hidden><\/div>\s*<main class="cc-main" id="content" tabindex="-1">/);
  });

  test('the top bar and the scrim exist only below 860 px; the drawer slides in and is invisible when closed', () => {
    const rule = (css: string, selector: string) => css.match(new RegExp(`^\\s*${selector.replace(/[.#\[\]="()>:+-]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
    assert.match(rule(drawerCss, '.cc-top'), /display: none/);
    assert.match(rule(drawerCss, '.cc-scrim'), /display: none/);
    const narrow = drawerCss.slice(drawerCss.indexOf('@media (max-width: 859px)'));
    assert.match(rule(narrow, '.cc-top'), /display: flex/);
    assert.match(rule(narrow, '.cc-side'), /position: fixed/);
    assert.match(rule(narrow, '.cc-side'), /z-index: 40/);
    assert.match(rule(narrow, '.cc-side'), /visibility: hidden/);
    assert.match(rule(narrow, '.cc-side[data-open]'), /visibility: visible/);
    assert.match(rule(narrow, '.cc-scrim'), /z-index: 39/);
    assert.match(rule(narrow, '.cc-scrim'), /background: color-mix\(in srgb, var\(--mono-black\) 30%, transparent\)/);
    assert.match(rule(narrow, '.cc'), /grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(drawerCss, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(rule(narrow, '.cc-top'), /border-bottom: 1px solid var\(--border\)/);
  });

  test('the version panel is above the drawer, so the update notice and panel work at that width', () => {
    const z = (css: string, selector: string) => Number(new RegExp(`^${selector.replace(/[.]/g, '\\.')} \\{[^}]*z-index: (\\d+)`, 'm').exec(css)?.[1]);
    assert.ok(z(update, '.up-pop') > 40);
    assert.match(update, /@media \(max-width: 859px\) \{[^@]*\.cc-notice \{ padding: 12px 16px 0; \}/);
    assert.match(html, /<\/div>\s*<div class="up-pop" id="update-panel" hidden><\/div>/);
  });

  test('app.js builds the drawer with the column as the background and puts it in the Escape order', () => {
    assert.match(app, /createDrawer\(\{/);
    assert.match(app, /background: \[document\.getElementById\('update-notice'\), document\.getElementById\('screen-tabs'\), document\.getElementById\('content'\)\]/);
    assert.doesNotMatch(app, /background: \[[^\]]*\.cc-col/, 'the top bar stays out of the inert set: the menu button is still reachable');
    assert.match(app, /createEscape\(document, \[\s*\{ isOpen: \(\) => appUpdate\.isOpen[^\]]*accountMenu,\s*drawer,\s*\]\)/);
  });
});

describe('#754: the tab row is part of the inert background', () => {
  test('app.js puts the tab row, between the notice and the content, in the background of the drawer', () => {
    const list = /createDrawer\(\{[^}]*background: \[([^\]]*)\]/.exec(app)?.[1] ?? '';
    for (const id of ['update-notice', 'screen-tabs', 'content']) assert.match(list, new RegExp(`document\\.getElementById\\('${id}'\\)`), id);
    assert.ok(html.includes('id="screen-tabs"'), 'the host exists in the page');
  });

  test('opening the drawer makes the host of the tabs inert, and closing gives it back', () => {
    const button = new ElementoFalso('button');
    const side = new ElementoFalso('aside');
    const first = new ElementoFalso('a');
    side.append(first);
    const scrim = new ElementoFalso('div');
    const closeButton = new ElementoFalso('button');
    const [notice, tabs, content] = [new ElementoFalso('div'), new ElementoFalso('div'), new ElementoFalso('main')];
    const media = { matches: true, addEventListener: () => {} };
    createDrawer({ button, side, scrim, background: [notice, tabs, content], closeButton, count: null, media });
    button.click();
    assert.equal(tabs.inert, true);
    button.click();
    assert.equal(tabs.inert, false);
  });
});

describe('#750: the Conexões link of the account menu inside the drawer', () => {
  test('the account menu closes and the focus ends on the menu button of the drawer, as the drawer closes', () => {
    const { button, side, drawer } = rig(true);
    const accountButton = new ElementoFalso('button');
    const panel = new ElementoFalso('div');
    panel.id = 'account-menu';
    const link = new ElementoFalso('a');
    link.setAttribute('href', '/ui/connections');
    panel.append(link);
    side.append(accountButton, panel);
    createAccountMenu({ button: accountButton, menu: panel, doc: documentoFalso }).open();
    drawer.open();
    link.focus();
    link.click();
    assert.equal(panel.hidden, true);
    assert.equal(drawer.isOpen(), false);
    assert.equal(documentoFalso.activeElement, button);
  });
});

describe('#750: the drawer starts under the top bar, so the menu button stays in reach', () => {
  const rule = (css: string, selector: string) => css.match(new RegExp(`^\\s*${selector.replace(/[.#\[\]="()>:+-]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
  const narrow = drawerCss.slice(drawerCss.indexOf('@media (max-width: 859px)'));

  test('the bar and the veil start at the height of the top bar, from one custom property of 48 px', () => {
    assert.match(rule(narrow, '.cc'), /--top-height: 48px/);
    assert.match(rule(narrow, '.cc-top'), /height: var\(--top-height\)/);
    assert.match(rule(narrow, '.cc-side'), /top: var\(--top-height\)/);
    assert.match(rule(narrow, '.cc-side'), /bottom: 0/);
    assert.match(rule(narrow, '.cc-scrim'), /top: var\(--top-height\)/);
    assert.doesNotMatch(rule(narrow, '.cc-side'), /top: 0/);
    assert.doesNotMatch(rule(narrow, '.cc-scrim'), /top: 0/);
  });

  test('only the update notice and the content are inert while open: the top bar, with the menu button, is not', () => {
    const { button, column, notice, drawer } = rig(true);
    button.click();
    assert.equal(notice.inert, true);
    assert.equal(column.inert, true);
    assert.equal(button.inert, undefined);
    button.click();
    assert.equal(drawer.isOpen(), false, 'the menu button closes it');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(notice.inert, false);
    assert.equal(column.inert, false);
    assert.equal(documentoFalso.activeElement, button);
    button.click();
    assert.equal(button.getAttribute('aria-expanded'), 'true');
  });
});

describe('#750: the close button', () => {
  test('it sits in the bar before the list, closes the drawer and puts the focus on the menu button; it does not take the first focus', () => {
    const { button, closeButton, first, drawer } = rig(true);
    button.click();
    assert.equal(documentoFalso.activeElement, first);
    closeButton.click();
    assert.equal(drawer.isOpen(), false);
    assert.equal(documentoFalso.activeElement, button);
  });

  test('the markup: a button with the X icon and its label, in the brand row, visible only below 860 px, at least 28 px', () => {
    const row = /<div class="cc-side-head">([\s\S]*?)<\/div>\s*<nav id="nav"/.exec(html)?.[1] ?? '';
    assert.match(row, /<a class="cc-brand" href="\/ui">/);
    assert.match(row, /<button type="button" class="cc-ibtn" id="drawer-close" aria-label="Fechar menu">/);
    assert.match(row, /<svg class="icon"[^>]*aria-hidden="true"><path d="M18 6 6 18"\/><path d="m6 6 12 12"\/><\/svg>/);
    assert.doesNotMatch(row, /style=/);
    const shell = readFileSync(`${UI_FOLDER}shell.css`, 'utf8');
    assert.match(shell, /\.cc-ibtn \{ width: 28px; height: 28px;/);
    assert.match(drawerCss, /^\.cc-side-head \.cc-ibtn \{ display: none; \}/m);
    const narrow = drawerCss.slice(drawerCss.indexOf('@media (max-width: 859px)'));
    assert.match(narrow, /\.cc-side-head \.cc-ibtn \{ display: grid; \}/);
  });
});

describe('#750: the list keeps its scroll when the drawer opens', () => {
  test('the event that opened decides: a mouse click (detail 1) focuses without scrolling; a keyboard click (detail 0) lets it scroll', () => {
    for (const keyboard of [false, true]) {
      const { button, first, drawer } = rig(true);
      const seen: unknown[] = [];
      const real = first.focus.bind(first);
      first.focus = (options?: unknown) => (seen.push(options), real());
      button.dispatchEvent({ type: 'click', detail: keyboard ? 0 : 1 });
      assert.equal(drawer.isOpen(), true);
      assert.deepEqual(seen, [{ preventScroll: !keyboard }], keyboard ? 'keyboard' : 'pointer');
      assert.equal(documentoFalso.activeElement, first);
    }
  });

  test('closed with Escape, a mouse click on the menu button still opens without scrolling the list', () => {
    const { button, first, drawer } = rig(true);
    const escape = createEscape(documentoFalso, [drawer]);
    const seen: unknown[] = [];
    const real = first.focus.bind(first);
    first.focus = (options?: unknown) => (seen.push(options), real());
    button.dispatchEvent({ type: 'click', detail: 0 });
    documentoFalso.dispatchEvent({ type: 'keydown', key: 'Escape' });
    assert.equal(drawer.isOpen(), false);
    seen.length = 0;
    button.dispatchEvent({ type: 'click', detail: 1 });
    assert.equal(drawer.isOpen(), true);
    assert.deepEqual(seen, [{ preventScroll: true }]);
    escape.stop();
  });

  const rule = (css: string, selector: string) => css.match(new RegExp(`^\\s*${selector.replace(/[.#\[\]="()>:+-]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
  test('nothing in the drawer resets the list: scrolled to the bottom, a screen picked, reopened, the scrollTop is the same', () => {
    const { button, nav, second, drawer } = rig(true);
    drawer.open();
    nav.scrollTop = 420;
    second.click();
    assert.equal(drawer.isOpen(), false);
    drawer.open();
    assert.equal(nav.scrollTop, 420);
    const hide = (selector: string) => rule(drawerCss, selector);
    assert.doesNotMatch(hide('.cc-side'), /display: none/, 'display none would reset the scroll of the hidden list');
    assert.doesNotMatch(hide('.cc-side[data-open]'), /display: none/);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
  });
});

describe('#750: the waiting count on the menu button', () => {
  test('it takes the Mural tag as it is: "3 esperam", "1 espera", gone at zero, the name says it once, aria-expanded says open or closed', () => {
    const { button, count, drawer } = rig(true);
    assert.equal(button.getAttribute('aria-label'), null, 'the page markup says "Menu"; the drawer only changes it with a count');
    drawer.waiting({ tone: 'waiting', text: '3 esperam' });
    assert.equal(count.textContent, '3 esperam');
    assert.equal(count.hidden, false);
    assert.equal(button.getAttribute('aria-label'), 'Menu, 3 esperam');
    drawer.open();
    assert.equal(button.getAttribute('aria-label'), 'Menu, 3 esperam', 'the name does not change with the open state');
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    drawer.close();
    drawer.waiting({ tone: 'waiting', text: '1 espera' });
    assert.equal(count.textContent, '1 espera');
    assert.equal(button.getAttribute('aria-label'), 'Menu, 1 espera');
    drawer.waiting(null);
    assert.equal(count.hidden, true);
    assert.equal(count.textContent, '');
    assert.equal(button.getAttribute('aria-label'), 'Menu');
  });

  test('the markup: the tag is the yellow one of the bar, hidden from the name; the button is named Menu', () => {
    assert.match(html, /<span class="cc-nav-tag" data-tone="waiting" aria-hidden="true" hidden><\/span>\s*(<span class="cc-ibtn-dot" aria-hidden="true" hidden><\/span>\s*)?<\/button>/);
    const shell = readFileSync(`${UI_FOLDER}shell.css`, 'utf8');
    assert.match(shell, /\.cc-nav-tag\[data-tone="waiting"\] \{ color: var\(--status-waiting-text\); background: var\(--status-waiting-badge\);/);
  });

  test('app.js feeds it from the counts the Mural tag reads: the wrapped tag function, no read of its own', () => {
    assert.match(app, /createCounts\(\{ read: shellRead, nav: \{ tag: \(id, next\) => \{[^}]*tag\(id, next\);[^}]*id === 'wall'[^}]*drawer\.waiting\(next\)/);
    assert.equal((app.match(/api\/attention/g) ?? []).length, 0, 'no second read of /api/attention in the shell');
  });
});
