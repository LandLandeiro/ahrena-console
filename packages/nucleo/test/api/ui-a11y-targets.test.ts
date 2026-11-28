// Issue 764 (M14, WCAG 2.5.8): no clickable control of the /ui has a touch area under 24 x 24 px. The drawing keeps its size;
// where it is smaller, a transparent ::after of at least 24 px is the touch area, so the density does not change.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';

const MIN = 24;
const files = [...readdirSync(UI_FOLDER).filter((f) => f.endsWith('.css')).map((f) => `${UI_FOLDER}${f}`), ...readdirSync(`${UI_FOLDER}screens`).filter((f) => f.endsWith('.css')).map((f) => `${UI_FOLDER}screens/${f}`)];
const css = files.map((f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');

type Rule = { selectors: string[]; body: string };
const rulesOf = (source: string): Rule[] => [...source.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1]!.split(',').map((s) => s.trim()), body: m[2]! }));
const allRules = rulesOf(css);

// Every control that drew under 24 px (or whose height is the text's), by the selector the CSS uses for it.
const SMALL_TARGETS = [
  '.wb-chip-remove',
  '.open-close',
  '.av-toggle',
  'button.wft-toggle',
  '.dash-mini-actions .open-icon',
  '.seg button',
  '.mf-seg button',
  '.feed-arrow',
  'button.wall-kid-toggle',
  '.repo-back',
  '.subs',
  '.up-version',
  '.wb-edit-chip-x',
];

describe('issue 764: the touch area of a control is 24 px at least', () => {
  for (const selector of SMALL_TARGETS) {
    test(`${selector} is positioned and carries a transparent ::after of max(100%, ${MIN}px) both ways`, () => {
      const holder = allRules.find((r) => r.selectors.includes(selector) && /position:\s*relative/.test(r.body));
      assert.ok(holder, `${selector} needs position: relative in the CSS of its screen`);
      const area = allRules.find((r) => r.selectors.includes(`${selector}::after`));
      assert.ok(area, `${selector}::after is missing in the CSS of its screen`);
      assert.match(area!.body, /content:\s*""/);
      assert.match(area!.body, /position:\s*absolute/);
      assert.match(area!.body, new RegExp(`width:\\s*max\\(100%,\\s*${MIN}px\\)`));
      assert.match(area!.body, new RegExp(`height:\\s*max\\(100%,\\s*${MIN}px\\)`));
      assert.doesNotMatch(area!.body, /background|border|outline/, 'the area is transparent');
    });
  }

  test('the listed sizes are the drawing: none of the old ones was raised (the density stays)', () => {
    const size = (selector: string, prop: string) => {
      const r = rulesOf(css).find((x) => x.selectors.includes(selector) && new RegExp(`(^|[;\\s])${prop}:`).test(x.body));
      return r ? Number(new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+)px`).exec(r.body)?.[1]) : null;
    };
    assert.equal(size('.wb-chip-remove', 'width'), 18);
    assert.equal(size('.open-close', 'width'), 22);
    assert.equal(size('.av-toggle', 'width'), 22);
    assert.equal(size('.wft-toggle', 'width'), 22);
    assert.equal(size('.dash-mini-actions .open-icon', 'width'), 22);
  });

  test('no clickable control declares a fixed size under 24 px without a touch area for it', () => {
    const clickable = /(toggle|remove|close|arrow|back|icon-btn|ibtn|fold|expand|^\.exp$)/;
    const covered = new Set(SMALL_TARGETS.map((s) => s.replace(/^button\./, '.')));
    const bad: string[] = [];
    for (const r of rulesOf(css)) {
      const w = /(?:^|[;\s])width:\s*(\d+)px/.exec(r.body)?.[1];
      const h = /(?:^|[;\s])height:\s*(\d+)px/.exec(r.body)?.[1];
      if (!((w && Number(w) < MIN) || (h && Number(h) < MIN))) continue;
      for (const s of r.selectors) {
        const last = s.split(/\s+/).pop()!.replace(/::?[a-z-]+(\([^)]*\))?/g, '');
        if (/\.icon\b|::|\bi\b|-(dot|gap)$/.test(s) || !clickable.test(last)) continue;
        if (!covered.has(s) && !covered.has(last)) bad.push(s);
      }
    }
    assert.deepEqual(bad, []);
  });
});
