// #760: one map of state labels for the whole /ui (ui/state-labels.js), with two columns, Dev and Projeto.
//
// - the module: the mode, the two columns, the voice limits, the kinds of state-icon.js, the board columns;
// - "uma fonte só" (criterion 1): a guard that fails on a state label written by hand anywhere else in ui/;
// - "as duas colunas" (criterion 2): in the Project mode the same screens that say "Pede permissão" and
//   "Com erro" say "Pede sua aprovação" and "Parou com erro".
// The columns below are written out on purpose: they are the contract, not a copy of the module's table.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { ElementoFalso, documentoFalso, instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();

// ---------- The contract: the two columns, written out ----------

/** Dev: today's words, exactly (the singular, then the plural when the state has one). */
const DEV: Record<string, [string, string?]> = {
  blocked: ['Precisa de você', 'Precisam de você'],
  idle: ['Ociosa', 'Ociosas'],
  permission: ['Pede permissão'],
  question: ['Pergunta'],
  plan: ['Plano para aprovar'],
  decision: ['Decisão pedida'],
  error: ['Com erro'],
  turn_ended: ['Sua vez'],
  interrupted: ['Interrompida'],
  first_prompt: ['No prompt'],
  active: ['Ativa', 'Ativas'],
  completed: ['Concluída', 'Concluídas'],
  abandoned: ['Abandonada', 'Abandonadas'],
  queued: ['Na fila'],
  answered: ['Respondida'],
  failed: ['Erro'],
  parked: ['Paradas'],
  running: ['Rodando'],
  reviewing: ['Revisando'],
  active_item: ['Ativo'],
  completed_item: ['Concluído'],
  agent_waiting: ['Esperando'],
};
/** Projeto: the table of ux-review.md section 4; what is not here is equal to Dev. "Ativa" and "Ociosa" stay until #753. */
const PROJECT_DIFFERS: Record<string, [string, string?]> = {
  permission: ['Pede sua aprovação'],
  question: ['Esperando sua resposta'],
  turn_ended: ['Esperando sua resposta'],
  error: ['Parou com erro'],
  failed: ['Parou com erro'],
  abandoned: ['Encerrada sem terminar', 'Encerradas sem terminar'],
};
const PROJECT: Record<string, [string, string?]> = { ...DEV, ...PROJECT_DIFFERS };
/** The work board's columns, the same in both modes ("Em review" and "Bloqueado" are gone). */
const BOARD: Record<string, string> = { planning: 'Planejamento', queued: 'Na fila', running: 'Em execução', review: 'Em revisão', blocked: 'Precisa de você', done: 'Concluído' };
/** What the screens used to say and no longer may, plus the compound the module builds. */
const RETIRED = ['Em review', 'Bloqueado'];
const COMPOUND = 'Precisa de você ou ociosa';

const texts = (table: Record<string, [string, string?]>) => Object.values(table).flatMap(([one, many]) => [one, ...(many ? [many] : [])]);
const GUARDED = new Set([...texts(DEV), ...texts(PROJECT), ...Object.values(BOARD), ...RETIRED, COMPOUND]);

// ---------- The guard: a state label written by hand outside the module ----------

export interface Stray {
  file: string;
  line: number;
  text: string;
}

/** The last character before `at` that is not a space, or an empty string at the start: what tells a regular expression from a division. */
function previousSignificant(source: string, at: number): string {
  let k = at - 1;
  while (k >= 0 && (source[k] === ' ' || source[k] === '\t' || source[k] === '\n')) k--;
  return k >= 0 ? source[k]! : '';
}

/** The string literals of a source, comments left out, each with its line. A template with an expression is walked for the literals inside it and is not a literal itself. */
function literalsOf(source: string, firstLine = 1): { line: number; value: string }[] {
  const found: { line: number; value: string }[] = [];
  let line = firstLine;
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i]!;
    if (c === '\n') {
      line++;
      i++;
    } else if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++;
    } else if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line++;
        i++;
      }
      i += 2;
    } else if (c === '/' && /[(,=:[!&|?{};]|^$/.test(previousSignificant(source, i))) {
      // A regular expression literal (it may hold a quote or a backtick): skipped, never read as a string.
      let j = i + 1;
      let inClass = false;
      while (j < n && source[j] !== '\n' && (inClass || source[j] !== '/')) {
        if (source[j] === '\\') j++;
        else if (source[j] === '[') inClass = true;
        else if (source[j] === ']') inClass = false;
        j++;
      }
      i = j + 1;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < n && source[j] !== '\n') {
        if (source[j] === '\\') {
          value += source[j + 1] ?? '';
          j += 2;
        } else if (source[j] === c) {
          closed = true;
          break;
        } else value += source[j++];
      }
      if (closed) {
        found.push({ line, value });
        i = j + 1;
      } else i++;
    } else if (c === '`') {
      let j = i + 1;
      let value = '';
      let expressions = false;
      let at = line;
      while (j < n && source[j] !== '`') {
        if (source[j] === '\\') {
          value += source[j + 1] ?? '';
          j += 2;
        } else if (source[j] === '$' && source[j + 1] === '{') {
          expressions = true;
          let depth = 1;
          let k = j + 2;
          while (k < n && depth > 0) {
            if (source[k] === '{') depth++;
            else if (source[k] === '}') depth--;
            k++;
          }
          found.push(...literalsOf(source.slice(j + 2, k - 1), at));
          at += source.slice(j, k).split('\n').length - 1;
          j = k;
        } else {
          if (source[j] === '\n') at++;
          value += source[j++];
        }
      }
      if (!expressions) found.push({ line, value });
      line = at;
      i = j + 1;
    } else i++;
  }
  return found;
}

/** Every string literal of `source` that is exactly a state label (comments are not read). */
export function findStrayLabels(source: string, file: string, labels: ReadonlySet<string> = GUARDED): Stray[] {
  return literalsOf(source)
    .filter((l) => labels.has(l.value))
    .map((l) => ({ file, line: l.line, text: l.value }));
}

/**
 * The words that are not session states and stay where they are, each with why. They are the machine, container, terminal,
 * tool and plan-step states, and a decision's type; `Rodando` and the like are state labels of workflows and agents only.
 * A guard that lists its exceptions also fails when one of them no longer exists.
 */
const NOT_SESSION_STATES: { file: string; text: string; why: string }[] = [
  { file: 'screens/docker-actions.js', text: 'Rodando', why: 'a container is running, not a session' },
  { file: 'screens/docker-format.js', text: 'Rodando', why: 'a container filter' },
  { file: 'screens/machine-terminals-format.js', text: 'Rodando', why: 'a terminal process' },
  { file: 'screens/session-detail.js', text: 'Rodando', why: 'a tool call in the conversation' },
  { file: 'screens/session-detail.js', text: 'Erro', why: 'a tool call in the conversation' },
  { file: 'screens/agent-view.js', text: 'Rodando', why: 'a step of the agent view is a tool call' },
  { file: 'screens/agent-view.js', text: 'Erro', why: 'a step of the agent view is a tool call' },
  { file: 'screens/machine-connection-format.js', text: 'Esperando', why: 'the tunnel waits for the login, not a session' },
  { file: 'screens/decisions-common.js', text: 'Pergunta', why: 'the type of a decision, not the reason a session waits' },
];

function uiFiles(dir = UI_FOLDER): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'vendor' ? [] : uiFiles(path);
    return e.name.endsWith('.js') ? [path] : [];
  });
}

/** The stray labels of the real tree: every ui/**\/*.js but vendor and the module itself, minus the listed non-session states. */
export function strayLabelsInUi(): { strays: Stray[]; used: Set<string> } {
  const strays: Stray[] = [];
  const used = new Set<string>();
  for (const path of uiFiles()) {
    const file = relative(UI_FOLDER, path);
    if (file === 'state-labels.js') continue;
    for (const s of findStrayLabels(readFileSync(path, 'utf8'), file)) {
      const exempt = NOT_SESSION_STATES.find((x) => x.file === s.file && x.text === s.text);
      if (exempt) used.add(`${exempt.file}|${exempt.text}`);
      else strays.push(s);
    }
  }
  return { strays, used };
}

describe('#760 uma fonte só: the guard finds a state label written by hand', () => {
  const map = ['const STATUS = {', "  active: 'Ativa',", '  error: "Com erro",', '  abandoned: `Abandonada`,', '};'].join('\n');

  test('a regular expression with a backtick does not hide the labels after it', () => {
    const source = ["const parts = text.split(/`([^`\\n]+)`/);", "const STATUS = { active: 'Ativa' };"].join('\n');
    assert.deepEqual(findStrayLabels(source, 'screens/x.js'), [{ file: 'screens/x.js', line: 2, text: 'Ativa' }]);
  });

  test('a hand-written map is red, with the file and the line of each label', () => {
    assert.deepEqual(findStrayLabels(map, 'screens/x.js'), [
      { file: 'screens/x.js', line: 2, text: 'Ativa' },
      { file: 'screens/x.js', line: 3, text: 'Com erro' },
      { file: 'screens/x.js', line: 4, text: 'Abandonada' },
    ]);
  });

  test('the same screen reading the module is green', () => {
    const clean = ["import { stateLabel } from '../state-labels.js';", "const badge = (id) => el('span', { class: `badge b-${id}` }, stateLabel(id));"].join('\n');
    assert.deepEqual(findStrayLabels(clean, 'screens/x.js'), []);
  });

  test('a label in a comment, in a longer sentence or in a template with an expression is not a map', () => {
    const prose = ["// 'Ativa' and \"Com erro\" in a comment", '/* `Ociosa`', " 'Concluída' */", "const a = 'Ativa, mais velha que o período';", 'const b = `Ativa ${x}`;', "const c = 'ativa';"].join('\n');
    assert.deepEqual(findStrayLabels(prose, 'screens/x.js'), []);
  });

  test('a label inside the expression of a template is read, and the line count survives the comment before it', () => {
    const source = ['/* one', 'two */', 'const t = `${ok ? \'Ociosa\' : null}`;'].join('\n');
    assert.deepEqual(findStrayLabels(source, 'screens/x.js'), [{ file: 'screens/x.js', line: 3, text: 'Ociosa' }]);
  });

  test('the old board words are refused too, and the compound the module builds', () => {
    assert.deepEqual(
      findStrayLabels("const c = ['Em review', 'Bloqueado', 'Precisa de você ou ociosa'];", 'screens/x.js').map((s) => s.text),
      ['Em review', 'Bloqueado', 'Precisa de você ou ociosa'],
    );
  });
});

describe('#760 uma fonte só: the real ui/', () => {
  test('no state label is written by hand outside ui/state-labels.js', () => {
    const { strays } = strayLabelsInUi();
    assert.deepEqual(
      strays.map((s) => `${s.file}:${s.line} "${s.text}"`),
      [],
      'a state label belongs in ui/state-labels.js; read it with stateLabel(id) while drawing',
    );
  });

  test('every listed non-session state still exists (a stale exception fails)', () => {
    const { used } = strayLabelsInUi();
    assert.deepEqual(
      NOT_SESSION_STATES.filter((x) => !used.has(`${x.file}|${x.text}`)).map((x) => `${x.file} "${x.text}"`),
      [],
    );
  });

  test('the module is the only file that defines them: it is served and has the three exits of the issue', () => {
    const source = readFileSync(join(UI_FOLDER, 'state-labels.js'), 'utf8');
    assert.match(source, /export function stateLabel\(/);
    assert.match(source, /export function setStateLabelMode\(/);
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/, 'no persistence: #754 decides where the choice lives');
  });
});

// ---------- The module ----------

// @ts-expect-error: browser module, plain JavaScript
const labels = () => import('../../ui/state-labels.js');
// @ts-expect-error: browser module, plain JavaScript
const icons = () => import('../../ui/state-icon.js');

afterEach(async () => {
  const m = await labels().catch(() => null);
  m?.setStateLabelMode('dev');
});

async function inProject<T>(run: () => Promise<T> | T): Promise<T> {
  const m = await labels();
  assert.equal(m.setStateLabelMode('project'), true);
  try {
    return await run();
  } finally {
    m.setStateLabelMode('dev');
  }
}

type Entry = { id: string; kind: string; dev: { label: string; plural: string | null }; project: { label: string; plural: string | null } };

describe('#760 the module: the mode and the two columns', () => {
  test('the mode is dev at first; project and back; a bad value is ignored and never throws', async () => {
    const m = await labels();
    assert.deepEqual([...m.STATE_MODES], ['dev', 'project']);
    assert.equal(m.stateLabelMode(), 'dev');
    assert.equal(m.setStateLabelMode('project'), true);
    assert.equal(m.stateLabelMode(), 'project');
    for (const bad of ['Project', 'projeto', '', null, undefined, 3, {}, ['dev']]) {
      assert.equal(m.setStateLabelMode(bad), false, String(bad));
      assert.equal(m.stateLabelMode(), 'project', 'the mode stays');
    }
    assert.equal(m.setStateLabelMode('dev'), true);
    assert.equal(m.stateLabelMode(), 'dev');
  });

  test('the label is read at the call: the same id says two things after a change of mode, with no redraw of the module', async () => {
    const m = await labels();
    assert.equal(m.stateLabel('permission'), 'Pede permissão');
    m.setStateLabelMode('project');
    assert.equal(m.stateLabel('permission'), 'Pede sua aprovação');
    m.setStateLabelMode('dev');
    assert.equal(m.stateLabel('permission'), 'Pede permissão');
    assert.equal(m.stateLabel('no-such-state'), null, 'an unknown id is null, never the raw id');
  });

  test('Dev is today\'s words exactly, singular and plural', async () => {
    const m = await labels();
    for (const [id, [one, many]] of Object.entries(DEV)) {
      assert.equal(m.stateLabel(id), one, id);
      assert.equal(m.stateLabel(id, { plural: true }), many ?? one, `${id} plural`);
    }
  });

  test('Projeto is the table of the review; "Ativa" and "Ociosa" are not renamed here (#753)', async () => {
    const m = await labels();
    m.setStateLabelMode('project');
    for (const [id, [one, many]] of Object.entries(PROJECT)) {
      assert.equal(m.stateLabel(id), one, id);
      assert.equal(m.stateLabel(id, { plural: true }), many ?? one, `${id} plural`);
    }
    assert.equal(m.stateLabel('active'), 'Ativa');
    assert.equal(m.stateLabel('idle'), 'Ociosa');
    assert.equal(m.stateLabel('blocked'), 'Precisa de você');
  });

  test('Dev and Projeto have the same ids, and every id has both columns', async () => {
    const m = await labels();
    const entries: Entry[] = m.stateEntries();
    assert.deepEqual(entries.map((e) => e.id).sort(), Object.keys(DEV).sort());
    for (const e of entries) {
      assert.equal(typeof e.dev.label, 'string', e.id);
      assert.equal(typeof e.project.label, 'string', e.id);
      assert.equal(e.dev.plural === null, e.project.plural === null, `${e.id}: the plural is in both columns or in neither`);
    }
  });

  test('every Projeto label obeys the voice: at most 4 words and 28 characters, no "!", no em dash', async () => {
    const m = await labels();
    for (const e of m.stateEntries() as Entry[]) {
      for (const text of [e.project.label, e.project.plural, e.dev.label, e.dev.plural]) {
        if (text === null) continue;
        assert.ok(text.split(/\s+/).length <= 4, `${e.id} "${text}" has more than 4 words`);
        assert.ok(text.length <= 28, `${e.id} "${text}" has more than 28 characters`);
        assert.ok(!text.includes('!') && !text.includes('—'), `${e.id} "${text}"`);
      }
    }
    for (const label of Object.values(BOARD)) assert.ok(label.split(/\s+/).length <= 4 && label.length <= 28, label);
  });

  test('every entry carries the kind of state-icon.js, and each kind has a label', async () => {
    const m = await labels();
    const { STATE_KINDS } = await icons();
    for (const e of m.stateEntries() as Entry[]) {
      assert.ok(STATE_KINDS.includes(e.kind), `${e.id} has the kind "${e.kind}"`);
      assert.equal(m.stateKind(e.id), e.kind);
    }
    for (const kind of STATE_KINDS) assert.equal(typeof m.kindLabel(kind), 'string', kind);
    assert.equal(m.kindLabel('needs'), 'Precisa de você');
    assert.equal(m.kindLabel('paused'), 'Ociosa');
    assert.equal(m.kindLabel('working'), 'Ativa');
    assert.equal(m.kindLabel('permission'), 'Pede permissão');
    assert.equal(m.kindLabel('nope'), null);
  });

  test('the board columns: "Em revisão" and "Precisa de você" in both modes, the six ids in order', async () => {
    const m = await labels();
    assert.deepEqual(m.boardColumnIds(), Object.keys(BOARD));
    for (const mode of ['dev', 'project']) {
      m.setStateLabelMode(mode);
      for (const [id, label] of Object.entries(BOARD)) assert.equal(m.boardColumnLabel(id), label, `${mode} ${id}`);
    }
    assert.equal(m.boardColumnLabel('review'), 'Em revisão');
    assert.equal(m.boardColumnLabel('blocked'), 'Precisa de você');
    assert.equal(m.boardColumnLabel('nope'), null);
  });

  test('stateLabels() is a map that reads the mode when it is read, so an exported constant never goes stale', async () => {
    const m = await labels();
    const map = m.stateLabels({ failing: 'error', waiting: m.needsOrIdleLabel, old: 'abandoned' });
    assert.deepEqual({ ...map }, { failing: 'Com erro', waiting: COMPOUND, old: 'Abandonada' });
    m.setStateLabelMode('project');
    assert.deepEqual({ ...map }, { failing: 'Parou com erro', waiting: COMPOUND, old: 'Encerrada sem terminar' });
    assert.equal(Object.hasOwn(map, 'failing'), true);
    assert.equal(Object.hasOwn(map, 'nope'), false);
    assert.deepEqual(Object.keys(m.stateLabels(['active', 'completed'])), ['active', 'completed']);
  });

  test('the module imports nothing: state-icon.js and the screens import it, never the other way', () => {
    const source = readFileSync(join(UI_FOLDER, 'state-labels.js'), 'utf8');
    assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /^\s*import\b/m);
  });
});

// ---------- The two columns on the screens ----------

const page = { pathname: '/ui', search: '', hash: '' };
const setUrl = (url: string) => {
  const u = new URL(url, 'http://127.0.0.1');
  Object.assign(page, { pathname: u.pathname, search: u.search, hash: u.hash });
};
Object.assign(globalThis, {
  location: page,
  history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => setUrl(url), pushState: (_s: unknown, _t: string, url: string) => setUrl(url) },
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  getComputedStyle: () => ({ getPropertyValue: () => '', paddingBottom: '0' }),
});

// @ts-expect-error: browser modules, plain JavaScript
const wall = await import('../../ui/screens/wall.js');
// @ts-expect-error: idem
const sessions = await import('../../ui/screens/sessions.js');
// @ts-expect-error: idem
const detail = await import('../../ui/screens/session-detail.js');
// @ts-expect-error: idem
const dashboard = await import('../../ui/screens/dashboard.js');
// @ts-expect-error: idem
const kanban = await import('../../ui/screens/kanban.js');
// @ts-expect-error: idem
const history = await import('../../ui/screens/history.js');
// @ts-expect-error: idem
const attention = await import('../../ui/attention.js');

const until = async (cond: () => boolean, what = 'the condition', ms = 2000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};

/** A ctx with a stubbed core: `answer(route)` gives the JSON. */
function context(answer: (route: string) => unknown, params: Record<string, string> = {}) {
  const leave = new AbortController();
  return {
    leave,
    ctx: {
      params,
      signal: leave.signal,
      read: async (route: string) => {
        const a = answer(route);
        if (a instanceof Error) throw a;
        return structuredClone(a);
      },
      write: async () => ({}),
      onChange: () => {},
      onRestart: () => {},
      liveState: () => 'live',
      counter: () => {},
      title: () => {},
      navigate: () => {},
    },
  };
}

const DEV_WORDS = ['Pede permissão', 'Com erro'];
const PROJECT_WORDS = ['Pede sua aprovação', 'Parou com erro'];

/** Draws a screen in Dev, then in Projeto, and says what the same words become. */
async function inBothModes(draw: () => Promise<string>) {
  const m = await labels();
  m.setStateLabelMode('dev');
  const dev = await draw();
  m.setStateLabelMode('project');
  try {
    return { dev, project: await draw() };
  } finally {
    m.setStateLabelMode('dev');
  }
}

function assertBothColumns(screen: { dev: string; project: string }, { permission = true, error = true } = {}) {
  const [devPermission, devError] = DEV_WORDS as [string, string];
  const [projectPermission, projectError] = PROJECT_WORDS as [string, string];
  if (permission) {
    assert.ok(screen.dev.includes(devPermission), `Dev says "${devPermission}"`);
    assert.ok(!screen.dev.includes(projectPermission));
    assert.ok(screen.project.includes(projectPermission), `Projeto says "${projectPermission}"`);
    assert.ok(!screen.project.includes(devPermission), `Projeto no longer says "${devPermission}"`);
  }
  if (error) {
    assert.ok(screen.dev.includes(devError), `Dev says "${devError}"`);
    assert.ok(!screen.dev.includes(projectError));
    assert.ok(screen.project.includes(projectError), `Projeto says "${projectError}"`);
    assert.ok(!screen.project.includes(devError), `Projeto no longer says "${devError}"`);
  }
}

describe('#760 as duas colunas: "Pede permissão" and "Com erro" in the same screens', () => {
  test('the state tag and the state of a session (state-icon.js)', async () => {
    const { stateOfSession, stateTag } = await icons();
    const draw = async () => {
      const permission = stateOfSession({ attention: { level: 'blocked', reason: 'permission' } });
      const error = stateOfSession({ attention: { level: 'blocked', reason: 'error' } });
      const byStatus = stateOfSession({ status: 'error' });
      const kindOnly = stateTag({ kind: 'permission' });
      return [permission.label, error.label, byStatus.label, texto(kindOnly), texto(stateTag({ kind: 'error' }))].join(' | ');
    };
    const both = await inBothModes(draw);
    assertBothColumns(both);
    assert.equal(both.dev, 'Pede permissão | Com erro | Com erro | Pede permissão | Com erro');
    assert.equal(both.project, 'Pede sua aprovação | Parou com erro | Parou com erro | Pede sua aprovação | Parou com erro');
  });

  test('the attention vocabulary (attention.js): the exported maps read the mode when they are read', async () => {
    const draw = async () =>
      [
        attention.reasonLabel({ level: 'blocked', reason: 'permission' }),
        attention.attentionText({ level: 'blocked', reason: 'error' }),
        texto(attention.reasonChip({ level: 'blocked', reason: 'permission' })),
        texto(attention.attentionPill({ level: 'blocked', reason: 'error' })),
        attention.ATTENTION_REASONS.permission.label,
        attention.ATTENTION_REASONS.error.label,
        attention.ATTENTION_REASONS.turn_ended.label,
      ].join(' | ');
    const both = await inBothModes(draw);
    assertBothColumns(both);
    assert.equal(both.dev, 'Pede permissão | Com erro | Pede permissão | Com erro | Pede permissão | Com erro | Sua vez');
    assert.equal(both.project, 'Pede sua aprovação | Parou com erro | Pede sua aprovação | Parou com erro | Pede sua aprovação | Parou com erro | Esperando sua resposta');
    assert.equal(attention.ATTENTION_LABEL.blocked, 'Precisa de você');
    assert.equal(attention.ATTENTION_PLURAL.idle, 'Ociosas');
  });

  test('Mural: the cards and the rows', async () => {
    setUrl('/ui/wall');
    const card = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      title: `Sessão ${id}`,
      project: 'projeto-exemplo',
      branch: 'feat/1-exemplo',
      status: 'waiting',
      state: 'waiting',
      since: '2026-10-22T22:00:00Z',
      activity: { type: 'tool', text: 'Rodar a bateria' },
      model: 'claude-opus-5-5',
      agents: { active: 1, total: 1 },
      cost: { usd: 1, estimate: true },
      plan: { done: 1, total: 2, current: null },
      context: { pct: 10 },
      open: { target: 'desktop', command: null },
      ...extra,
    });
    const body = {
      count: {},
      machines: [{ id: 'local', label: 'Esta máquina', state: 'connected', reason: null, lastReadAt: '2026-10-22T23:00:00Z' }],
      cards: [
        card('perm', { attention: { level: 'blocked', reason: 'permission' }, activity: { type: 'permission', text: 'Bash: npm run migrate' } }),
        card('erro', { status: 'error', state: 'error', attention: { level: 'blocked', reason: 'error' }, activity: { type: 'error', text: 'API 529' } }),
        card('vez', { attention: { level: 'idle', reason: 'turn_ended' }, activity: { type: 'your-turn', text: '' } }),
      ],
    };
    const both = await inBothModes(async () => {
      const f = context(() => body);
      const area = new ElementoFalso('main');
      await wall.mount(area, f.ctx);
      try {
        return texto(area);
      } finally {
        f.leave.abort();
      }
    });
    assertBothColumns(both);
    assert.ok(both.dev.includes('Sua vez'));
    assert.ok(both.project.includes('Esperando sua resposta') && !both.project.includes('Sua vez'));
  });

  test('Sessões: the status badge and the reason chip of a row, and the filter pills', async () => {
    setUrl('/ui/sessions');
    const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Sessão ${id}`, status: 'active', attention: null, lastActivity: '2026-10-22T22:00:00Z', running: false, durationMs: 60_000, agents: 1, costUsd: 1, cwd: '/simulacao/x', account: null, open: { target: 'none', command: null }, machine: { id: 'local', label: 'Esta máquina' }, ...extra });
    const items = [row('p', { status: 'waiting', attention: { level: 'blocked', reason: 'permission' } }), row('e', { status: 'error' }), row('a', { status: 'abandoned' })];
    const list = { total: 3, registered: 3, page: 1, perPage: 10, pages: 1, directories: [], counts: { all: 3 }, items, machines: [{ id: 'local', label: 'Esta máquina', state: 'connected', reason: null, lastReadAt: '2026-10-22T23:00:00Z' }] };
    const both = await inBothModes(async () => {
      if (!documentoFalso.querySelector('link[data-screen="sessions"]')) {
        const sheet = new ElementoFalso('link');
        sheet.setAttribute('data-screen', 'sessions');
        Object.assign(sheet, { loaded: Promise.resolve() });
        documentoFalso.head.append(sheet);
      }
      const f = context((route) => (route.endsWith('/messaging') ? { available: false, reason: 'no_live_process' } : list));
      const area = new ElementoFalso('main');
      const stop = await sessions.mount(area, f.ctx);
      try {
        return texto(area);
      } finally {
        stop?.();
        f.leave.abort();
      }
    });
    assertBothColumns(both);
    assert.ok(both.dev.includes('Abandonada') && !both.dev.includes('Encerrada sem terminar'));
    assert.ok(both.project.includes('Encerrada sem terminar') && !both.project.includes('Abandonada'), 'the badge says the Projeto word');
    assert.ok(both.project.includes('Encerradas sem terminar'), 'the filter pill says the Projeto plural');
  });

  test('Detalhe: the pill of the header and the band title', async () => {
    const head = (extra: Record<string, unknown>) => ({
      session: { id: 's1', title: 'Migração do esquema', status: 'error', attention: null, startedAt: '2026-10-22T22:41:00Z', since: '2026-10-22T22:41:00Z', model: 'claude-opus-5-5', cwd: '/simulacao/motor-de-regras', banner: null, ...extra },
      counts: { agents: 1, events: 10 },
      cost: { usd: 2.1 },
      branch: 'feat/58-pedidos',
      open: { target: 'desktop', command: null },
      local: null,
      opensSession: false,
    });
    const conversation = { agent: 'main', agents: [{ id: 'main', name: 'Agente principal' }], total: 0, messages: [] };
    const both = await inBothModes(async () => {
      setUrl('/ui/sessions/s1');
      const f = context((route) => (route.split('?')[0] === '/api/sessions/s1' ? head({}) : route.includes('/conversation') ? conversation : new Error(`unexpected ${route}`)), { id: 's1' });
      const area = new ElementoFalso('main');
      const stop = await detail.mount(area, f.ctx);
      try {
        await until(() => area.querySelectorAll('.sd-pills').length > 0, 'the pills');
        const band = [detail.bandTitle({ attention: { level: 'blocked', reason: 'permission' }, banner: null }), detail.bandTitle({ attention: { level: 'blocked', reason: 'error' }, banner: null })].join(' | ');
        return `${texto(area.querySelector('.sd-pills'))} | ${band}`;
      } finally {
        stop?.();
        f.leave.abort();
      }
    });
    assertBothColumns(both);
    assert.match(both.dev, /Precisa de você · Pede permissão\./);
    assert.match(both.project, /Precisa de você · Pede sua aprovação\./);
  });

  test('Dashboard: the status pill, the inbox chip and the exported STATUS_LABEL', async () => {
    setUrl('/ui');
    const numbers = { sessions: { total: 2, active: 0, blocked: 1, idle: 1 }, agents: { active: 0, sessions: 0 }, subagents: { active: 0, sessions: 0 }, events: { today: 0, lastHour: 0, total: 0 }, cost: { usd: 0, days: 30, unpriced: [] } };
    const items = [
      { session: 's1', title: 'Migração', project: 'motor-de-regras', attention: { level: 'blocked', reason: 'permission' }, reason: 'permission', longReason: 'pede permissão', minutes: 2, machine: null, open: { target: 'none', command: null } },
      { session: 's2', title: 'Outra', project: 'painel', attention: { level: 'idle', reason: 'turn_ended' }, reason: 'turn_ended', longReason: 'x', minutes: 3, machine: null, open: { target: 'none', command: null } },
    ];
    const both = await inBothModes(async () => {
      const f = context((route) => (route.startsWith('/api/dashboard') ? { numbers, agents: [], activity: [], machines: [], byMachine: [] } : { total: 1, blocked: 1, idle: 1, items }));
      const area = new ElementoFalso('main');
      const stop = await dashboard.mount(area, f.ctx);
      try {
        await until(() => area.querySelectorAll('.mini').length > 0, 'the inbox');
        const pills = [texto(dashboard.statusPill('error', null)), texto(dashboard.statusPill('abandoned', null)), dashboard.STATUS_LABEL.error, dashboard.STATUS_LABEL.abandoned];
        const idle = area.querySelector('.dash-idle')?.getAttribute('aria-label') ?? '';
        return [texto(area), ...pills, idle].join(' | ');
      } finally {
        stop?.();
        f.leave.abort();
      }
    });
    assertBothColumns(both);
    assert.ok(both.dev.includes('Sua vez'));
    assert.ok(both.project.includes('Esperando sua resposta'));
  });

  test('Kanban: the badge of a card and the reason chip', async () => {
    setUrl('/ui/kanban');
    const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Sessão ${id}`, status: 'active', attention: null, lastActivity: '2026-10-22T22:00:00Z', running: true, durationMs: 60_000, agents: 1, costUsd: 1, cwd: '/simulacao/x', machine: { id: 'local', label: 'Esta máquina' }, ...extra });
    const board = {
      view: 'sessions',
      machines: [{ id: 'local', label: 'Esta máquina', state: 'connected', reason: null, lastReadAt: '2026-10-22T23:00:00Z' }],
      columns: [
        { id: 'blocked', label: 'Precisam de você', total: 2, page: 1, hasMore: false, items: [card('p', { status: 'waiting', attention: { level: 'blocked', reason: 'permission' } }), card('e', { status: 'error' })] },
        { id: 'abandoned', label: 'Abandonadas', total: 1, page: 1, hasMore: false, items: [card('a', { status: 'abandoned' })] },
      ],
    };
    const both = await inBothModes(async () => {
      const f = context(() => board);
      const area = new ElementoFalso('main');
      await kanban.mount(area, f.ctx);
      try {
        return texto(area);
      } finally {
        f.leave.abort();
      }
    });
    assertBothColumns(both);
    assert.ok(both.dev.includes('Abandonadas') && both.dev.includes('Abandonada'));
    assert.ok(both.project.includes('Encerradas sem terminar'), 'the column name comes from the module, not from the core\'s payload');
    assert.ok(!both.project.includes('Abandonadas'));
  });

  test('Histórico: the badge of a closed session', async () => {
    setUrl('/ui/history');
    const s = (id: string, status: string) => ({ id, title: `Sessão ${id}`, status, project: 'p', model: 'Opus 5.5', durationMs: 1000, costUsd: 1 });
    const body = { days: [{ day: '2026-10-22', sessions: [s('e', 'error'), s('a', 'abandoned')] }], next: null, machines: [{ id: 'local', label: 'Esta máquina', state: 'connected', reason: null, lastReadAt: '2026-10-22T23:00:00Z' }] };
    const both = await inBothModes(async () => {
      const f = context(() => body);
      const area = new ElementoFalso('main');
      history.mount(area, f.ctx);
      try {
        await until(() => area.querySelectorAll('.hist-row').length === 2, 'the rows');
        return texto(area);
      } finally {
        f.leave.abort();
      }
    });
    assertBothColumns(both, { permission: false });
    assert.ok(both.dev.includes('Abandonada') && both.project.includes('Encerrada sem terminar'));
  });
});
