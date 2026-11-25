// Issue 750: below 860 px the bar is a drawer. Open: it comes on top, the background is inert and the focus goes to the
// first item. Escape, the scrim and a navigation close it and the focus goes back to the menu button. Closed, it is
// out of the tab; crossing 860 px clears everything. On the fake DOM; the sizes are asserted on the rules.
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
  const listeners = new Set<(ev: { matches: boolean }) => void>();
  const media = { matches: narrow, addEventListener: (_: string, f: (ev: { matches: boolean }) => void) => void listeners.add(f) };
  const cross = (matches: boolean) => { media.matches = matches; listeners.forEach((f) => f({ matches })); };
  const drawer = createDrawer({ button, side, scrim, background: [column], media });
  return { button, side, first, second, scrim, column, cross, drawer, media };
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
    const body = /async function open\(\) \{([\s\S]*?)\n\}\n/.exec(app)?.[1] ?? '';
    assert.match(body, /drawer\.close\(\)/);
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
    assert.match(html, /<button type="button" class="cc-ibtn" id="menu-button" aria-label="Abrir menu" aria-expanded="false" aria-controls="sidebar">/);
    assert.match(html, /<aside class="cc-side" id="sidebar">/);
    assert.match(html, /<div class="cc-scrim" id="scrim" hidden><\/div>/);
    assert.match(html, /<link rel="stylesheet" href="\/ui\/drawer\.css">/);
    assert.match(html, /<div class="cc-notice" id="update-notice" hidden><\/div>\s*<main class="cc-main" id="content">/);
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
    // The panel is not in the inert background: it sits next to the frame, and the notice is the background's.
    assert.match(html, /<\/div>\s*<div class="up-pop" id="update-panel" hidden><\/div>/);
  });

  test('app.js builds the drawer with the column as the background and puts it in the Escape order', () => {
    assert.match(app, /createDrawer\(\{/);
    assert.match(app, /background: \[document\.querySelector\('\.cc-col'\)\]/);
    assert.match(app, /createEscape\(document, \[\s*\{ isOpen: \(\) => appUpdate\.isOpen[^\]]*accountMenu,\s*drawer,\s*\]\)/);
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
