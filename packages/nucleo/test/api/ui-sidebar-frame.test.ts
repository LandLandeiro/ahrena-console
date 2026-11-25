// Issue 750: the sidebar and the page frame, as rules. The fake DOM has no layout, so the measures are asserted on the
// rules; the real browser numbers (width, item height, footer at 1100x700) come from the capture run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';

const shell = readFileSync(`${UI_FOLDER}shell.css`, 'utf8');
const rule = (css: string, selector: string) => css.match(new RegExp(`^${selector.replace(/[.#\[\]="()>:+-]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

describe('issue 750: the bar', () => {
  test('248 px wide, on --sidebar, with the divider in --border', () => {
    assert.match(rule(shell, '.cc'), /grid-template-columns: 248px minmax\(0, 1fr\)/);
    assert.match(rule(shell, '.cc-side'), /background: var\(--sidebar\)/);
    assert.match(rule(shell, '.cc-side'), /border-right: 1px solid var\(--border\)/);
  });

  test('an item is 31 px at least, one line, 14 px, gap 11 and 10 px at the sides', () => {
    const item = rule(shell, '.cc-nav');
    assert.match(item, /min-height: 31px/);
    assert.match(item, /gap: 11px/);
    assert.match(item, /padding: 0 10px/);
    assert.match(item, /font-size: 14px/);
    assert.match(item, /flex: none/);
    assert.match(item, /white-space: nowrap/);
    assert.match(rule(shell, '.cc-nav-label'), /overflow: hidden/);
    assert.match(rule(shell, '.cc-nav-label'), /text-overflow: ellipsis/);
    assert.match(rule(shell, '.cc-nav-label'), /white-space: nowrap/);
  });

  test('the current item is a --surface block with a --border line, weight 500, no rose bar', () => {
    const on = rule(shell, '.cc-nav.on');
    assert.match(on, /background: var\(--surface\)/);
    assert.match(on, /border-color: var\(--border\)/);
    assert.match(on, /color: var\(--text\)/);
    assert.match(on, /font-weight: var\(--weight-medium\)/);
    assert.doesNotMatch(on, /inset 2px 0 0|--rose/);
    assert.match(rule(shell, '.cc-nav'), /border: 1px solid transparent/);
  });

  test('group titles are 11 px mono capitals in --subtle', () => {
    const title = rule(shell, '.cc-nav-title');
    assert.match(title, /font-family: var\(--font-mono\)/);
    assert.match(title, /font-size: 11px/);
    assert.match(title, /text-transform: uppercase/);
    assert.match(title, /color: var\(--subtle\)/);
  });

  test('only the nav scrolls: the top and the foot are fixed, and the nav may shrink to nothing', () => {
    assert.match(rule(shell, '#nav'), /flex: 1 1 auto/);
    assert.match(rule(shell, '#nav'), /min-height: 0/);
    assert.match(rule(shell, '#nav'), /overflow-y: auto/);
    assert.match(rule(shell, '.cc-side'), /overflow: hidden/);
    assert.match(rule(shell, '.cc-brand'), /flex: none/);
    assert.match(rule(shell, '.cc-foot'), /flex: none/);
    assert.match(rule(shell, '.cc'), /height: 100vh|height: 100dvh/);
  });

  test('counts: a tag in a generated pair, a plain count in mono --subtle', () => {
    assert.match(rule(shell, '.cc-nav-tag[data-tone="waiting"]'), /color: var\(--status-waiting-text\)/);
    assert.match(rule(shell, '.cc-nav-tag[data-tone="waiting"]'), /background: var\(--status-waiting-badge\)/);
    assert.match(rule(shell, '.cc-nav-tag[data-tone="waiting"]'), /border-color: var\(--status-waiting-border\)/);
    assert.match(rule(shell, '.cc-nav-tag[data-tone="active"]'), /color: var\(--status-active-text\)/);
    assert.match(rule(shell, '.cc-nav-tag[data-tone="active"]'), /background: var\(--status-active-badge\)/);
    assert.match(rule(shell, '.cc-nav-tag[data-tone="active"]'), /border-color: var\(--status-active-border\)/);
    assert.match(rule(shell, '.cc-nav-tag'), /border-radius: var\(--radius-tag\)/);
    assert.match(rule(shell, '.cc-nav-tag'), /white-space: nowrap/);
    assert.match(rule(shell, '.cc-nav-count'), /font-family: var\(--font-mono\)/);
    assert.match(rule(shell, '.cc-nav-count'), /color: var\(--subtle\)/);
    assert.match(rule(shell, '.cc-sr-only'), /clip: rect\(0, 0, 0, 0\)|clip-path: inset\(50%\)/);
    assert.doesNotMatch(shell, /\.cc-nav \.q\b/);
  });

  test('the focus ring of the frame is 2 px --accent-line with an offset of 2 px', () => {
    for (const selector of ['.cc-nav:focus-visible, .btn:focus-visible, .cc-brand:focus-visible, .cc-ibtn:focus-visible']) {
      const body = rule(shell, selector);
      assert.match(body, /outline: 2px solid var\(--accent-line\)/, selector);
      assert.match(body, /outline-offset: 2px/, selector);
    }
    assert.match(rule(shell, '.cc-gh:focus-visible'), /outline: 2px solid var\(--accent-line\)/);
  });

  test('the measures of the kit: brand 16/12 without a line under it, titles with margin 11px 0 3px, hover at 60% surface, 1 px between items', () => {
    assert.match(rule(shell, '.cc-brand b'), /font-size: 16px/);
    assert.match(rule(shell, '.cc-brand small'), /font-size: 12px/);
    assert.doesNotMatch(rule(shell, '.cc-brand'), /border-bottom/);
    const title = rule(shell, '.cc-nav-title');
    assert.match(title, /margin: 11px 0 3px/);
    assert.match(title, /padding: 0 10px/);
    assert.match(rule(shell, '.cc-nav:hover'), /background: color-mix\(in srgb, var\(--surface\) 60%, transparent\)/);
    assert.match(rule(shell, '#nav'), /gap: 1px/);
    assert.match(rule(shell, '.cc-nav-section'), /gap: 1px/);
  });

  test('the footer line runs from edge to edge of the bar: the bar has no side padding, the footer carries it', () => {
    assert.match(rule(shell, '.cc-side'), /padding: 0[;\s]/);
    const foot = rule(shell, '.cc-foot');
    assert.match(foot, /border-top: 1px solid var\(--border\)/);
    assert.match(foot, /padding: 10px 8px/);
    assert.doesNotMatch(rule(shell, '#nav'), /margin: 0 -4px/);
  });

  test('the count tag is positioned, so the screen-reader text inside it does not scroll the page', () => {
    assert.match(rule(shell, '.cc-nav-tag'), /position: relative/);
  });

  test('the live block: 8 px dot, 14 px text at weight 500, padding 9px 12px, card radius, note 12.5 px --subtle', () => {
    const live = rule(shell, '.cc-live');
    assert.match(live, /padding: 9px 12px/);
    assert.match(live, /border-radius: var\(--radius-card\)/);
    assert.match(live, /border: 1px solid var\(--border\)/);
    assert.match(rule(shell, '.cc-live-dot'), /width: 8px/);
    assert.match(rule(shell, '.cc-live-dot'), /height: 8px/);
    assert.match(rule(shell, '.cc-live-dot'), /border-radius: 50%/);
    assert.match(rule(shell, '.cc-live-line b'), /font-size: 14px/);
    assert.match(rule(shell, '.cc-live-line b'), /font-weight: var\(--weight-medium\)/);
    assert.match(rule(shell, '.cc-live-note'), /font-size: 12\.5px/);
    assert.match(rule(shell, '.cc-live-note'), /color: var\(--subtle\)/);
  });

  test('offline is not told by color alone: the word and a hollow dot; the pulse stops under reduced motion', () => {
    const off = rule(shell, '.cc-live[data-state="offline"] .cc-live-dot');
    assert.match(off, /background: transparent/);
    assert.match(off, /border: 2px solid var\(--status-error-dot\)/);
    assert.match(rule(shell, '.cc-live[data-state="live"] .cc-live-dot'), /animation: cc-pulse/);
    assert.match(shell, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.cc-live\[data-state=\"live\"\] \.cc-live-dot \{ animation: none; \}/);
    assert.match(shell, /@keyframes cc-pulse/);
  });

  test('the person: a 32 px avatar', () => {
    assert.match(rule(shell, '.cc-avatar'), /width: 32px/);
    assert.match(rule(shell, '.cc-avatar'), /height: 32px/);
  });

  test('the version is text in the note: no border and no fill at rest, underlined on hover, a visible focus', () => {
    const update = readFileSync(`${UI_FOLDER}app-update.css`, 'utf8');
    const base = rule(update, '.up-version');
    assert.match(base, /border: 0/);
    assert.match(base, /background: transparent/);
    assert.match(base, /padding: 0/);
    assert.match(base, /font-size: inherit/);
    assert.match(base, /color: inherit/);
    assert.doesNotMatch(base, /height: 20px|border-radius|--border-control/);
    assert.match(rule(update, '.up-version:hover'), /text-decoration: underline/);
    assert.doesNotMatch(rule(update, '.up-version:hover'), /background/);
    assert.match(rule(update, '.up-version:focus-visible'), /outline: 2px solid var\(--accent-line\)/);
    assert.doesNotMatch(update, /\.up-version\[data-new\] \{[^}]*accent-text/);
    assert.match(rule(update, '.up-dot'), /background: var\(--accent\)/);
  });

  test('the footer: the live block, the person row and two 28 px buttons without a border', () => {
    assert.match(rule(shell, '.cc-ibtn'), /width: 28px/);
    assert.match(rule(shell, '.cc-ibtn'), /height: 28px/);
    assert.match(rule(shell, '.cc-ibtn'), /border: 0|border: 1px solid transparent/);
    assert.match(rule(shell, '.cc-ibtn'), /background: transparent/);
    assert.match(rule(shell, '.cc-me'), /display: flex/);
    assert.match(rule(shell, '.cc-avatar'), /background: var\(--avatar\)/);
    assert.match(rule(shell, '.cc-live'), /border: 1px solid var\(--border\)/);
  });

  test('the old strip of 640 px is gone: below 860 px the bar is a drawer', () => {
    assert.doesNotMatch(shell, /max-width: 640px/);
    const update = readFileSync(`${UI_FOLDER}app-update.css`, 'utf8');
    assert.doesNotMatch(update, /max-width: 640px/);
    // The version panel opens beside the bar (248 px) and, in the drawer's width, from the left edge, above the drawer.
    assert.match(rule(update, '.up-pop'), /left: 260px/);
    assert.match(rule(update, '.up-pop'), /z-index: 60/);
    assert.match(update, /@media \(max-width: 859px\) \{[^}]*\.up-pop \{ left: 16px; \}/);
  });
});
