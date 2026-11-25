// #751: the state icon, the state tag and the session's state, plus the contrast of everything the
// card and the row of the wall write (icon 3:1, text 4.5:1 on --surface, both themes, from tokens.json).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { instalarDomFalso, texto, type ElementoFalso } from './fake-dom.ts';

instalarDomFalso();
// @ts-expect-error: browser module, plain JavaScript
const { STATE_KINDS, stateIcon, stateOfSession, stateTag } = await import('../../ui/state-icon.js');

const tokens = JSON.parse(readFileSync(new URL('../../../../docs/brand/tokens.json', import.meta.url), 'utf8'));
const read = (name: string) => readFileSync(`${UI_FOLDER}${name}`, 'utf8');
const stateCss = read('state-icon.css');
const monogramCss = read('agent-monogram.css');
const shell = read('shell.css');
const index = read('index.html');

const channel = (hex: string, at: number) => {
  const v = parseInt(hex.slice(at, at + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
/** A brand.css variable, resolved for a theme from tokens.json (no colour is written in this test). */
function token(name: string, theme: 'dark' | 'light'): string {
  const status = name.match(/^--status-(\w+)-(dot|text|badge|border)$/);
  if (status) return tokens.status[status[1]!][theme][status[2]!];
  const agent = name.match(/^--agent-(\w+)-(text|bg)$/);
  if (agent) return tokens.agent[agent[1]!][theme][agent[2]!];
  const key = name.slice(2).replace(/-(\w)/g, (_m, c: string) => c.toUpperCase());
  const value = tokens.themes[theme][key];
  assert.ok(value, `${name} is not in tokens.json`);
  return value;
}
/** The declaration `prop: var(--x)` of the rule whose selector is exactly `selector`. */
function declared(css: string, selector: string, prop: string): string {
  const rule = css.match(new RegExp(`^${selector.replace(/[.[\]]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
  const v = rule.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*var\\((--[\\w-]+)\\)`))?.[1];
  assert.ok(v, `${selector} has no ${prop}: var(--…) in the sheet`);
  return v;
}

const parts = (svg: ElementoFalso) => svg.children.map((c) => [c.tagName.toLowerCase(), c.getAttribute('class')]);

describe('#751: stateIcon, the eight shapes', () => {
  test('the eight kinds exist and each one is a 16px grid svg, aria-hidden, with its own class', () => {
    assert.deepEqual([...STATE_KINDS], ['needs', 'permission', 'working', 'queued', 'paused', 'completed', 'error', 'answered']);
    for (const kind of STATE_KINDS) {
      const svg = stateIcon(kind, { fraction: 0.5 });
      assert.equal(svg.tagName, 'SVG');
      assert.equal(svg.getAttribute('viewBox'), '0 0 16 16');
      assert.equal(svg.getAttribute('width'), '16');
      assert.equal(svg.getAttribute('aria-hidden'), 'true');
      assert.equal(svg.getAttribute('focusable'), 'false');
      assert.match(svg.getAttribute('class')!, new RegExp(`\\bstate-icon state-icon-${kind}\\b`));
    }
  });

  test('every shape is different from the others (the state does not depend on colour)', () => {
    const shapes = STATE_KINDS.map((k: string) => JSON.stringify(stateIcon(k, { fraction: 0.5 }).children.map((c) => [c.tagName, ...[...c.atributos.entries()]])));
    assert.equal(new Set(shapes).size, STATE_KINDS.length);
  });

  test('the ring is r 6.25 with a 1.5 stroke; the disc is r 7; the dot is r 2.5', () => {
    const ring = stateIcon('needs', {}).querySelector('circle.si-ring')!;
    assert.deepEqual([ring.getAttribute('cx'), ring.getAttribute('cy'), ring.getAttribute('r'), ring.getAttribute('stroke-width')], ['8', '8', '6.25', '1.5']);
    assert.equal(stateIcon('needs', {}).querySelector('circle.si-dot')!.getAttribute('r'), '2.5');
    for (const kind of ['completed', 'error']) assert.equal(stateIcon(kind, {}).querySelector('circle.si-disc')!.getAttribute('r'), '7');
  });

  test('the shapes by kind: ring, lock, slice, clock, dashes, ticks and cross', () => {
    assert.deepEqual(parts(stateIcon('needs', {})), [['circle', 'si-ring'], ['circle', 'si-dot']]);
    assert.deepEqual(parts(stateIcon('permission', {})), [['circle', 'si-ring'], ['path', 'si-mark'], ['rect', 'si-fill']]);
    assert.deepEqual(parts(stateIcon('working', {})), [['circle', 'si-ring'], ['path', 'si-fill']]);
    assert.deepEqual(parts(stateIcon('queued', {})), [['circle', 'si-ring'], ['path', 'si-mark']]);
    assert.deepEqual(parts(stateIcon('paused', {})), [['circle', 'si-ring']]);
    assert.equal(stateIcon('paused', {}).querySelector('circle.si-ring')!.getAttribute('stroke-dasharray'), '2.2 2.1');
    assert.deepEqual(parts(stateIcon('completed', {})), [['circle', 'si-disc'], ['path', 'si-cut']]);
    assert.deepEqual(parts(stateIcon('error', {})), [['circle', 'si-disc'], ['path', 'si-cut']]);
    assert.deepEqual(parts(stateIcon('answered', {})), [['circle', 'si-ring'], ['path', 'si-mark']]);
  });

  test('the slice of working: 6% at least, a whole turn without a null arc, the large arc flag past half', () => {
    const d = (fraction: number | undefined) => stateIcon('working', { fraction }).querySelector('path.si-fill')!.getAttribute('d');
    assert.equal(d(0), 'M8 8V4.5A3.5 3.5 0 0 1 9.29 4.75Z');
    assert.equal(d(0.06), d(0));
    assert.equal(d(-3), d(0));
    assert.equal(d(0.25), 'M8 8V4.5A3.5 3.5 0 0 1 11.50 8.00Z');
    assert.equal(d(0.5), 'M8 8V4.5A3.5 3.5 0 0 1 8.00 11.50Z');
    assert.equal(d(0.75), 'M8 8V4.5A3.5 3.5 0 1 1 4.50 8.00Z');
    assert.equal(d(1), 'M8 8V4.5A3.5 3.5 0 1 1 7.98 4.50Z');
    assert.equal(d(7), d(1));
    assert.equal(d(undefined), d(0));
    assert.equal(d(Number.NaN), d(0));
  });

  test('the shapes carry no colour: no hex, no var(), no rgb in any attribute', () => {
    for (const kind of STATE_KINDS) {
      for (const node of [stateIcon(kind, { fraction: 0.4 }), ...stateIcon(kind, { fraction: 0.4 }).children]) {
        for (const [k, v] of node.atributos) assert.doesNotMatch(v, /#|rgb|hsl|var\(/i, `${kind} ${k}`);
      }
    }
    assert.doesNotMatch(read('state-icon.js'), /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    assert.doesNotMatch(stateCss, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });

  test('an unknown kind draws nothing', () => {
    assert.equal(stateIcon('banana', {}), null);
  });
});

describe('#751: the colour of each icon is a class and a theme variable', () => {
  const expected: Record<string, string> = {
    needs: '--status-waiting-dot',
    permission: '--status-waiting-dot',
    working: '--status-active-text',
    queued: '--status-active-text',
    paused: '--subtle',
    completed: '--muted',
    answered: '--muted',
    error: '--status-error-text',
  };
  for (const [kind, variable] of Object.entries(expected)) {
    test(`${kind}: color is var(${variable})`, () => {
      assert.equal(declared(stateCss, `.state-icon-${kind}`, 'color'), variable);
    });
  }
  test('the middle of a filled disc is --surface', () => {
    assert.equal(declared(stateCss, '.state-icon .si-cut', 'stroke'), '--surface');
  });
});

describe('#751: stateTag: the icon and the written label, no background', () => {
  test('icon, then the label as text, in --muted, 7px apart, with no fill', () => {
    const tag = stateTag({ kind: 'needs', label: 'Pergunta' });
    assert.match(tag.getAttribute('class')!, /\bstate-tag\b/);
    assert.deepEqual(tag.children.map((c) => c.tagName), ['SVG', 'SPAN']);
    assert.equal(texto(tag), 'Pergunta');
    assert.equal(tag.children[1]!.textContent, 'Pergunta');
    assert.equal(declared(stateCss, '.state-tag', 'color'), '--muted');
    assert.match(stateCss.match(/^\.state-tag \{([^}]*)\}/m)![1]!, /gap:\s*7px/);
    assert.doesNotMatch(stateCss.match(/^\.state-tag \{([^}]*)\}/m)![1]!, /background|border/);
  });

  test('the label is data: it goes in as text, never as markup', () => {
    const tag = stateTag({ kind: 'error', label: '<b>x</b>' });
    assert.equal(tag.children[1]!.textContent, '<b>x</b>');
    assert.equal(tag.children[1]!.children.length, 0);
  });

  test('without a label, the kind says its own, so the label is always written', () => {
    assert.deepEqual(
      STATE_KINDS.map((k: string) => texto(stateTag({ kind: k }))),
      ['Precisa de você', 'Pede permissão', 'Ativa', 'Na fila', 'Ociosa', 'Concluída', 'Com erro', 'Respondida'],
    );
  });

  test('the fraction reaches the slice', () => {
    const a = stateTag({ kind: 'working', label: 'Ativa', fraction: 1 }).querySelector('path.si-fill')!.getAttribute('d');
    assert.equal(a, 'M8 8V4.5A3.5 3.5 0 1 1 7.98 4.50Z');
  });
});

describe('#751: stateOfSession: the kind and the label of today for an attention and a status', () => {
  const blocked = (reason: string | null) => ({ level: 'blocked', reason });
  test('blocked: permission, error, and the others as needs with the reason of today', () => {
    assert.deepEqual(stateOfSession({ attention: blocked('permission'), status: 'waiting' }), { kind: 'permission', label: 'Pede permissão' });
    assert.deepEqual(stateOfSession({ attention: blocked('error'), status: 'error' }), { kind: 'error', label: 'Com erro' });
    assert.deepEqual(stateOfSession({ attention: blocked('question'), status: 'waiting' }), { kind: 'needs', label: 'Pergunta' });
    assert.deepEqual(stateOfSession({ attention: blocked('plan'), status: 'waiting' }), { kind: 'needs', label: 'Plano para aprovar' });
    assert.deepEqual(stateOfSession({ attention: blocked('decision'), status: 'waiting' }), { kind: 'needs', label: 'Decisão pedida' });
    assert.deepEqual(stateOfSession({ attention: blocked(null), status: 'waiting' }), { kind: 'needs', label: 'Precisa de você' });
    assert.deepEqual(stateOfSession({ attention: blocked('nope'), status: 'waiting' }), { kind: 'needs', label: 'Precisa de você' });
  });
  test('idle is paused and says Ociosa', () => {
    assert.deepEqual(stateOfSession({ attention: { level: 'idle', reason: 'turn_ended' }, status: 'waiting' }), { kind: 'paused', label: 'Ociosa' });
  });
  test('without attention: completed, error, abandoned and the rest as working', () => {
    assert.deepEqual(stateOfSession({ attention: null, status: 'completed' }), { kind: 'completed', label: 'Concluída' });
    assert.deepEqual(stateOfSession({ attention: null, status: 'error' }), { kind: 'error', label: 'Com erro' });
    assert.deepEqual(stateOfSession({ attention: null, status: 'abandoned' }), { kind: 'paused', label: 'Abandonada' });
    assert.deepEqual(stateOfSession({ attention: null, status: 'active' }), { kind: 'working', label: 'Ativa' });
    assert.deepEqual(stateOfSession({ attention: null, status: 'waiting' }), { kind: 'working', label: 'Ativa' });
    assert.deepEqual(stateOfSession({}), { kind: 'working', label: 'Ativa' });
  });
});

describe('#751: both modules are loaded once by the page', () => {
  test('index.html links state-icon.css and agent-monogram.css', () => {
    assert.match(index, /<link rel="stylesheet" href="\/ui\/state-icon\.css">/);
    assert.match(index, /<link rel="stylesheet" href="\/ui\/agent-monogram\.css">/);
  });
});

describe('#751: contrast on --surface, both themes, from tokens.json', () => {
  for (const theme of ['dark', 'light'] as const) {
    const surface = tokens.themes[theme].surface as string;
    for (const kind of STATE_KINDS as string[]) {
      test(`${theme}: the ${kind} icon is at least 3:1`, () => {
        const c = token(declared(stateCss, `.state-icon-${kind}`, 'color'), theme);
        assert.ok(ratio(c, surface) >= 3, `${kind} ${ratio(c, surface).toFixed(2)}`);
      });
    }
    test(`${theme}: the mark in the middle of a disc is at least 3:1 on the disc`, () => {
      const mark = token(declared(stateCss, '.state-icon .si-cut', 'stroke'), theme);
      for (const kind of ['completed', 'error']) {
        const disc = token(declared(stateCss, `.state-icon-${kind}`, 'color'), theme);
        assert.ok(ratio(mark, disc) >= 3, `${kind} ${ratio(mark, disc).toFixed(2)}`);
      }
    });
    test(`${theme}: the label (--muted) is at least 4.5:1`, () => {
      assert.ok(ratio(token(declared(stateCss, '.state-tag', 'color'), theme), surface) >= 4.5);
    });
    for (const color of ['violet', 'blue', 'teal', 'indigo']) {
      test(`${theme}: the ${color} monogram letter is at least 4.5:1 on its fill`, () => {
        const text = token(declared(monogramCss, `.agent-monogram-${color}`, 'color'), theme);
        const fill = token(declared(monogramCss, `.agent-monogram-${color}`, 'background'), theme);
        assert.ok(ratio(text, fill) >= 4.5, `${color} ${ratio(text, fill).toFixed(2)}`);
      });
    }
    test(`${theme}: the neutral monogram letter is at least 4.5:1 on its fill`, () => {
      const text = token(declared(monogramCss, '.agent-monogram', 'color'), theme);
      const fill = token(declared(monogramCss, '.agent-monogram', 'background'), theme);
      assert.ok(ratio(text, fill) >= 4.5, `${ratio(text, fill).toFixed(2)}`);
    });
    test(`${theme}: the primary button text is at least 4.5:1 on its fill`, () => {
      const text = token(declared(shell, '.btn.primary', 'color'), theme);
      const fill = token(declared(shell, '.btn.primary', 'background'), theme);
      assert.ok(ratio(text, fill) >= 4.5, `${ratio(text, fill).toFixed(2)}`);
    });
  }
});
