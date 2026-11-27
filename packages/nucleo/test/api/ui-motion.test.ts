// #750: the /ui CSS keeps motion calm. The only thing allowed to run forever is a request-in-progress spinner that only
// rotates; nothing animates or transitions box-shadow, filter, width, height, top or left. The rule is generic: it reads
// every .css under the UI folder, with no list of file names.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';

interface Declaration {
  file: string;
  line: number;
  property: string;
  value: string;
}
interface Keyframes {
  file: string;
  line: number;
  name: string;
  declarations: Declaration[];
}
interface Parsed {
  keyframes: Keyframes[];
  declarations: Declaration[];
}

const FORBIDDEN = new Set(['box-shadow', 'filter', 'width', 'height', 'top', 'left']);

/** Splits `text` on `separator` outside parentheses and quotes. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** Blanks the comments and keeps every newline, so a line number stays the file's. */
const blankComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** Reads one stylesheet: its keyframes (with their frames' declarations) and every other declaration, at any depth of @media and the like. */
function parse(file: string, source: string): Parsed {
  const css = blankComments(source);
  const out: Parsed = { keyframes: [], declarations: [] };
  let at = 0;
  const lineOf = (index: number) => css.slice(0, index).split('\n').length;

  /** Finds the `}` that closes the block opened just before `from`. */
  function closing(from: number): number {
    let depth = 1;
    let quote = '';
    for (let i = from; i < css.length; i++) {
      const ch = css[i];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return i;
    }
    return css.length;
  }

  function declarationsOf(body: string, offset: number): Declaration[] {
    const found: Declaration[] = [];
    let start = 0;
    for (const piece of splitTop(body, ';')) {
      const colon = piece.indexOf(':');
      const lead = piece.length - piece.trimStart().length;
      if (colon > 0 && /^[\w-]+$/.test(piece.slice(0, colon).trim())) {
        found.push({ file, line: lineOf(offset + start + lead), property: piece.slice(0, colon).trim().toLowerCase(), value: piece.slice(colon + 1).trim() });
      }
      start += piece.length + 1;
    }
    return found;
  }

  function walk(from: number, to: number) {
    at = from;
    while (at < to) {
      const open = css.indexOf('{', at);
      if (open === -1 || open >= to) {
        out.declarations.push(...declarationsOf(css.slice(at, to), at));
        return;
      }
      // Declarations written before a nested block belong to the enclosing rule.
      const head = css.slice(at, open);
      const lastSemicolon = head.lastIndexOf(';');
      if (lastSemicolon !== -1) out.declarations.push(...declarationsOf(head.slice(0, lastSemicolon), at));
      const prelude = head.slice(lastSemicolon + 1).trim();
      const preludeStart = at + lastSemicolon + 1 + (head.slice(lastSemicolon + 1).length - head.slice(lastSemicolon + 1).trimStart().length);
      const end = closing(open + 1);
      const keyframes = /^@(?:-\w+-)?keyframes\s+([\w-]+)$/i.exec(prelude);
      if (keyframes) {
        const frames: Declaration[] = [];
        let cursor = open + 1;
        while (cursor < end) {
          const frameOpen = css.indexOf('{', cursor);
          if (frameOpen === -1 || frameOpen >= end) break;
          const frameEnd = closing(frameOpen + 1);
          frames.push(...declarationsOf(css.slice(frameOpen + 1, frameEnd), frameOpen + 1));
          cursor = frameEnd + 1;
        }
        out.keyframes.push({ file, line: lineOf(preludeStart), name: keyframes[1], declarations: frames });
      } else if (prelude.startsWith('@') && !/^@(font-face|page|property|counter-style)/i.test(prelude)) {
        walk(open + 1, end);
      } else {
        out.declarations.push(...declarationsOf(css.slice(open + 1, end), open + 1));
      }
      at = end + 1;
    }
  }

  walk(0, css.length);
  return out;
}

const TIME = /^-?[\d.]+m?s$/;
const EASING = /^(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)$|^(?:cubic-bezier|steps|linear)\(/;
const KEYWORD = /^(?:normal|allow-discrete|inherit|initial|unset|revert)$/;

/** The property one item of a `transition` names, or null when it names none (which means `all`). */
function transitionProperty(item: string): string | null {
  for (const token of splitTop(item.trim(), ' ').map((t) => t.trim()).filter(Boolean)) {
    if (TIME.test(token) || EASING.test(token) || KEYWORD.test(token) || /^(?:calc|var)\(/.test(token)) continue;
    return token.toLowerCase();
  }
  return null;
}

/** Every name an item of `animation` or `animation-name` mentions: the identifiers that are not a keyword, a time or an easing. */
const ANIMATION_KEYWORDS = new Set(['infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'none', 'forwards', 'backwards', 'both', 'running', 'paused', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end']);
function animationNames(item: string): string[] {
  return splitTop(item.trim(), ' ')
    .map((t) => t.trim())
    .filter((t) => /^[a-z_][\w-]*$/i.test(t) && !ANIMATION_KEYWORDS.has(t.toLowerCase()) && !/^(?:calc|var)$/i.test(t));
}

const isRotateOnly = (frame: Declaration) => frame.property === 'transform' && /^rotate[xyz3d]*\([^)]*\)$/i.test(frame.value.trim());

/** Every refusal, each naming the file, the line and the offending declaration. */
export function motionProblems(files: { file: string; css: string }[]): string[] {
  const parsed = files.map(({ file, css }) => parse(file, css));
  const keyframes = new Map<string, Keyframes>();
  for (const p of parsed) for (const k of p.keyframes) keyframes.set(k.name, k);
  const problems: string[] = [];
  const where = (d: Declaration) => `${d.file}:${d.line}: \`${d.property}: ${d.value}\``;

  for (const p of parsed) {
    for (const k of p.keyframes) {
      for (const frame of k.declarations) {
        if (FORBIDDEN.has(frame.property)) problems.push(`${where(frame)}: @keyframes ${k.name} animates ${frame.property}`);
      }
    }
    // Declarations of one rule sit together in the list; `infinite` and the names may come from two of them, so the rule is read as a whole by its line neighbours.
    for (const d of p.declarations) {
      if (d.property === 'animation' || d.property === 'animation-iteration-count' || d.property === 'animation-name') {
        const items = splitTop(d.value, ',');
        const infinite = items.some((item) => /(^|\s)infinite(\s|$)/i.test(item));
        if (!infinite) continue;
        const names = d.property === 'animation-iteration-count' ? sameRuleNames(p, d) : items.flatMap(animationNames);
        if (names.length === 0) problems.push(`${where(d)}: infinite animation with no keyframes this file or any other defines`);
        for (const name of names) {
          const target = keyframes.get(name);
          if (!target) problems.push(`${where(d)}: infinite animation \`${name}\` names no @keyframes in the UI folder`);
          else if (target.declarations.length === 0 || !target.declarations.every(isRotateOnly)) {
            const offender = target.declarations.find((f) => !isRotateOnly(f));
            problems.push(`${where(d)}: \`${name}\` runs forever but is not only \`transform: rotate(...)\`${offender ? ` (${where(offender)})` : ''}`);
          }
        }
      }
      if (d.property === 'transition' || d.property === 'transition-property') {
        for (const item of splitTop(d.value, ',')) {
          if (/^\s*none\s*$/i.test(item)) continue;
          const property = d.property === 'transition-property' ? item.trim().toLowerCase() : transitionProperty(item);
          if (property === null) problems.push(`${where(d)}: a transition that names no property is \`all\``);
          else if (property === 'all') problems.push(`${where(d)}: a transition of \`all\` includes ${[...FORBIDDEN].join(', ')}`);
          else if (FORBIDDEN.has(property)) problems.push(`${where(d)}: transitions ${property}`);
        }
      }
    }
  }
  return problems;
}

/** The names the `animation` or `animation-name` declarations of the same rule give, for an `animation-iteration-count: infinite` declared alone. */
function sameRuleNames(parsed: Parsed, at: Declaration): string[] {
  const index = parsed.declarations.indexOf(at);
  const names: string[] = [];
  for (const side of [-1, 1]) {
    for (let i = index + side; i >= 0 && i < parsed.declarations.length; i += side) {
      const other = parsed.declarations[i];
      if (other.line - at.line > 20 || at.line - other.line > 20) break;
      if (other.property === 'animation' || other.property === 'animation-name') names.push(...splitTop(other.value, ',').flatMap(animationNames));
      else if (other.property.startsWith('animation')) continue;
      else break;
    }
  }
  return names;
}

function cssFiles(folder: string): string[] {
  return readdirSync(folder)
    .flatMap((name) => {
      const path = join(folder, name);
      return statSync(path).isDirectory() ? cssFiles(path) : name.endsWith('.css') ? [path] : [];
    })
    .sort();
}

const sheet = (css: string, file = 'fixture.css') => motionProblems([{ file, css }]);

describe('issue 750: the rule that refuses restless motion', () => {
  test('a spinner that only rotates may run forever, from the same file or from another', () => {
    assert.deepEqual(sheet('.s { animation: spin 1s linear infinite; }\n@keyframes spin { to { transform: rotate(360deg); } }'), []);
    assert.deepEqual(
      motionProblems([
        { file: 'a.css', css: '.s { animation-name: spin; animation-iteration-count: infinite; }' },
        { file: 'b.css', css: '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }' },
      ]),
      [],
    );
  });

  test('infinite on anything but a rotation is refused, with file, line and declaration', () => {
    const [problem, ...rest] = sheet('\n.dot { animation: cc-pulse 2.4s ease-in-out infinite; }\n@keyframes cc-pulse { 50% { opacity: .4; } }', 'shell.css');
    assert.equal(rest.length, 0);
    assert.match(problem, /^shell\.css:2: `animation: cc-pulse 2\.4s ease-in-out infinite`/);
    assert.match(problem, /not only `transform: rotate/);
    assert.equal(sheet('.b { animation: pulsar 1.4s infinite; }\n@keyframes pulsar { 50% { transform: scale(1.1); } }').length, 1);
    assert.equal(sheet('.b { animation-name: pulsar; animation-iteration-count: infinite; }\n@keyframes pulsar { 50% { opacity: .5; } }').length, 1);
    assert.equal(sheet('.b { animation: gone 1s infinite; }').length, 1, 'an infinite animation whose frames cannot be read is refused');
    assert.equal(sheet('.s { animation: spin 1s infinite; }\n@keyframes spin { to { transform: rotate(360deg); opacity: 0; } }').length, 1, 'a rotation plus anything else is not only a rotation');
  });

  test('a finite animation of opacity is allowed; a finite one of box-shadow, filter, width, height, top or left is refused', () => {
    assert.deepEqual(sheet('.d { animation: blink 600ms 1; }\n@keyframes blink { 50% { opacity: .4; } }'), []);
    for (const property of ['box-shadow', 'filter', 'width', 'height', 'top', 'left']) {
      const [problem, ...rest] = sheet(`@keyframes grow {\n  to { ${property}: 0; }\n}`);
      assert.equal(rest.length, 0, property);
      assert.match(problem, new RegExp(`^fixture\\.css:2: \`${property}: 0\``));
    }
  });

  test('transitions: a named safe property passes; the listed ones, `all` and a shorthand with no property are refused', () => {
    assert.deepEqual(sheet('.a { transition: border-color var(--motion-fast) var(--ease-out), opacity .2s; }\n.b { transition-property: transform, visibility; }\n.c { transition: none; }'), []);
    for (const value of ['box-shadow .2s', 'filter 1s ease', 'width .2s', 'height .2s', 'top .2s', 'left .2s', 'opacity .2s, width .2s']) {
      assert.equal(sheet(`.a { transition: ${value}; }`).length, 1, value);
    }
    assert.equal(sheet('.a { transition: all .2s; }').length, 1);
    assert.equal(sheet('.a { transition: .2s ease-out; }').length, 1);
    assert.equal(sheet('.a { transition: var(--motion-fast); }').length, 1);
    assert.equal(sheet('.a { transition-property: all; }').length, 1);
    assert.equal(sheet('.a { transition-property: left; }').length, 1);
    assert.match(sheet('\n\n.a {\n  color: red;\n  transition: width .2s;\n}')[0], /^fixture\.css:5: `transition: width \.2s`/);
  });

  test('a rule inside @media is read like any other, and a comment hides nothing from the line count', () => {
    const [problem] = sheet('/* a\ncomment */\n@media (prefers-reduced-motion: no-preference) {\n  .a { transition: height .2s; }\n}');
    assert.match(problem, /^fixture\.css:4: `transition: height \.2s`/);
    assert.deepEqual(sheet('/* .a { transition: all .2s; } */'), []);
  });
});

describe('issue 750: the CSS of /ui', () => {
  test('no animation runs forever except a rotating spinner, and nothing animates or transitions what moves the layout or the paint', () => {
    const files = cssFiles(UI_FOLDER);
    assert.ok(files.length > 20, 'the folder is read in full, screens/ included');
    assert.ok(files.some((f) => f.includes('/screens/')));
    const problems = motionProblems(files.map((f) => ({ file: relative(UI_FOLDER, f), css: readFileSync(f, 'utf8') })));
    assert.deepEqual(problems, []);
  });
});
