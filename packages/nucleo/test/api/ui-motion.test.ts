/**
 * #750: the /ui CSS keeps motion calm. The only thing allowed to run forever is a request-in-progress spinner that only
 * rotates; nothing animates or transitions box-shadow, filter, width, height, top or left. The rule is generic: it reads
 * every .css under the UI folder, with no list of file names.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';

interface Declaration {
  file: string;
  rule: number;
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

/** #750: splits `text` on `separator` outside parentheses and quotes. */
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

/** #750: blanks the comments, outside quoted strings, and keeps every newline, so a line number stays the file's. */
function blankComments(css: string): string {
  let out = '';
  let quote = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (ch === '\\') {
        out += ch + (css[i + 1] ?? '');
        i++;
        continue;
      }
      if (ch === quote || ch === '\n') quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2);
      const end = close === -1 ? css.length : close + 2;
      out += css.slice(i, end).replace(/[^\n]/g, ' ');
      i = end - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** #750: a property name without its vendor prefix. */
const unprefix = (name: string) => name.toLowerCase().replace(/^-(webkit|moz|ms|o)-/, '');

/** #750: reads one stylesheet: its keyframes (with their frames' declarations) and every other declaration, at any depth of @media and the like. */
function parse(file: string, source: string): Parsed {
  const css = blankComments(source);
  const out: Parsed = { keyframes: [], declarations: [] };
  let at = 0;
  let rules = 0;
  const lineOf = (index: number) => css.slice(0, index).split('\n').length;

  /** #750: finds the `}` that closes the block opened just before `from`. */
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

  function declarationsOf(body: string, offset: number, rule: number): Declaration[] {
    const found: Declaration[] = [];
    let start = 0;
    for (const piece of splitTop(body, ';')) {
      const colon = piece.indexOf(':');
      const lead = piece.length - piece.trimStart().length;
      if (colon > 0 && /^[\w-]+$/.test(piece.slice(0, colon).trim())) {
        found.push({ file, rule, line: lineOf(offset + start + lead), property: unprefix(piece.slice(0, colon).trim()), value: piece.slice(colon + 1).trim() });
      }
      start += piece.length + 1;
    }
    return found;
  }

  /** #750: the declarations of every frame (`from`, `50%`, `to`) between the braces of one @keyframes block. */
  function framesOf(open: number, end: number, rule: number): Declaration[] {
    const frames: Declaration[] = [];
    let cursor = open + 1;
    while (cursor < end) {
      const frameOpen = css.indexOf('{', cursor);
      if (frameOpen === -1 || frameOpen >= end) break;
      const frameEnd = closing(frameOpen + 1);
      frames.push(...declarationsOf(css.slice(frameOpen + 1, frameEnd), frameOpen + 1, rule));
      cursor = frameEnd + 1;
    }
    return frames;
  }

  function walk(from: number, to: number, rule: number) {
    at = from;
    while (at < to) {
      const open = css.indexOf('{', at);
      if (open === -1 || open >= to) {
        out.declarations.push(...declarationsOf(css.slice(at, to), at, rule));
        return;
      }
      // #750: declarations written before a nested block belong to the enclosing rule.
      const head = css.slice(at, open);
      const lastSemicolon = head.lastIndexOf(';');
      if (lastSemicolon !== -1) out.declarations.push(...declarationsOf(head.slice(0, lastSemicolon), at, rule));
      const prelude = head.slice(lastSemicolon + 1).trim();
      const preludeStart = at + lastSemicolon + 1 + (head.slice(lastSemicolon + 1).length - head.slice(lastSemicolon + 1).trimStart().length);
      const end = closing(open + 1);
      const keyframes = /^@(?:-\w+-)?keyframes\s+([\w-]+)$/i.exec(prelude);
      if (keyframes) {
        out.keyframes.push({ file, line: lineOf(preludeStart), name: keyframes[1], declarations: framesOf(open, end, rule) });
      } else if (prelude.startsWith('@') && !/^@(font-face|page|property|counter-style)/i.test(prelude)) {
        walk(open + 1, end, rule);
      } else {
        walk(open + 1, end, ++rules);
      }
      at = end + 1;
    }
  }

  walk(0, css.length, 0);
  return out;
}

const TIME = /^-?[\d.]+m?s$/;
const EASING = /^(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)$|^(?:cubic-bezier|steps|linear)\(/;
const KEYWORD = /^(?:normal|allow-discrete|inherit|initial|unset|revert)$/;

/** #750: the property one item of a `transition` names, or null when it names none (which means `all`). */
function transitionProperty(item: string): string | null {
  for (const token of splitTop(item.trim(), ' ').map((t) => t.trim()).filter(Boolean)) {
    if (TIME.test(token) || EASING.test(token) || KEYWORD.test(token) || /^(?:calc|var)\(/.test(token)) continue;
    return unprefix(token);
  }
  return null;
}

/** #750: every name an item of `animation` or `animation-name` mentions: the identifiers that are not a keyword, a time or an easing. */
const ANIMATION_KEYWORDS = new Set(['infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'none', 'forwards', 'backwards', 'both', 'running', 'paused', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end']);
function animationNames(item: string): string[] {
  return splitTop(item.trim(), ' ')
    .map((t) => t.trim())
    .filter((t) => /^[a-z_][\w-]*$/i.test(t) && !ANIMATION_KEYWORDS.has(t.toLowerCase()) && !/^(?:calc|var)$/i.test(t));
}

const INFINITE = /(^|\s)infinite(\s|$)/i;
const isRotateOnly = (frame: Declaration) => frame.property === 'transform' && /^rotate[xyz3d]*\([^)]*\)$/i.test(frame.value.trim());

const where = (d: Declaration) => `${d.file}:${d.line}: \`${d.property}: ${d.value}\``;

/** #750: a frame of this @keyframes that animates a property the rule forbids. */
function keyframeProblems(k: Keyframes): string[] {
  return k.declarations.filter((frame) => FORBIDDEN.has(frame.property)).map((frame) => `${where(frame)}: @keyframes ${k.name} animates ${frame.property}`);
}

/** #750: every definition of the keyframes `name` that an infinite animation runs must be only a rotation. */
function targetProblems(name: string, targets: Keyframes[], d: Declaration): string[] {
  const problems: string[] = [];
  for (const target of targets) {
    if (target.declarations.length > 0 && target.declarations.every(isRotateOnly)) continue;
    const offender = target.declarations.find((f) => !isRotateOnly(f));
    problems.push(`${where(d)}: \`${name}\` runs forever but is not only \`transform: rotate(...)\`${offender ? ` (${where(offender)})` : ''}`);
  }
  return problems;
}

/** #750: `infinite` is read per item of the comma list, and a name of `animation-name` comes from the same rule only. */
function infiniteProblems(p: Parsed, d: Declaration, keyframes: Map<string, Keyframes[]>): string[] {
  const items = splitTop(d.value, ',');
  if (!items.some((item) => INFINITE.test(item))) return [];
  const names = d.property === 'animation-iteration-count' ? sameRuleNames(p, d) : items.filter((item) => INFINITE.test(item)).flatMap(animationNames);
  const problems: string[] = [];
  if (names.length === 0) problems.push(`${where(d)}: infinite animation with no keyframes this file or any other defines`);
  for (const name of names) {
    const targets = keyframes.get(name);
    if (!targets) problems.push(`${where(d)}: infinite animation \`${name}\` names no @keyframes in the UI folder`);
    problems.push(...targetProblems(name, targets ?? [], d));
  }
  return problems;
}

/** #750: a transition of a listed property, of `all`, or of no property at all (which is `all`). */
function transitionProblems(d: Declaration): string[] {
  const problems: string[] = [];
  for (const item of splitTop(d.value, ',')) {
    if (/^\s*none\s*$/i.test(item)) continue;
    const property = d.property === 'transition-property' ? unprefix(item.trim()) : transitionProperty(item);
    if (property === null) problems.push(`${where(d)}: a transition that names no property is \`all\``);
    else if (property === 'all') problems.push(`${where(d)}: a transition of \`all\` includes ${[...FORBIDDEN].join(', ')}`);
    else if (FORBIDDEN.has(property)) problems.push(`${where(d)}: transitions ${property}`);
  }
  return problems;
}

/** #750: every refusal, each naming the file, the line and the offending declaration. */
export function motionProblems(files: { file: string; css: string }[]): string[] {
  const parsed = files.map(({ file, css }) => parse(file, css));
  const keyframes = new Map<string, Keyframes[]>();
  for (const p of parsed) for (const k of p.keyframes) keyframes.set(k.name, [...(keyframes.get(k.name) ?? []), k]);
  const problems: string[] = [];
  for (const p of parsed) {
    for (const k of p.keyframes) problems.push(...keyframeProblems(k));
    for (const d of p.declarations) {
      if (d.property === 'animation' || d.property === 'animation-iteration-count' || d.property === 'animation-name') problems.push(...infiniteProblems(p, d, keyframes));
      if (d.property === 'transition' || d.property === 'transition-property') problems.push(...transitionProblems(d));
    }
  }
  return problems;
}

/** #750: the names the `animation` or `animation-name` declarations of the same rule give, for an `animation-iteration-count: infinite` declared alone. */
function sameRuleNames(parsed: Parsed, at: Declaration): string[] {
  return parsed.declarations
    .filter((other) => other.rule === at.rule && (other.property === 'animation' || other.property === 'animation-name'))
    .flatMap((other) => splitTop(other.value, ',').flatMap(animationNames));
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

describe('issue 750: the rule reads what the stylesheet really says', () => {
  const pulse = '@keyframes pulse { 50% { opacity: .5; } }';

  test('nested rules are read, and the declarations outside the nested blocks too', () => {
    assert.equal(sheet('.a { &:hover { transition: all .2s; } }').length, 1);
    assert.equal(sheet('.a { color: red; .b { transition: width .2s; } }').length, 1);
    assert.equal(sheet('.a { @media (min-width: 1px) { transition: height .2s; } }').length, 1);
    assert.equal(sheet(`.a { .b { animation: pulse 1s infinite; } }\n${pulse}`).length, 1);
    assert.equal(sheet('.a { transition: width .2s; .b { color: red; } }').length, 1);
    assert.deepEqual(sheet('.a { color: red; &:hover { transition: opacity .2s; } }'), []);
  });

  test('a vendor prefix does not hide a property', () => {
    assert.equal(sheet(`.a { -webkit-animation: pulse 1s infinite; }\n${pulse}`).length, 1);
    assert.equal(sheet('.a { -webkit-transition: all .2s; }').length, 1);
    assert.equal(sheet('.a { transition: -webkit-filter .2s; }').length, 1);
    assert.equal(sheet('@keyframes g { to { -webkit-filter: blur(2px); } }').length, 1);
    assert.deepEqual(sheet('.s { -webkit-animation: spin 1s infinite; }\n@keyframes spin { to { -webkit-transform: rotate(360deg); } }'), []);
  });

  test('`infinite` belongs to its own item of a comma list', () => {
    const keyframes = `@keyframes spin { to { transform: rotate(360deg); } }\n@keyframes fade { 50% { opacity: .5; } }\n${pulse}`;
    assert.deepEqual(sheet(`.a { animation: spin 1s linear infinite, fade 200ms 1; }\n${keyframes}`), []);
    const problems = sheet(`.a { animation: spin 1s, pulse 1s infinite; }\n${keyframes}`);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /`pulse`/);
  });

  test('`animation-iteration-count: infinite` takes its names from its own rule only', () => {
    const spin = '@keyframes spin { to { transform: rotate(360deg); } }';
    assert.equal(sheet(`.spin { animation: spin 1s linear; }\n.x { animation-iteration-count: infinite; }\n${spin}`).length, 1);
    const problems = sheet(`.a { animation-name: p; color: red; animation-iteration-count: infinite; }\n@keyframes p { 50% { opacity: .5; } }`);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /`p`/);
    assert.deepEqual(sheet(`.a { animation-name: spin; color: red; animation-iteration-count: infinite; }\n${spin}`), []);
  });

  test('every definition of a keyframes name must be only a rotation', () => {
    const rotate = '@keyframes spin { to { transform: rotate(360deg); } }';
    assert.equal(sheet(`.s { animation: spin 1s infinite; }\n@keyframes spin { 50% { opacity: .5; } }\n${rotate}`).length, 1);
    assert.equal(sheet(`.s { animation: spin 1s infinite; }\n${rotate}\n@keyframes spin { 50% { opacity: .5; } }`).length, 1);
  });

  test('a comment opener inside a string does not blank the rules after it', () => {
    assert.equal(sheet('.a::before { content: "/*"; } .b { transition: width .2s; } /* x */').length, 1);
    assert.equal(sheet(".a::before { content: '/*'; } .b { transition: width .2s; } /* x */").length, 1);
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
