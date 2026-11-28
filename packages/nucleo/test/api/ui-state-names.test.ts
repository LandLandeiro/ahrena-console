// #753 (decision 0028): the state names "Trabalhando" and "Em pausa" in place of "Ativa" and "Ociosa".
//
// - the map: `stateLabel('active')` is "Trabalhando", `stateLabel('idle')` is "Em pausa", the same in both modes, and in the
//   plural of pills and filters; the compound filter is "Precisa de você ou em pausa";
// - the guard: no text the /ui shows (string and template text of ui/**/*.js, the markup of ui/**/*.html; comments and the
//   README are not read) says "ativa(s)" or "ociosa(s)", except a short list of texts that are not a session state,
//   each with its reason. An exception that matches nothing fails, so the list cannot go stale.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';

// @ts-expect-error: browser module, plain JavaScript
const labels = () => import('../../ui/state-labels.js');

afterEach(async () => {
  (await labels()).setStateLabelMode('dev');
});

describe('#753 the map: Trabalhando and Em pausa', () => {
  test('active is "Trabalhando" and idle is "Em pausa", singular and plural, in Dev and in Projeto', async () => {
    const m = await labels();
    for (const mode of ['dev', 'project']) {
      m.setStateLabelMode(mode);
      assert.equal(m.stateLabel('active'), 'Trabalhando', mode);
      assert.equal(m.stateLabel('active', { plural: true }), 'Trabalhando', `${mode} plural`);
      assert.equal(m.stateLabel('idle'), 'Em pausa', mode);
      assert.equal(m.stateLabel('idle', { plural: true }), 'Em pausa', `${mode} plural`);
      assert.equal(m.kindLabel('working'), 'Trabalhando', mode);
      assert.equal(m.kindLabel('paused'), 'Em pausa', mode);
    }
  });

  test('the other session states do not change', async () => {
    const m = await labels();
    assert.equal(m.stateLabel('blocked'), 'Precisa de você');
    assert.equal(m.stateLabel('blocked', { plural: true }), 'Precisam de você');
    assert.equal(m.stateLabel('completed'), 'Concluída');
    assert.equal(m.stateLabel('error'), 'Com erro');
    assert.equal(m.stateLabel('abandoned'), 'Abandonada');
  });

  test('the compound filter follows: "Precisa de você ou em pausa"', async () => {
    const m = await labels();
    assert.equal(m.needsOrIdleLabel(), 'Precisa de você ou em pausa');
  });

  test('the new labels obey the voice: at most 4 words and 28 characters', async () => {
    const m = await labels();
    for (const text of [m.stateLabel('active'), m.stateLabel('idle')]) {
      assert.ok(text.split(/\s+/).length <= 4 && text.length <= 28, text);
    }
  });
});

// ---------- The guard ----------

/** A session state in the old words: "ativa", "ativas", "ociosa", "ociosas" (and the masculine, which no session state uses). */
const OLD_WORD = /(?<![\p{L}\p{N}_-])(?:ativ[ao]s?|ocios[ao]s?)(?![\p{L}\p{N}_-])/giu;

/**
 * The texts that say "ativo" or "ocioso" and are not a session state, each with why. The text is removed from its line
 * before the line is searched; one that matches nothing fails.
 */
const NOT_SESSION_STATES: { file: string; text: string; why: string }[] = [
  { file: 'state-labels.js', text: "['Ativo']", why: 'the label of an agent or a step of a workflow run (masculine, as "Rodando" and "Esperando"), not of a session' },
  { file: 'screens/dashboard.js', text: 'Agentes ativos', why: 'agents, not sessions: the card and the column title of the active agents' },
  { file: 'screens/dashboard.js', text: 'Subagentes ativos', why: 'subagents, not sessions: the card of the active subagents' },
  { file: 'screens/dashboard.js', text: 'Nenhum agente ativo', why: 'agents, not sessions: the empty column of the active agents' },
  { file: 'screens/dashboard.js', text: "'ativo' : 'ativos'", why: 'the active subagents of an agent row, not a session' },
  { file: 'screens/analytics.js', text: "'ativo', 'ativos'", why: 'the active agents of the Agentes figure, not a session' },
  { file: 'screens/machine-terminals-format.js', text: 'Ocioso', why: 'a terminal with no process running, not a session' },
  { file: 'screens/codex-config.js', text: 'não o ativa', why: 'the verb "ativar": inspecting a profile does not activate it' },
];

/** The source with its comments blanked (the lines stay): `//`, block comments and, in markup, `<!-- -->`; strings and regular expressions are walked, never read as comments. */
export function withoutComments(source: string, markup = false): string {
  if (markup) return source.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
  let out = '';
  let i = 0;
  const n = source.length;
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');
  const lastSignificant = () => out.trimEnd().slice(-1);
  while (i < n) {
    const c = source[i]!;
    if (c === '/' && source[i + 1] === '/') {
      let j = i;
      while (j < n && source[j] !== '\n') j++;
      out += blank(source.slice(i, j));
      i = j;
    } else if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const j = end === -1 ? n : end + 2;
      out += blank(source.slice(i, j));
      i = j;
    } else if (c === '/' && /^[(,=:[!&|?{};]?$/.test(lastSignificant())) {
      // A regular expression literal: blanked, it is not text on screen and its quotes and backticks are not strings.
      let j = i + 1;
      let inClass = false;
      while (j < n && source[j] !== '\n' && (inClass || source[j] !== '/')) {
        if (source[j] === '\\') j++;
        else if (source[j] === '[') inClass = true;
        else if (source[j] === ']') inClass = false;
        j++;
      }
      out += blank(source.slice(i, j + 1));
      i = j + 1;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && source[j] !== '\n' && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j + 1;
    } else if (c === '`') {
      // A template: its text is kept whole; an expression inside it can hold a comment, which is rare enough to read as text.
      let j = i + 1;
      while (j < n && source[j] !== '`') j += source[j] === '\\' ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export interface Hit {
  file: string;
  line: number;
  word: string;
}

/** Every old state word in the text of `source`, with its line; `exempt` is called with the text removed from a line before it is read. */
export function oldWordsIn(source: string, file: string, markup = false, exempt: (file: string, line: string) => string = (_f, line) => line): Hit[] {
  const hits: Hit[] = [];
  withoutComments(source, markup)
    .split('\n')
    .forEach((line, index) => {
      for (const m of exempt(file, line).matchAll(OLD_WORD)) hits.push({ file, line: index + 1, word: m[0] });
    });
  return hits;
}

function uiFiles(dir = UI_FOLDER): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'vendor' ? [] : uiFiles(path);
    return e.name.endsWith('.js') || e.name.endsWith('.html') ? [path] : [];
  });
}

function oldWordsInUi(): { hits: Hit[]; used: Set<string> } {
  const hits: Hit[] = [];
  const used = new Set<string>();
  const exempt = (file: string, line: string) => {
    let rest = line;
    for (const x of NOT_SESSION_STATES) {
      if (x.file === file && rest.includes(x.text)) {
        used.add(`${x.file}|${x.text}`);
        rest = rest.split(x.text).join(' ');
      }
    }
    return rest;
  };
  for (const path of uiFiles()) {
    const file = relative(UI_FOLDER, path);
    hits.push(...oldWordsIn(readFileSync(path, 'utf8'), file, path.endsWith('.html'), exempt));
  }
  return { hits, used };
}

describe('#753 the guard: no old state word in the text of the /ui', () => {
  test('it finds the words in a string and in a template, and not in a comment', () => {
    const source = ["const a = 'Ativa';", '// ativa in a comment', '/* ociosas', ' ociosa */', 'const b = `${n} ociosas`;', "const c = 'Trabalhando';"].join('\n');
    assert.deepEqual(
      oldWordsIn(source, 'x.js').map((h) => `${h.line}:${h.word}`),
      ['1:Ativa', '5:ociosas'],
    );
  });

  test('a longer word and a regular expression with a quote do not trip it', () => {
    const source = ["const a = 'ativar o perfil, atividade, inativa';", "const rx = /'(ativa)/;", "const b = 'Ativas';"].join('\n');
    assert.deepEqual(oldWordsIn(source, 'x.js').map((h) => `${h.line}:${h.word}`), ['3:Ativas']);
  });

  test('markup is read without its comments', () => {
    assert.deepEqual(oldWordsIn('<!-- Ociosa -->\n<b>Ociosa</b>', 'x.html', true).map((h) => h.line), [2]);
  });

  test('no screen says "Ativa", "Ativas", "Ociosa" or "Ociosas" for a session', () => {
    const { hits } = oldWordsInUi();
    assert.deepEqual(
      hits.map((h) => `${h.file}:${h.line} "${h.word}"`),
      [],
      'a session is "trabalhando" or "em pausa": read it from state-labels.js, or write the new word',
    );
  });

  test('every listed non-session text still exists (a stale exception fails)', () => {
    const { used } = oldWordsInUi();
    assert.deepEqual(
      NOT_SESSION_STATES.filter((x) => !used.has(`${x.file}|${x.text}`)).map((x) => `${x.file} "${x.text}"`),
      [],
    );
  });
});
