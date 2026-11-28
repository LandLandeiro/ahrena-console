// #750: the count tags in the bar pass 4.5:1 from tokens.json, in both themes, on the bar and on the current item.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';

const tokens = JSON.parse(readFileSync(new URL('../../../../docs/brand/tokens.json', import.meta.url), 'utf8'));
const channel = (hex: string, at: number) => {
  const v = parseInt(hex.slice(at, at + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const shell = readFileSync(`${UI_FOLDER}shell.css`, 'utf8');
const tagRule = (tone: string) => shell.match(new RegExp(`^\\.cc-nav-tag\\[data-tone="${tone}"\\] \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

describe('issue 750: contrast of what the bar writes', () => {
  for (const theme of ['dark', 'light'] as const) {
    for (const [tone, status] of [['waiting', 'waiting'], ['active', 'active']] as const) {
      test(`${theme}: the ${tone} tag text is at least 4.5:1 on its own fill`, () => {
        const s = tokens.status[status][theme];
        assert.ok(ratio(s.text, s.badge) >= 4.5, `${s.text} on ${s.badge} is ${ratio(s.text, s.badge).toFixed(2)}`);
      });
    }
    test(`${theme}: the plain count (--subtle) is at least 4.5:1 on the bar and on the current item`, () => {
      const t = tokens.themes[theme];
      assert.ok(ratio(t.subtle, t.sidebar) >= 4.5);
      assert.ok(ratio(t.subtle, t.surface) >= 4.5);
    });
    test(`${theme}: the focus ring (--accent-line) is at least 3:1 on the bar, the page and the current item`, () => {
      const t = tokens.themes[theme];
      for (const bg of ['sidebar', 'bg', 'surface']) assert.ok(ratio(t.accentLine, t[bg]) >= 3, `${theme} accentLine on ${bg}`);
    });
    test(`${theme}: the icons and the person's button (--muted) are at least 3:1 on the bar`, () => {
      const t = tokens.themes[theme];
      assert.ok(ratio(t.muted, t.sidebar) >= 3);
    });
  }

  for (const theme of ['dark', 'light'] as const) {
    test(`${theme}: the live dot is at least 3:1 on its card, in the two states it draws`, () => {
      const t = tokens.themes[theme];
      for (const status of ['completed', 'error']) {
        const dot = tokens.status[status][theme].dot;
        assert.ok(ratio(dot, t.surface) >= 3, `${theme} ${status} dot on surface is ${ratio(dot, t.surface).toFixed(2)}`);
      }
    });
    test(`${theme}: the note and the version button (--subtle) are at least 4.5:1 on the live card (--surface)`, () => {
      const t = tokens.themes[theme];
      assert.ok(ratio(t.subtle, t.surface) >= 4.5);
    });
  }

  test('the tag does not use accent-text, which fails on the bar in the light theme', () => {
    const light = tokens.themes.light;
    assert.ok(ratio(light.accentText, light.sidebar) < 4.5, 'the reason: accentText is under 4.5:1 on the light bar');
    assert.doesNotMatch(tagRule('active'), /--accent-text/);
    assert.match(tagRule('active'), /color: var\(--status-active-text\)/);
    assert.match(tagRule('active'), /background: var\(--status-active-badge\)/);
    assert.match(tagRule('waiting'), /background: var\(--status-waiting-badge\)/);
  });
});
