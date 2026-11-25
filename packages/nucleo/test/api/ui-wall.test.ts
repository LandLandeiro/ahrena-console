// A tela Mural ao vivo da /ui (#34, C2): a formatação, o que cada card mostra e a montagem da tela
// num DOM mínimo, com um Mural de exemplo (dados inventados) no lugar de `GET /api/wall`.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';

// ---------- Um DOM mínimo: só o que dom.js, states.js e a tela usam ----------

class No {
  filhos: No[] = [];
  parent: No | null = null;
  get childNodes() {
    return this.filhos;
  }
  get children() {
    return this.filhos.filter((f) => f instanceof Elemento);
  }
  // Como no navegador, `null` não é pulado: viraria o texto "null". Aqui quebra o teste.
  append(...nos: (No | string)[]) {
    for (const n of nos) {
      assert.ok(n !== null && n !== undefined, 'append/replaceChildren com null');
      const no = typeof n === 'string' ? new Texto(n) : n;
      no.remove();
      no.parent = this;
      this.filhos.push(no);
    }
  }
  replaceChildren(...nos: (No | string)[]) {
    for (const f of this.filhos) f.parent = null;
    this.filhos = [];
    this.append(...nos);
  }
  remove() {
    if (this.parent) this.parent.filhos = this.parent.filhos.filter((f) => f !== this);
    this.parent = null;
  }
  contains(outro: unknown): boolean {
    for (let n = outro as No | null; n; n = n.parent) if (n === this) return true;
    return false;
  }
  get textContent(): string {
    return this.filhos.map((f) => f.textContent).join('');
  }
  // As in the browser: assigning the text replaces the children by one text node, and an empty text by none (#752).
  set textContent(v: string) {
    this.replaceChildren(...(String(v) === '' ? [] : [String(v)]));
  }
  /** Todos os elementos abaixo deste que passam no teste. */
  todos(teste: (e: Elemento) => boolean): Elemento[] {
    const out: Elemento[] = [];
    for (const f of this.filhos) {
      if (f instanceof Elemento && teste(f)) out.push(f);
      out.push(...f.todos(teste));
    }
    return out;
  }
}
class Texto extends No {
  readonly dado: string;
  constructor(dado: string) {
    super();
    this.dado = dado;
  }
  override get textContent() {
    return this.dado;
  }
}
class Elemento extends No {
  atributos = new Map<string, string>();
  ouvintes = new Map<string, ((e: unknown) => void)[]>();
  html = '';
  readonly style = { setProperty: (_k: string, _v: string) => {}, removeProperty: (_k: string) => {} };
  readonly tag: string;
  constructor(tag: string) {
    super();
    this.tag = tag;
  }
  setAttribute(k: string, v: string) {
    this.atributos.set(k, String(v));
  }
  getAttribute(k: string) {
    return this.atributos.get(k) ?? null;
  }
  removeAttribute(k: string) {
    this.atributos.delete(k);
  }
  addEventListener(tipo: string, f: (e: unknown) => void) {
    this.ouvintes.set(tipo, [...(this.ouvintes.get(tipo) ?? []), f]);
  }
  click() {
    for (const f of this.ouvintes.get('click') ?? []) f({});
  }
  focus() {
    (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement = this;
  }
  /** Só o `[data-session]` que a tela usa: o próprio elemento, se tem o atributo. */
  closest(sel: string) {
    return sel === '[data-session]' && this.atributos.has('data-session') ? this : null;
  }
  set innerHTML(v: string) {
    this.html = v;
  }
  // The machine menu (#752) reads and writes `hidden`, like the browser reflects the attribute.
  get hidden() {
    return this.atributos.has('hidden');
  }
  set hidden(v: boolean) {
    if (v) this.atributos.set('hidden', '');
    else this.atributos.delete('hidden');
  }
  get lastChild() {
    return this.filhos.at(-1) ?? null;
  }
  insertBefore(no: No, ref: No | null) {
    no.remove();
    no.parent = this;
    this.filhos.splice(ref ? this.filhos.indexOf(ref) : this.filhos.length, 0, no);
  }
  get classes() {
    return (this.getAttribute('class') ?? '').split(/\s+/);
  }
}
const head = new Elemento('head');
Object.assign(globalThis, {
  Node: No,
  document: {
    head,
    activeElement: null as unknown,
    createElement: (t: string) => new Elemento(t),
    createElementNS: (_ns: string, t: string) => new Elemento(t),
    createTextNode: (t: string) => new Texto(t),
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: (sel: string) => head.todos((e) => sel === `link[href="${e.getAttribute('href')}"]`)[0] ?? null,
  },
});

// @ts-expect-error: módulo do navegador, em JavaScript puro
const tela = await import('../../ui/screens/wall.js');
// @ts-expect-error: idem
const { findScreen } = await import('../../ui/screens.js');
const { mount, cardContent, rowContent } = tela;

const comClasse = (raiz: No, c: string) => raiz.todos((e) => e.classes.includes(c));
// #751: a blocked session is a card, the others are rows of one list; both carry data-session.
const sessionsOf = (raiz: No) => raiz.todos((e) => e.classes.includes('wall-card') || e.classes.includes('wall-row'));
const cardsOf = (raiz: No) => comClasse(raiz, 'wall-card');
const rowsOf = (raiz: No) => comClasse(raiz, 'wall-row');
const css = (arquivo: string) => readFileSync(`${UI_FOLDER}${arquivo}`, 'utf8');
const ate = async (cond: () => boolean, ms = 3000) => {
  const fim = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fim) throw new Error('não aconteceu a tempo');
    await new Promise((r) => setTimeout(r, 10));
  }
};

// ---------- Um Mural de exemplo, inventado ----------

type Card = Record<string, unknown>;
function cardDeExemplo(id: string, extra: Card = {}): Card {
  return {
    id,
    title: `Sessão ${id}`,
    project: 'projeto-exemplo',
    branch: 'feat/1-exemplo',
    status: 'active',
    state: 'active',
    reason: null,
    urgent: false,
    since: '2026-10-20T12:00:00Z',
    activity: { type: 'tool', text: 'Rodar a bateria' },
    model: 'claude-opus-5-5',
    effort: 'high',
    agents: { active: 1, total: 2 },
    cost: { usd: 1.84, estimate: true },
    plan: { done: 3, total: 5, current: 'Escrever o teste' },
    context: { pct: 31, used: 62_000, limit: 200_000, label: '62 mil / 200 mil' },
    ...extra,
  };
}
const MURAL = {
  version: 1,
  generatedAt: '2026-10-20T12:00:00Z',
  count: { all: 5, waiting: 3, active: 1, blocked: 2, idle: 1 },
  cards: [
    cardDeExemplo('ativa-1'),
    cardDeExemplo('espera-1', { status: 'waiting', state: 'waiting', reason: 'notification', urgent: true, attention: { level: 'blocked', reason: 'permission' }, activity: { type: 'permission', text: 'Bash: npm run migrate' }, plan: null }),
    cardDeExemplo('espera-2', { status: 'waiting', state: 'waiting', reason: 'stop', attention: { level: 'idle', reason: 'turn_ended' }, activity: { type: 'your-turn', text: 'Rodo os testes?' }, context: null }),
    cardDeExemplo('erro-1', { status: 'error', state: 'error', urgent: true, attention: { level: 'blocked', reason: 'error' }, activity: { type: 'error', text: 'API 529 · overloaded_error' }, context: { pct: 96, used: 192_000, limit: 200_000, label: '' } }),
    cardDeExemplo('feita-1', { title: '<b>negrito</b>', status: 'completed', state: 'completed', activity: { type: 'completed', text: '' }, cost: { usd: null, estimate: true }, model: null }),
  ],
};

async function montarTela(read: (rota: string) => Promise<unknown>) {
  const area = new Elemento('main');
  const sair = new AbortController();
  const ouvintes = { mudar: [] as ((m: unknown[]) => void)[], reiniciar: [] as (() => void)[] };
  const rotas: string[] = [];
  const ctx = {
    params: {},
    signal: sair.signal,
    read: (rota: string) => (rotas.push(rota), read(rota)),
    onChange: (f: (m: unknown[]) => void) => ouvintes.mudar.push(f),
    onRestart: (f: () => void) => ouvintes.reiniciar.push(f),
    counter: () => {},
    titulo: () => {},
    navigate: () => {},
    liveState: () => 'live',
  };
  const pronta = mount(area, ctx);
  return { area, rotas, ouvintes, pronta, sair: async () => (sair.abort(), (await pronta)()) };
}

// ---------- #751: what each session shows ----------

describe('#751: Mural: the content of a card and of a row, without DOM', () => {
  const blocked = (extra: Card = {}) => cardDeExemplo('c', { status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'question' }, ...extra });
  test('the step is done + 1 with a current step, done without one, never above the total; no plan, no step', () => {
    const step = (plan: unknown) => cardContent(blocked({ plan })).plan?.label ?? null;
    assert.equal(step({ done: 3, total: 5, current: 'Escrever o teste' }), 'Passo 4 de 5');
    assert.equal(step({ done: 3, total: 5, current: null }), 'Passo 3 de 5');
    assert.equal(step({ done: 5, total: 5, current: 'Ainda marcado' }), 'Passo 5 de 5');
    assert.equal(step({ done: 9, total: 5, current: null }), 'Passo 5 de 5');
    assert.equal(step({ done: 0, total: 0, current: null }), null);
    assert.equal(step(null), null);
  });
  test('the ask is the core text; without text it is the label of the reason, never empty', () => {
    assert.equal(cardContent(blocked({ activity: { type: 'question', text: 'Confere a v0.0.36?' } })).ask, 'Confere a v0.0.36?');
    assert.equal(cardContent(blocked({ activity: { type: 'question', text: '   ' } })).ask, 'Pergunta');
    assert.equal(cardContent(blocked({ activity: undefined })).ask, 'Pergunta');
  });
  test('the action says "Responder no Claude", and "Abrir para retomar" for an error', () => {
    assert.equal(cardContent(blocked()).actionLabel, 'Responder no Claude');
    assert.equal(cardContent(blocked({ attention: { level: 'blocked', reason: 'error' }, status: 'error' })).actionLabel, 'Abrir para retomar');
  });
  test('the usage shows in an error with a reading, and in any session past 90%', () => {
    const usage = (extra: Card) => cardContent(blocked(extra)).usage;
    assert.deepEqual(usage({ attention: { level: 'blocked', reason: 'error' }, status: 'error', context: { pct: 40 } }), { pct: 40, label: 'Uso da conversa 40%' });
    assert.equal(usage({ attention: { level: 'blocked', reason: 'error' }, status: 'error', context: null }), null);
    assert.equal(usage({ context: { pct: 90 } }), null);
    assert.deepEqual(usage({ context: { pct: 91 } }), { pct: 91, label: 'Uso da conversa 91%' });
    assert.equal(usage({ context: { pct: 140 } })?.pct, 100);
  });
  test('a context without a finite pct shows no usage: never "NaN%" or an invented 0% (#751)', () => {
    const failed = { attention: { level: 'blocked', reason: 'error' }, status: 'error' };
    for (const context of [{}, { pct: null }, { pct: undefined }, { pct: NaN }, { pct: Infinity }, { pct: 'x' }, { used: 1, limit: 2 }]) {
      assert.equal(cardContent(blocked({ ...failed, context })).usage, null, JSON.stringify(context));
    }
    assert.deepEqual(cardContent(blocked({ ...failed, context: { pct: 0 } })).usage, { pct: 0, label: 'Uso da conversa 0%' }, 'a real 0 stays');
  });
  test('the state is the one of the session, with today\'s words', () => {
    assert.deepEqual(cardContent(blocked()).state, { kind: 'needs', label: 'Pergunta' });
    assert.deepEqual(cardContent(blocked({ attention: { level: 'blocked', reason: 'permission' } })).state, { kind: 'permission', label: 'Pede permissão' });
    assert.deepEqual(rowContent(cardDeExemplo('r')).state, { kind: 'working', label: 'Ativa' });
  });
  test('the row: the slice is done/total with no minimum plan, "X de Y" with a plan, the idle one carries how long ago', () => {
    const r = rowContent(cardDeExemplo('r'));
    assert.equal(r.fraction, 0.8, 'the same step as the card: done + 1 with a current step');
    assert.equal(r.ratio, '4 de 5');
    const noCurrent = rowContent(cardDeExemplo('r', { plan: { done: 3, total: 5, current: null } }));
    assert.deepEqual([noCurrent.fraction, noCurrent.ratio], [0.6, '3 de 5']);
    assert.equal(rowContent(cardDeExemplo('r', { plan: { done: 5, total: 5, current: 'x' } })).ratio, '5 de 5', 'never above the total');
    assert.equal(rowContent(cardDeExemplo('r', { plan: { done: 3, total: 5, current: 'x' } })).ratio, cardContent(cardDeExemplo('r', { status: 'waiting', attention: { level: 'blocked', reason: 'question' }, plan: { done: 3, total: 5, current: 'x' } })).plan!.label.replace('Passo ', ''));
    const idleWithPlan = rowContent(cardDeExemplo('r', { status: 'waiting', attention: { level: 'idle', reason: 'turn_ended' }, plan: { done: 12, total: 14, current: null } }));
    assert.equal(idleWithPlan.ratio, null, 'an idle row is the icon, the written label and the time: no "X de Y" (#751)');
    const completed = rowContent(cardDeExemplo('r', { status: 'completed', activity: { type: 'completed', text: '' } }));
    assert.equal(completed.ratio, null, 'a completed row shows the time of its last activity, no "X de Y" (#752)');
    assert.match(completed.time, /^\d\d:\d\d$/);
    assert.equal(rowContent(cardDeExemplo('r', { status: 'completed', since: 'not a date' })).time, null, 'no clock without a date');
    assert.equal(rowContent(cardDeExemplo('r')).time, null, 'only a completed row has one');
    const bare = rowContent(cardDeExemplo('r', { plan: null }));
    assert.equal(bare.fraction, 0);
    assert.equal(bare.ratio, null);
    const idle = rowContent(cardDeExemplo('r', { status: 'waiting', attention: { level: 'idle', reason: 'turn_ended' } }));
    assert.equal(idle.state.label, 'Ociosa');
    assert.equal(idle.idle, true);
    assert.equal(r.idle, false);
    assert.equal(rowContent(cardDeExemplo('r', { status: 'completed', activity: { type: 'completed', text: '' } })).phrase, 'Terminou sem erro');
  });
});

describe('#751: the phrase of an idle row says the reason first', () => {
  const idle = (reason: string | null, text: string | undefined) => rowContent(cardDeExemplo('r', { status: 'waiting', attention: { level: 'idle', reason }, activity: text === undefined ? undefined : { type: 'your-turn', text } })).phrase;
  test('"Sua vez · <text of the core>", the reason alone without a text, the text alone when it already starts with the reason', () => {
    assert.equal(idle('turn_ended', 'Rodo os testes?'), 'Sua vez · Rodo os testes?');
    assert.equal(idle('interrupted', 'Parou no passo 2'), 'Interrompida · Parou no passo 2');
    assert.equal(idle('first_prompt', 'Aguardando o primeiro pedido'), 'No prompt · Aguardando o primeiro pedido');
    assert.equal(idle('turn_ended', undefined), 'Sua vez');
    assert.equal(idle('turn_ended', '   '), 'Sua vez');
    assert.equal(idle('turn_ended', 'Sua vez: rodo os testes?'), 'Sua vez: rodo os testes?');
    assert.equal(idle('turn_ended', 'sua vez'), 'sua vez');
  });
  test('without a known reason the phrase is the text, as before; a working or completed row does not change', () => {
    assert.equal(idle(null, 'Rodo os testes?'), 'Rodo os testes?');
    assert.equal(idle('unknown-key', 'Rodo os testes?'), 'Rodo os testes?');
    assert.equal(idle('permission', 'Bash: npm run migrate'), 'Bash: npm run migrate');
    assert.equal(rowContent(cardDeExemplo('r')).phrase, 'Rodar a bateria');
    assert.equal(rowContent(cardDeExemplo('r', { status: 'completed', activity: { type: 'completed', text: '' } })).phrase, 'Terminou sem erro');
  });
  test('the idle row shows it on screen, in the phrase and in its title', async () => {
    const { area, sair } = await montarTela(async () => MURAL);
    try {
      await ate(() => rowsOf(area).length > 0);
      const rowEl = rowsOf(area).find((r) => r.getAttribute('data-session') === 'espera-2')!;
      const phraseNode = comClasse(rowEl, 'wall-phrase')[0]!;
      assert.equal(phraseNode.textContent, 'Sua vez · Rodo os testes?');
      assert.equal(phraseNode.getAttribute('title'), 'Sua vez · Rodo os testes?');
    } finally {
      await sair();
    }
  });
});

// ---------- A tela ----------

describe('Mural: a tela montada', () => {
  test('header, the selector with the blocked and idle counts, the blocked ones as cards under "Precisam de você" and the rest as one list (#751)', async () => {
    const { area, sair } = await montarTela(async () => MURAL);
    try {
      await ate(() => sessionsOf(area).length > 0);
      assert.match(area.textContent, /^Mural ao vivo2 sessões precisam de você\. 1 trabalhando, 1 em pausa e 1 concluída\./);
      const filtros = area.todos((e) => e.getAttribute('data-filter') !== null);
      assert.deepEqual(filtros.map((f) => f.textContent), ['Todas 5', 'Precisam de você 2', 'Ativas 1', 'Ociosas 1'], 'the name of each segment reads "Ativas 1", with a real space');
      assert.equal(filtros[0]!.getAttribute('aria-pressed'), 'true');
      assert.equal(area.todos((e) => e.getAttribute('data-action') === 'refresh').length, 0, 'no Atualizar: the live stream and "Tentar de novo" read again (#752)');

      const needSection = comClasse(area, 'wall-sec-blocked');
      assert.equal(needSection.length, 1);
      assert.equal(needSection[0]!.tag, 'section');
      assert.equal(needSection[0]!.todos((e) => e.tag === 'h2').map((h) => h.textContent).join(), 'Precisam de você 2');
      const cards = cardsOf(area);
      assert.deepEqual(cards.map((c) => c.getAttribute('data-session')), ['espera-1', 'erro-1'], 'the blocked ones, in the core order, the error included');
      assert.ok(cards.every((c) => c.tag === 'div' && needSection[0]!.todos((e) => e === c).length === 1));
      const listBox = comClasse(area, 'wall-list');
      assert.deepEqual(listBox.map((l) => rowsOf(l).map((c) => c.getAttribute('data-session'))), [['ativa-1'], ['espera-2'], ['feita-1']], 'one list per section, the core order inside each (#752)');
      assert.deepEqual(comClasse(area, 'wall-h').map((h) => h.textContent), ['Precisam de você 2', 'Ativas 1', 'Ociosas 1', 'Concluídas 1']);
      assert.deepEqual(
        sessionsOf(area).map((c) => comClasse(c, 'wall-link')[0]!.getAttribute('href')),
        ['/ui/sessions/espera-1', '/ui/sessions/erro-1', '/ui/sessions/ativa-1', '/ui/sessions/espera-2', '/ui/sessions/feita-1'],
      );
      assert.doesNotMatch(area.textContent, /Esperando/);
      assert.equal(comClasse(area, 'wall-badge').length + comClasse(area, 'attention-pill').length + comClasse(area, 'attention-chip').length, 0, 'the wall draws state tags, not pills');

      const [permissionCard, errorCard] = cards;
      const whoBox = comClasse(permissionCard!, 'wall-who')[0]!;
      assert.match(whoBox.textContent, /^CClaudehá \d+ (min|h|d)Pede permissão$/, 'monogram, name, since, state');
      assert.equal(comClasse(whoBox, 'agent-monogram').length, 1);
      assert.equal(comClasse(whoBox, 'state-tag')[0]!.getAttribute('data-state-kind'), 'permission');
      assert.equal(comClasse(permissionCard!, 'wall-tt')[0]!.textContent, 'Sessão espera-1');
      assert.equal(comClasse(permissionCard!, 'wall-ask')[0]!.textContent, 'Bash: npm run migrate');
      assert.equal(comClasse(permissionCard!, 'wall-ask')[0]!.getAttribute('title'), 'Bash: npm run migrate');
      assert.equal(comClasse(permissionCard!, 'open-button').length, 0, 'target none: no button, the title link still opens the Detail');
      assert.equal(comClasse(permissionCard!, 'wall-foot').length, 0, 'no plan, no usage and no machine: no foot');

      assert.equal(comClasse(errorCard!, 'state-tag')[0]!.getAttribute('data-state-kind'), 'error');
      assert.match(comClasse(errorCard!, 'wall-foot')[0]!.textContent, /^Uso da conversa 96%$/);
      assert.ok(comClasse(errorCard!, 'wall-bar')[0]!.classes.includes('wall-high'));
      assert.deepEqual([comClasse(errorCard!, 'wall-bar')[0]!.getAttribute('value'), comClasse(errorCard!, 'wall-bar')[0]!.getAttribute('max')], ['96', '100']);

      const workingRow = rowsOf(area)[0]!;
      assert.equal(comClasse(workingRow, 'wall-link')[0]!.textContent, 'Sessão ativa-1');
      assert.equal(comClasse(workingRow, 'wall-phrase')[0]!.textContent, 'Rodar a bateria');
      assert.equal(comClasse(workingRow, 'state-tag')[0]!.getAttribute('data-state-kind'), 'working');
      assert.equal(comClasse(workingRow, 'state-tag')[0]!.textContent, 'Ativa');
      assert.equal(comClasse(workingRow, 'wall-ratio')[0]!.textContent, '4 de 5');
      assert.ok(comClasse(workingRow, 'wall-rt-work').length === 1, 'working title is the medium weight one');
      assert.equal(comClasse(rowsOf(area)[1]!, 'wall-rt-work').length, 0);
      const idleRow = rowsOf(area)[1]!;
      assert.equal(comClasse(idleRow, 'state-tag')[0]!.textContent, 'Ociosa');
      assert.equal(comClasse(idleRow, 'state-tag')[0]!.getAttribute('data-state-kind'), 'paused');
      assert.match(comClasse(idleRow, 'wall-since')[0]!.textContent, /^há \d+ (min|h|d)$/);
      const doneRow = rowsOf(area)[2]!;
      assert.equal(comClasse(doneRow, 'wall-phrase')[0]!.textContent, 'Terminou sem erro');
      assert.equal(comClasse(doneRow, 'state-tag')[0]!.textContent, 'Concluída', 'the written state stays in the row (#751)');
      assert.match(comClasse(doneRow, 'wall-since')[0]!.textContent, /^\d\d:\d\d$/, 'the clock time of the last activity');
      assert.equal(comClasse(doneRow, 'wall-since')[0]!.getAttribute('title'), 'Última atividade');
      assert.equal(comClasse(doneRow, 'wall-ratio').length, 0);
      assert.ok(head.todos((e) => e.getAttribute('href') === '/ui/wall.css').length === 1, 'a tela carrega o próprio CSS');
    } finally {
      await sair();
    }
  });

  test('a question card: the ask is the 18px one, the state says "Pergunta" with the needs shape, and the step and the bar are neutral', async () => {
    const questionCard = cardDeExemplo('p1', { status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'question' }, activity: { type: 'question', text: 'Posso apagar a pasta dist?' }, open: { target: 'desktop', command: null } });
    const { area, sair } = await montarTela(async () => ({ ...MURAL, cards: [questionCard] }));
    try {
      await ate(() => cardsOf(area).length === 1);
      const card = cardsOf(area)[0]!;
      const tag = comClasse(card, 'state-tag')[0]!;
      assert.equal(tag.getAttribute('data-state-kind'), 'needs');
      assert.equal(tag.textContent, 'Pergunta', 'the state in words, never only in colour');
      assert.equal(comClasse(card, 'state-icon').length, 1);
      assert.ok(comClasse(card, 'wall-ask')[0]!.classes.includes('wall-ask'));
      assert.match(css('wall.css'), /\.wall-ask \{[^}]*font-size:\s*18px[^}]*font-weight:\s*500/);
      assert.equal(comClasse(card, 'wall-num')[0]!.textContent, 'Passo 4 de 5', 'the current step makes it 4');
      const barEl = comClasse(card, 'wall-bar')[0]!;
      assert.equal(barEl.tag, 'progress');
      assert.deepEqual([barEl.getAttribute('value'), barEl.getAttribute('max'), barEl.getAttribute('aria-label')], ['4', '5', 'Passo 4 de 5'], 'the bar says the same step as the number');
      assert.ok(!barEl.classes.includes('wall-high'), 'the plan bar is neutral');
      assert.equal(comClasse(card, 'wall-over').length, 0);
      const buttons = comClasse(card, 'open-button');
      assert.equal(buttons.length, 1);
      assert.equal(buttons[0]!.textContent, 'Responder no Claude');
      assert.ok(buttons[0]!.classes.includes('primary'));
      assert.equal(card.todos((e) => e.classes.includes('primary')).length, 1, 'one primary per card');
    } finally {
      await sair();
    }
  });

  test('an error card says "Uso da conversa 96%" and offers "Abrir para retomar"; the step does not show in an error', async () => {
    const { area, sair } = await montarTela(async () => ({ ...MURAL, cards: [cardDeExemplo('e1', { ...MURAL.cards[3]!, open: { target: 'terminal', command: null } })] }));
    try {
      await ate(() => cardsOf(area).length === 1);
      const card = cardsOf(area)[0]!;
      assert.match(card.textContent, /Uso da conversa 96%/);
      assert.equal(comClasse(card, 'wall-over')[0]!.textContent, 'Uso da conversa 96%');
      assert.equal(comClasse(card, 'open-button')[0]!.textContent, 'Abrir para retomar');
      assert.doesNotMatch(card.textContent, /Passo/);
      assert.equal(comClasse(card, 'wall-bar').length, 1);
      assert.equal(comClasse(card, 'wall-bar')[0]!.getAttribute('aria-label'), 'Uso da conversa 96%', 'the bar says what the text beside it says (#751)');
    } finally {
      await sair();
    }
  });

  test('a permission card offers "Responder no Claude"', async () => {
    const { area, sair } = await montarTela(async () => ({ ...MURAL, cards: [{ ...MURAL.cards[1]!, open: { target: 'desktop', command: null } }] }));
    try {
      await ate(() => cardsOf(area).length === 1);
      assert.equal(comClasse(cardsOf(area)[0]!, 'open-button')[0]!.textContent, 'Responder no Claude');
    } finally {
      await sair();
    }
  });

  test('past 90% of the usage shows in red in the foot of any card, and the step stays', async () => {
    const fullCard = cardDeExemplo('q1', { status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'plan' }, context: { pct: 93, used: 1, limit: 2, label: '' } });
    const { area, sair } = await montarTela(async () => ({ ...MURAL, cards: [fullCard, cardDeExemplo('q2', { status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'plan' }, context: { pct: 90, used: 1, limit: 2, label: '' } })] }));
    try {
      await ate(() => cardsOf(area).length === 2);
      const [a, b] = cardsOf(area);
      assert.equal(comClasse(a!, 'wall-over')[0]!.textContent, 'Uso da conversa 93%');
      assert.match(comClasse(a!, 'wall-foot')[0]!.textContent, /Passo 4 de 5.*Uso da conversa 93%/);
      assert.equal(comClasse(b!, 'wall-over').length, 0, '90% is not above 90');
    } finally {
      await sair();
    }
  });

  test('a card without a plan shows no step; the ask falls back to the reason when the core sends no text', async () => {
    const bareCard = cardDeExemplo('s1', { status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'decision' }, plan: null, context: null, activity: { type: 'decision', text: '' } });
    const { area, sair } = await montarTela(async () => ({ ...MURAL, cards: [bareCard] }));
    try {
      await ate(() => cardsOf(area).length === 1);
      const card = cardsOf(area)[0]!;
      assert.equal(comClasse(card, 'wall-num').length, 0);
      assert.equal(comClasse(card, 'wall-bar').length, 0);
      assert.equal(comClasse(card, 'wall-ask')[0]!.textContent, 'Decisão pedida');
    } finally {
      await sair();
    }
  });

  test('with nothing blocked the section stays with the calm block of the prototype, which is not a live region (#752)', async () => {
    const { area, sair } = await montarTela(async () => ({ ...MURAL, cards: [MURAL.cards[0]!, MURAL.cards[2]!] }));
    try {
      await ate(() => rowsOf(area).length === 2);
      const calm = comClasse(area, 'wall-calm');
      assert.equal(calm.length, 1);
      assert.equal(calm[0]!.textContent, 'Nada precisa de você agora' + 'Quando um agente pedir uma decisão ou uma permissão, ela aparece aqui primeiro.');
      assert.equal(comClasse(calm[0]!, 'wall-calm-tile')[0]!.getAttribute('aria-hidden'), 'true');
      assert.equal(comClasse(calm[0]!, 'icon').length, 1, 'the check icon');
      assert.deepEqual(comClasse(area, 'wall-sec-blocked')[0]!.todos((e) => e.tag === 'h2').map((h) => h.textContent), ['Precisam de você 0']);
      assert.equal(area.todos((e) => e.getAttribute('aria-live') !== null || e.getAttribute('role') === 'status' || e.getAttribute('role') === 'alert').filter((e) => calm[0]!.contains(e) || e.contains(calm[0])).length, 0, 'neither the block nor what holds it is a live region');
      assert.match(comClasse(area, 'wall-summary')[0]!.textContent, /^Nada precisa de você agora\. 1 trabalhando e 1 em pausa\.$/);
    } finally {
      await sair();
    }
  });

  test('the calm block shows under Todas and Precisam de você, not under another filter, and not when the wall is empty (#752)', async () => {
    const { area, sair } = await montarTela(async () => ({ ...MURAL, cards: [MURAL.cards[0]!] }));
    try {
      await ate(() => rowsOf(area).length === 1);
      const botao = (id: string) => area.todos((e) => e.getAttribute('data-filter') === id)[0]!;
      assert.equal(comClasse(area, 'wall-calm').length, 1);
      botao('blocked').click();
      assert.equal(comClasse(area, 'wall-calm').length, 1, 'the filter of the blocked ones says it is calm too');
      assert.equal(comClasse(area, 'state').length, 0, 'and not the empty state');
      botao('idle').click();
      assert.equal(comClasse(area, 'wall-calm').length, 0);
      assert.match(area.textContent, /Nenhuma sessão ociosa/);
    } finally {
      await sair();
    }
  });

  test('only blocked sessions: the section and no list', async () => {
    const { area, sair } = await montarTela(async () => ({ ...MURAL, cards: [MURAL.cards[1]!] }));
    try {
      await ate(() => cardsOf(area).length === 1);
      assert.equal(comClasse(area, 'wall-list').length, 0);
    } finally {
      await sair();
    }
  });

  test('the machine: a remote one always with its name written; this one only when the core knows remotes', async () => {
    const WS = { id: 'ws', label: 'Workstation', state: 'connected' };
    const twoMachines = (machines: unknown[]) => ({
      ...MURAL,
      machines,
      cards: [
        cardDeExemplo('loc-c', { status: 'waiting', attention: { level: 'blocked', reason: 'question' }, machine: { id: 'local', label: 'Esta máquina' } }),
        cardDeExemplo('rem-c', { status: 'waiting', attention: { level: 'blocked', reason: 'question' }, machine: WS, open: { target: 'remote', command: null } }),
        cardDeExemplo('loc-r', { machine: { id: 'local', label: 'Esta máquina' } }),
        cardDeExemplo('rem-r', { machine: WS }),
      ],
    });
    const marksOf = (raiz: No, id: string) => comClasse(sessionsOf(raiz).find((c) => c.getAttribute('data-session') === id)!, 'mf-mach').map((m) => [m.getAttribute('data-machine-kind'), m.textContent]);
    for (const [machineSet, expectedMarks] of [
      [[{ id: 'local', label: 'Esta máquina', state: 'connected' }], [[], [['remote', 'Workstation']], [], [['remote', 'Workstation']]]],
      [[{ id: 'local', label: 'Esta máquina', state: 'connected' }, WS], [[['local', 'Esta máquina']], [['remote', 'Workstation']], [['local', 'Esta máquina']], [['remote', 'Workstation']]]],
    ] as const) {
      const { area, sair } = await montarTela(async () => twoMachines([...machineSet]));
      try {
        await ate(() => sessionsOf(area).length === 4);
        assert.deepEqual(['loc-c', 'rem-c', 'loc-r', 'rem-r'].map((id) => marksOf(area, id)), expectedMarks);
      } finally {
        await sair();
      }
    }
  });

  test('the row: a stretched link, no button inside a link, the open action as an icon above it, and the machine and the bar go in the CSS below 600px', async () => {
    const UUID = '4d2a9c35-1b7e-4c11-9d0a-2f6c8e1a7b30';
    const { area, sair } = await montarTela(async () => ({ ...MURAL, cards: [cardDeExemplo(UUID, { open: { target: 'desktop', command: null } })] }));
    try {
      await ate(() => rowsOf(area).length === 1);
      const rowEl = rowsOf(area)[0]!;
      const link = comClasse(rowEl, 'wall-link')[0]!;
      assert.equal(link.tag, 'a');
      assert.equal(link.getAttribute('href'), `/ui/sessions/${UUID}`);
      assert.equal(comClasse(rowEl, 'open-icon').length, 1, 'the open action stays reachable');
      for (const a of area.todos((e) => e.tag === 'a')) assert.equal(a.todos((e) => e.tag === 'button').length, 0, 'no button inside a link');
      const small = css('wall.css').match(/@media \(max-width: 600px\) \{([\s\S]*?)\n\}/)![1]!;
      assert.match(small, /\.wall-mach[^{]*\{[^}]*display:\s*none/);
      assert.match(small, /\.wall-grid \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    } finally {
      await sair();
    }
  });

  test('an idle row with a plan draws no ratio; the working one still does (#751)', async () => {
    const idleWithPlan = cardDeExemplo('i1', { status: 'waiting', state: 'idle', attention: { level: 'idle', reason: 'turn_ended' }, plan: { done: 12, total: 14, current: null } });
    const { area, sair } = await montarTela(async () => ({ ...MURAL, cards: [idleWithPlan, cardDeExemplo('w1')] }));
    try {
      await ate(() => rowsOf(area).length === 2);
      const byId = (id: string) => rowsOf(area).find((r) => r.getAttribute('data-session') === id)!;
      assert.equal(comClasse(byId('i1'), 'wall-ratio').length, 0);
      assert.match(comClasse(byId('i1'), 'wall-since')[0]!.textContent, /^há /);
      assert.equal(comClasse(byId('w1'), 'wall-ratio')[0]!.textContent, '4 de 5');
    } finally {
      await sair();
    }
  });

  test('waiting without attention (delegating): "Ativa" in a row, not idle, no card, no section', async () => {
    const semMotivo = cardDeExemplo('espera-3', { status: 'waiting', state: 'delegating', reason: null, attention: null, activity: { type: 'tool', text: 'Delegando ao subagente' } });
    const { area, sair } = await montarTela(async () => ({ ...MURAL, cards: [semMotivo] }));
    try {
      await ate(() => sessionsOf(area).length === 1);
      const rowEl = rowsOf(area)[0]!;
      assert.equal(cardsOf(area).length, 0);
      assert.equal(comClasse(rowEl, 'state-tag')[0]!.textContent, 'Ativa');
      assert.equal(comClasse(rowEl, 'state-tag')[0]!.getAttribute('data-state-kind'), 'working');
      assert.equal(comClasse(rowEl, 'wall-phrase')[0]!.textContent, 'Delegando ao subagente');
    } finally {
      await sair();
    }
  });

  test('montar a tela de novo não duplica o <link> do wall.css', async () => {
    for (let i = 0; i < 3; i++) {
      const { pronta, sair } = await montarTela(async () => MURAL);
      await pronta;
      await sair();
    }
    assert.equal(head.todos((e) => e.tag === 'link' && e.getAttribute('href') === '/ui/wall.css').length, 1);
    assert.equal(head.todos((e) => e.tag === 'link').length, 1);
  });

  test('o título do núcleo entra como texto: <b> não vira HTML', async () => {
    const { area, sair } = await montarTela(async () => MURAL);
    try {
      await ate(() => sessionsOf(area).length > 0);
      const feita = sessionsOf(area)[4]!;
      const titulo = comClasse(feita, 'wall-link')[0]!;
      assert.equal(titulo.textContent, '<b>negrito</b>');
      assert.equal(titulo.todos(() => true).length, 0, 'nenhum elemento dentro do título');
      assert.equal(titulo.html, '');
    } finally {
      await sair();
    }
  });

  test('the filter switches on the client, without a new request; blocked and idle apart; an empty filter shows its empty state', async () => {
    const soAtivas = { ...MURAL, count: { all: 1, waiting: 0, active: 1, blocked: 0, idle: 0 }, cards: [MURAL.cards[0]] };
    let dados: unknown = MURAL;
    const { area, rotas, ouvintes, sair } = await montarTela(async () => dados);
    try {
      await ate(() => sessionsOf(area).length === 5);
      const botao = (id: string) => area.todos((e) => e.getAttribute('data-filter') === id)[0]!;
      botao('blocked').click();
      assert.deepEqual(sessionsOf(area).map((c) => c.getAttribute('data-session')), ['espera-1', 'erro-1'], 'the error needs you too, as in the core count');
      assert.equal(botao('blocked').getAttribute('aria-pressed'), 'true');
      assert.equal(botao('all').getAttribute('aria-pressed'), 'false');
      botao('idle').click();
      assert.deepEqual(sessionsOf(area).map((c) => c.getAttribute('data-session')), ['espera-2']);
      botao('active').click();
      assert.deepEqual(sessionsOf(area).map((c) => c.getAttribute('data-session')), ['ativa-1']);
      assert.deepEqual(rotas, ['/api/wall?machine=all'], 'só a primeira leitura');

      dados = soAtivas;
      for (const f of ouvintes.reiniciar) f();
      await ate(() => rotas.length === 2 && sessionsOf(area).length === 1);
      botao('blocked').click();
      assert.equal(sessionsOf(area).length, 0);
      assert.equal(comClasse(area, 'wall-calm').length, 1, 'other cards exist, so the calm block answers (#752)');
      botao('idle').click();
      assert.match(area.textContent, /Nenhuma sessão ociosa/);
    } finally {
      await sair();
    }
  });

  test('carregando antes da primeira leitura; vazio sem sessões', async () => {
    let soltar: (v: unknown) => void = () => {};
    const { area, pronta, sair } = await montarTela(() => new Promise((r) => (soltar = r)));
    try {
      assert.equal(comClasse(area, 'loading').length, 1);
      assert.equal(comClasse(area, 'loading')[0]!.getAttribute('aria-busy'), 'true');
      soltar({ ...MURAL, count: { all: 0, waiting: 0, active: 0, blocked: 0, idle: 0 }, cards: [] });
      await pronta;
      assert.equal(comClasse(area, 'loading').length, 0);
      assert.match(area.textContent, /Nenhuma sessão aberta/);
      assert.equal(sessionsOf(area).length, 0);
    } finally {
      await sair();
    }
  });

  test('sem o núcleo: o erro com "Tentar de novo", que relê; depois, falha vira a faixa e os cards ficam', async () => {
    let falhar = true;
    const { area, rotas, ouvintes, sair } = await montarTela(async () => {
      if (falhar) throw Object.assign(new Error('O núcleo em 127.0.0.1 não respondeu'), { status: 0 });
      return MURAL;
    });
    try {
      await ate(() => /Sem conexão com o núcleo/.test(area.textContent));
      assert.match(area.textContent, /não respondeu.*Tentar de novo/);
      assert.equal(sessionsOf(area).length, 0);

      falhar = false;
      area.todos((e) => e.tag === 'button' && /Tentar de novo/.test(e.textContent))[0]!.click();
      await ate(() => sessionsOf(area).length === 5);
      assert.equal(rotas.length, 2);

      falhar = true;
      for (const f of ouvintes.reiniciar) f();
      await ate(() => comClasse(area, 'error-band').length === 1);
      assert.match(comClasse(area, 'error-band')[0]!.textContent, /O mural não atualizou/);
      assert.equal(sessionsOf(area).length, 5, 'os cards de antes continuam');
    } finally {
      await sair();
    }
  });

  test('ao vivo: uma mudança relê o mural (juntando a rajada) e reiniciar relê na hora', async () => {
    let dados: typeof MURAL = MURAL;
    const { area, rotas, ouvintes, sair } = await montarTela(async () => dados);
    try {
      await ate(() => sessionsOf(area).length === 5);
      dados = { ...MURAL, cards: [cardDeExemplo('nova-1', { title: 'Sessão nova' }), ...MURAL.cards] };
      for (const f of ouvintes.mudar) f([{ type: 'session', key: 'nova-1' }]);
      for (const f of ouvintes.mudar) f([{ type: 'plan', key: 'nova-1' }]);
      await ate(() => sessionsOf(area).length === 6);
      assert.equal(rotas.length, 2, 'a rajada vira uma leitura só');
      assert.equal(comClasse(sessionsOf(area).find((c) => c.getAttribute('data-session') === 'nova-1')!, 'wall-link')[0]!.getAttribute('href'), '/ui/sessions/nova-1');

      dados = MURAL;
      for (const f of ouvintes.reiniciar) f();
      await ate(() => sessionsOf(area).length === 5);
      assert.equal(rotas.length, 3);
    } finally {
      await sair();
    }
  });
});

describe('Mural: ao vivo com atividade contínua', () => {
  test('mudanças a cada 100 ms não adiam a releitura para sempre', async () => {
    const { area, rotas, ouvintes, sair } = await montarTela(async () => MURAL);
    try {
      await ate(() => sessionsOf(area).length === 5);
      const fim = Date.now() + 1_500;
      while (Date.now() < fim) {
        for (const f of ouvintes.mudar) f([{ type: 'session', key: 'ativa-1' }]);
        await new Promise((ok) => setTimeout(ok, 100));
      }
      assert.ok(rotas.length >= 3, `releu ${rotas.length - 1} vez(es) em 1,5 s`);
    } finally {
      await sair();
    }
  });

  test('issue 285: the card has the open action as its primary button, never inside a link, and the click does not navigate (#751)', async () => {
    const UUID = '4d2a9c35-1b7e-4c11-9d0a-2f6c8e1a7b30';
    const asking = (id: string, open: unknown) => cardDeExemplo(id, { status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'question' }, open });
    const withOpen = {
      ...MURAL,
      cards: [
        asking(UUID, { target: 'desktop', command: null }),
        asking('ao-vivo-1', { target: 'terminal-live', command: 'x' }),
        asking('remota-1', { target: 'remote', command: null }),
        asking('sem-1', { target: 'none', command: null }),
        cardDeExemplo('row-1', { open: { target: 'desktop', command: null } }),
      ],
    };
    const writes: string[] = [];
    const navigated: string[] = [];
    const area = new Elemento('main');
    const leave = new AbortController();
    const ready = mount(area, {
      params: {},
      signal: leave.signal,
      read: async () => withOpen,
      write: async (route: string) => (writes.push(route), { ok: true, opened: 'desktop' }),
      onChange: () => {},
      onRestart: () => {},
      counter: () => {},
      title: () => {},
      navigate: (r: string) => void navigated.push(r),
      liveState: () => 'live',
    });
    try {
      await ate(() => sessionsOf(area).length === 5);
      const cards = cardsOf(area);
      assert.deepEqual(
        cards.map((c) => comClasse(c, 'open-button').map((b) => b.textContent)),
        [['Responder no Claude'], ['Responder no Claude'], ['Roda em outra máquina'], []],
        'remote: the disabled button says where; none: no button, and the title link still opens the Detail',
      );
      assert.ok(comClasse(cards[0]!, 'open-button')[0]!.classes.includes('primary'));
      assert.ok(!comClasse(cards[2]!, 'open-button')[0]!.classes.includes('primary'), 'a remote session keeps its outline');
      assert.equal(comClasse(cards[2]!, 'open-button')[0]!.getAttribute('aria-disabled'), 'true');
      assert.equal(comClasse(cards[3]!, 'wall-link')[0]!.getAttribute('href'), '/ui/sessions/sem-1');
      for (const a of area.todos((e) => e.tag === 'a')) assert.equal(a.todos((e) => e.tag === 'button').length, 0, 'no button inside a link');
      comClasse(cards[0]!, 'open-button')[0]!.click();
      await ate(() => writes.length === 1);
      assert.deepEqual(writes, [`/api/sessions/${UUID}/open`]);
      assert.deepEqual(navigated, [], 'the click does not navigate');
      await ate(() => comClasse(cards[0]!, 'open-ok').length === 1);
      assert.equal(comClasse(cards[0]!, 'open-ok')[0]!.textContent, 'Aberta no Claude Desktop');
      assert.match(css('wall.css'), /\.wall-act \{[^}]*z-index:\s*1/, 'the action sits above the stretched link');
    } finally {
      leave.abort();
      (await ready)();
    }
  });

  test('o foco do teclado volta ao card da mesma sessão depois de redesenhar', async () => {
    const { area, rotas, ouvintes, sair } = await montarTela(async () => MURAL);
    try {
      await ate(() => sessionsOf(area).length === 5);
      const antes = sessionsOf(area).find((c) => c.getAttribute('data-session') === 'espera-2')!;
      antes.focus();
      for (const f of ouvintes.reiniciar) f();
      await ate(() => rotas.length === 2 && sessionsOf(area)[0] !== undefined && !sessionsOf(area).includes(antes));
      const doc = (globalThis as unknown as { document: { activeElement: Elemento } }).document;
      assert.notEqual(doc.activeElement, antes);
      assert.equal(doc.activeElement.getAttribute('data-session'), 'espera-2');
    } finally {
      (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement = null;
      await sair();
    }
  });
});

test('a tela está registrada em /ui/wall, na barra como "Mural ao vivo"', () => {
  const { screen: t } = findScreen('/ui/wall');
  assert.equal(t.id, 'wall');
  assert.equal(t.file, '/ui/screens/wall.js');
  assert.deepEqual(t.item, { label: 'Mural ao vivo', icon: 'wall', section: 'main' });
  assert.equal(t.sub, 'Um card por sessão aberta nesta máquina');
});

test('a tela e o estilo dela não escrevem cor à mão, não chamam endereço de fora nem põem HTML ou estilo inline', () => {
  for (const arquivo of ['screens/wall.js', 'wall.css']) {
    const texto = readFileSync(`${UI_FOLDER}${arquivo}`, 'utf8');
    assert.doesNotMatch(texto, /#[0-9a-f]{3,8}\b(?![\w-])|rgba?\(|hsla?\(/i, `${arquivo} escreve cor à mão`);
    assert.doesNotMatch(texto, /https?:\/\//, `${arquivo} chama endereço de fora`);
    assert.doesNotMatch(texto, /innerHTML|style=|\.style\b/, `${arquivo} põe HTML ou estilo inline`);
  }
});

test('a rota da tela é a do núcleo', async () => {
  const { WALL_ROUTE } = await import('../../src/api/index.ts');
  assert.equal(tela.WALL_ROUTE, WALL_ROUTE);
});

// O CSS de cada tela fica carregado quando se troca de tela: classe com o mesmo nome em duas telas
// desmonta a outra. As do mural levam `wall-`; em comum só a moldura (#751).
test('o wall.css não estiliza classe de outra tela: as próprias levam wall-', () => {
  const classes = (arquivo: string) => new Set([...readFileSync(`${UI_FOLDER}${arquivo}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]!));
  const daMoldura = classes('shell.css');
  const minhas = [...classes('wall.css')].filter((c) => !daMoldura.has(c));
  assert.deepEqual(minhas.filter((c) => !c.startsWith('wall-')), [], 'classe própria sem o prefixo wall-');
  const css = [...readdirSync(UI_FOLDER), ...readdirSync(`${UI_FOLDER}screens`).map((a) => `screens/${a}`)];
  for (const outra of css.filter((a) => a.endsWith('.css') && !['wall.css', 'shell.css', 'brand.css'].includes(a))) {
    assert.deepEqual([...classes(outra)].filter((c) => minhas.includes(c)), [], `wall.css e ${outra} estilizam as mesmas classes`);
  }
});

// ---------- #751: the drawing of the wall, read from the sheet and the tokens ----------

describe('#751: the sheet of the wall', () => {
  const sheet = css('wall.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...sheet.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
  const ruleOf = (selector: string) => rules.find((r) => r.selector === selector)?.body ?? '';
  const declared = (selector: string, prop: string) => ruleOf(selector).match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+)`))?.[1]?.trim();

  test('every control of the wall has the 2px --accent-line focus ring, offset 2px, the stretched links through :has', () => {
    const focus = rules.filter((r) => /:focus-visible/.test(r.selector) && /outline:\s*2px solid var\(--accent-line\)/.test(r.body));
    const dits = focus.map((r) => r.selector).join(' | ');
    for (const control of ['.wall-seg button', '.wall-treeline', '.wall-kid-toggle', '.wall-kid-title', '.wall-parked-head', '.wall-card:has(.wall-link:focus-visible)', '.wall-row:has(.wall-link:focus-visible)']) {
      assert.ok(dits.includes(control), `${control} has no focus ring: ${dits}`);
    }
    for (const r of focus) assert.match(r.body, /outline-offset:\s*2px/);
    assert.doesNotMatch(sheet, /outline:\s*2px solid var\(--accent\)(?!-)/);
    assert.match(css('open-action.css'), /\.open-icon:focus-visible, \.open-copy:focus-visible, \.open-close:focus-visible \{ outline: 2px solid var\(--accent-line\); outline-offset: 2px; \}/, 'the open action inside a card');
    assert.match(css('shell.css'), /\.btn:focus-visible[^{]*\{ outline: 2px solid var\(--accent-line\); outline-offset: 2px; \}/);
  });

  test('the New session button and its popover (new-session.css) use the --accent-line ring too (#751)', () => {
    const ns = css('new-session.css').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(ns, /\.ns-folder:focus-visible \{ outline: 2px solid var\(--accent-line\); outline-offset: 2px; \}/);
    assert.match(ns, /\.ns-button:focus-visible, \.ns-target:focus-visible, \.ns-copy:focus-visible \{ outline: 2px solid var\(--accent-line\); outline-offset: 2px; \}/);
    assert.doesNotMatch(ns, /outline:\s*2px solid var\(--accent\)(?!-)/);
  });

  test('no control is drawn with --border (the divider), the selector uses --border-control', () => {
    assert.match(ruleOf('.wall-seg'), /border:\s*1px solid var\(--border-control\)/);
    for (const r of rules.filter((x) => /button|treeline|toggle|parked-head|\.btn|:focus/.test(x.selector))) assert.doesNotMatch(r.body, /var\(--border\)/, r.selector);
  });

  test('cards and the list are the container with the 1px divider border and the card radius, with no shadow', () => {
    for (const selector of ['.wall-card', '.wall-list']) {
      assert.match(ruleOf(selector), /var\(--radius-card\)/, selector);
    }
    assert.match(ruleOf('.wall-list'), /border:\s*1px solid var\(--border\)/);
    assert.doesNotMatch(sheet, /box-shadow|drop-shadow|backdrop-filter|gradient/);
  });

  test('the list clips nothing: the ring and the failure popover of the last row show, the corners come from the first and the last row (#751)', () => {
    assert.doesNotMatch(ruleOf('.wall-list'), /overflow/);
    assert.match(ruleOf('.wall-list > .wall-row:first-child'), /border-radius:\s*calc\(var\(--radius-card\) - 1px\) calc\(var\(--radius-card\) - 1px\) 0 0/);
    assert.match(ruleOf('.wall-list > .wall-row:last-child, .wall-list > .wall-row:has(+ .wall-filler:last-child)'), /border-radius:\s*0 0 calc\(var\(--radius-card\) - 1px\) calc\(var\(--radius-card\) - 1px\)/);
    assert.match(ruleOf('.wall-list > .wall-row:only-child'), /border-radius:\s*calc\(var\(--radius-card\) - 1px\)/);
  });

  test('the focused row sits above its neighbours, and an open failure goes over the next rows, the tree and the Paradas band (#751)', () => {
    const z = (selector: string) => Number(declared(selector, 'z-index'));
    assert.ok(z('.wall-row:has(.wall-link:focus-visible)') >= 2, 'the focused row above the neighbours');
    assert.ok(z('.wall-act:has([role="status"]:not(:empty))') > Math.max(z('.wall-act'), z('.wall-tree'), z('.wall-kids, .wall-parked-list'), z('.wall-row:has(.wall-link:focus-visible)')), 'the open failure above every other layer of the wall');
  });

  test('the grid: auto-fill from 330px, one column below 600px; the feet line up at the bottom', () => {
    assert.match(declared('.wall-grid', 'grid-template-columns')!, /repeat\(auto-fill, minmax\(330px, 1fr\)\)/);
    assert.match(declared('.wall-foot', 'margin-top')!, /^auto$/);
    assert.match(ruleOf('.wall-card'), /display:\s*flex/);
    assert.match(sheet, /@media \(max-width: 600px\)/);
    assert.equal(declared('.wall-card', 'height'), undefined, 'the height comes from the grid row, not from a fixed number');
  });

  test('the type of the card: title 13.5px in --subtle on one line, the ask 18px/500, the bar 4px with a 2px radius', () => {
    assert.match(ruleOf('.wall-tt'), /font-size:\s*13\.5px/);
    assert.equal(declared('.wall-tt', 'color'), 'var(--subtle)');
    assert.match(ruleOf('.wall-tt'), /text-overflow:\s*ellipsis/);
    assert.match(ruleOf('.wall-ask'), /font-size:\s*18px/);
    assert.match(ruleOf('.wall-ask'), /font-weight:\s*500/);
    assert.match(ruleOf('.wall-ask'), /-webkit-line-clamp:\s*4/);
    assert.equal(declared('.wall-bar', 'height'), '4px');
    assert.equal(declared('.wall-bar', 'border-radius'), '2px');
    assert.equal(declared('.wall-bar', 'background'), 'var(--track)');
    assert.equal(declared('.wall-bar::-webkit-progress-value', 'background'), 'var(--muted)');
    assert.equal(declared('.wall-bar.wall-high::-webkit-progress-value', 'background'), 'var(--status-error-text)');
    assert.equal(declared('.wall-bar.wall-high::-moz-progress-bar', 'background'), 'var(--status-error-text)');
    assert.equal(declared('.wall-bar.wall-high', 'color'), 'var(--status-error-text)');
  });

  test('the meta text (the foot, the right side of the row, the phrase of a row that is not working) is --subtle; the phrase of the working one is --muted (#751)', () => {
    for (const selector of ['.wall-foot', '.wall-num', '.wall-mach', '.wall-side', '.wall-since', '.wall-ratio', '.wall-phrase']) assert.equal(declared(selector, 'color'), 'var(--subtle)', selector);
    assert.equal(declared('.wall-phrase-work', 'color'), 'var(--muted)');
    assert.equal(declared('.wall-over', 'color'), 'var(--status-error-text)');
  });

  test('the working row marks its phrase, the others do not', async () => {
    const { area, sair } = await montarTela(async () => MURAL);
    try {
      await ate(() => rowsOf(area).length > 0);
      const phrase = (id: string) => comClasse(rowsOf(area).find((r) => r.getAttribute('data-session') === id)!, 'wall-phrase')[0]!;
      assert.ok(phrase('ativa-1').classes.includes('wall-phrase-work'));
      assert.ok(!phrase('espera-2').classes.includes('wall-phrase-work'));
      assert.ok(!phrase('feita-1').classes.includes('wall-phrase-work'));
    } finally {
      await sair();
    }
  });

  test('the row is 68px tall: line-height 1.5 on the title and the phrase (#751)', () => {
    assert.equal(declared('.wall-rt', 'line-height'), '1.5');
    assert.equal(declared('.wall-phrase', 'line-height'), '1.5');
    assert.equal(declared('.wall-row', 'padding'), '12px 16px');
  });

  test('below 600px the machine goes away and the action sits at the right edge; the side wraps under the text only when it does not fit (#751, #752)', () => {
    const small = css('wall.css').match(/@media \(max-width: 600px\) \{([\s\S]*?)\n\}/)![1]!;
    assert.match(declared('.wall-main', 'flex-wrap') ?? '', /wrap/);
    assert.match(small, /\.wall-row \.wall-mach \{[^}]*display:\s*none/);
    assert.equal(declared('.wall-text', 'flex'), '1000 1 auto', 'the text takes the width first, so the side wraps only when it does not fit');
    assert.equal(declared('.wall-side', 'flex'), '1 0 auto');
    assert.equal(declared('.wall-side .wall-act', 'margin-left'), 'auto', 'at any width the action sits at the right edge, so the failure notice opens inside the row (#752)');
    assert.doesNotMatch(small, /wall-act/, 'the action rule is outside the media query');
    assert.doesNotMatch(sheet, /wall-row \.wall-bar/, 'the row has no bar, so no rule for it');
  });

  test('a long machine name or state label never pushes a card or a row sideways: everything on the line shrinks and cuts with an ellipsis (#751)', () => {
    const rule = (file: string, selector: string) => css(file).replace(/\/\*[\s\S]*?\*\//g, '').match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
    assert.match(rule('open-action.css', '.open-size-small .open-button'), /max-width:\s*100%/);
    assert.match(rule('open-action.css', '.open-size-small'), /max-width:\s*100%/);
    assert.match(rule('open-action.css', '.open-label'), /overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/);
    assert.match(rule('open-action.css', '.open-label'), /line-height:\s*1\.3/, 'overflow hidden under the button line-height of 1 cut the descenders');
    assert.match(rule('machine-filter.css', '.mf-mach'), /max-width:\s*100%/);
    assert.match(rule('machine-filter.css', '.mf-mach > span'), /overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/);
    assert.match(declared('.wall-mach', 'max-width') ?? '', /100%/);
    assert.match(declared('.wall-state', 'max-width') ?? '', /100%/);
    assert.match(rule('state-icon.css', '.state-tag'), /min-width:\s*0[^}]*max-width:\s*100%/);
    assert.match(declared('.wall-who', 'flex-wrap') ?? '', /wrap/);
    assert.match(declared('.wall-main', 'flex-wrap') ?? '', /wrap/);
    assert.equal(declared('.wall-main', 'min-width'), '0');
    assert.equal(declared('.wall-side', 'min-width'), '0');
    assert.equal(declared('.wall-side', 'max-width'), '100%');
  });

  test('the screen never sets the height of a button: the card action gets its size from openAction', () => {
    const code = css('screens/wall.js');
    assert.doesNotMatch(code, /size:\s*'small'[^}]*size:/);
    assert.doesNotMatch(sheet, /\.open-button|\.btn[^{]*\{[^}]*(height|--btn-h)/);
  });

  test('the header and the segments wrap, so the screen does not scroll sideways at 700 or 900 (#751, #752)', () => {
    const block = (width: number) => css('wall.css').match(new RegExp(`@media \\(max-width: ${width}px\\) \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
    assert.match(declared('.wall-top', 'flex-wrap') ?? '', /wrap/);
    assert.match(declared('.wall-segs', 'flex-wrap') ?? '', /wrap/);
    assert.match(declared('.wall-seg', 'flex-wrap') ?? '', /wrap/);
    assert.match(declared('.wall-seg', 'max-width') ?? '', /100%/);
    assert.equal(declared('.wall-top-text', 'min-width'), '0');
    for (const narrow of [600, 640]) assert.doesNotMatch(block(narrow), /wall-top|wall-segs|\.wall-seg /, `the ${narrow}px block repeats the header rules`);
    assert.equal(block(640), '', 'no 640px block is left');
  });

  test('the screen has no double blank lines', () => {
    assert.doesNotMatch(css('screens/wall.js'), /\n\n\n/);
  });

  test('the dead rules of the old card are gone', () => {
    for (const dead of ['wall-badge', 'wall-b-', 'wall-gr(?![a-z])', 'wall-bars', 'wall-planrow', 'wall-st-', 'wall-prj', 'wall-l1', 'wall-detail', 'wall-pill']) assert.doesNotMatch(sheet, new RegExp(dead), dead);
    const code = css('screens/wall.js');
    for (const dead of ['modelName', 'STATUS_LABEL', 'Detalhe ›', 'attentionPill', 'reasonChip', "'Modelo'", "'Custo'"]) assert.ok(!code.includes(dead), `the screen still carries ${dead}`);
    assert.doesNotMatch(code, /wall-gr(?![a-z])/);
  });

  test('every class the screen builds is styled or is a hook of the tests', () => {
    const code = css('screens/wall.js');
    const built = new Set([...code.matchAll(/class: '([^']+)'/g)].flatMap((m) => m[1]!.split(/\s+/)).filter((c) => c.startsWith('wall-') && !c.includes('$')));
    const styled = new Set([...sheet.matchAll(/\.(wall-[a-z0-9-]+)/g)].map((m) => m[1]!));
    const hooks = new Set(['wall-lead', 'wall-ratio']);
    assert.deepEqual([...built].filter((c) => !styled.has(c) && !hooks.has(c)), []);
  });
});

// ---------- #751: contrast of the colours the sheet of the wall writes, from tokens.json ----------

describe('#751: contrast of the wall, both themes', () => {
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
  const token = (name: string, theme: 'dark' | 'light'): string => {
    const status = name.match(/^--status-(\w+)-(dot|text|badge|border)$/);
    if (status) return tokens.status[status[1]!][theme][status[2]!];
    const key = name.slice(2).replace(/-(\w)/g, (_m, c: string) => c.toUpperCase());
    assert.ok(tokens.themes[theme][key], `${name} is not in tokens.json`);
    return tokens.themes[theme][key];
  };
  const sheet = css('wall.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const colorOf = (selector: string, prop = 'color') => {
    const body = [...sheet.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].find((m) => m[1]!.trim() === selector)?.[2] ?? '';
    const v = body.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*var\\((--[\\w-]+)\\)`))?.[1];
    assert.ok(v, `${selector} has no ${prop}: var(--…)`);
    return v;
  };
  const ON_SURFACE = ['.wall-tt', '.wall-age', '.wall-name', '.wall-ask', '.wall-foot', '.wall-num', '.wall-over', '.wall-mach', '.wall-from', '.wall-rt', '.wall-phrase', '.wall-phrase-work', '.wall-side', '.wall-since', '.wall-ratio'];
  const ON_RAISED = ['.wall-rt', '.wall-phrase', '.wall-phrase-work', '.wall-side', '.wall-since', '.wall-ratio', '.wall-mach'];
  for (const theme of ['dark', 'light'] as const) {
    for (const [surface, TEXT] of [['surface', ON_SURFACE], ['raised', ON_RAISED]] as const) {
      test(`${theme}: the text of the wall is at least 4.5:1 on --${surface}`, () => {
        for (const selector of TEXT) {
          const c = token(colorOf(selector), theme);
          assert.ok(ratio(c, tokens.themes[theme][surface]) >= 4.5, `${selector} on ${surface}: ${ratio(c, tokens.themes[theme][surface]).toFixed(2)}`);
        }
      });
    }
    test(`${theme}: the bars are at least 3:1 on the track`, () => {
      const track = tokens.themes[theme].track as string;
      assert.ok(ratio(token('--muted', theme), track) >= 3, `muted ${ratio(token('--muted', theme), track).toFixed(2)}`);
      assert.ok(ratio(token('--status-error-text', theme), track) >= 3, `danger ${ratio(token('--status-error-text', theme), track).toFixed(2)}`);
    });
  }
});

// ---------- #333: the children nested in a leader and the "Paradas" band (C85 to C87) ----------

const { treeSummary, childContent, parkedContent } = tela;
const child = (id: string, extra: Card = {}) => ({ id, title: `Filha ${id}`, status: 'active', state: 'active', attention: null, since: '2026-10-20T11:00:00Z', parked: false, children: [], ...extra });
const WALL_WITH_CHILDREN = {
  ...MURAL,
  cards: [
    cardDeExemplo('lider', {
      tree: { total: 4, blocked: 1, active: 2, parked: 1 },
      children: [
        child('tl', { status: 'waiting', state: 'waiting', attention: { level: 'idle', reason: 'turn_ended' }, children: [child('neta', { children: [child('bisneta')] })] }),
        child('pede', { status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'question' } }),
        child('velha', { status: 'completed', state: 'completed', parked: true }),
      ],
    }),
    cardDeExemplo('pede', { title: 'Pendências', status: 'waiting', state: 'waiting', attention: { level: 'blocked', reason: 'question' }, activity: { type: 'question', text: 'Confere a v0.0.36?' }, parentId: 'lider' }),
  ],
  parked: { total: 9, items: [cardDeExemplo('p1', { status: 'completed', state: 'completed', activity: { type: 'completed', text: '' } }), cardDeExemplo('p2', { status: 'abandoned', state: 'active', activity: { type: 'idle', text: 'Interrompida (Esc)' } })] },
};

describe('Wall: nested children and Paradas (#333)', () => {
  test("the leader's summary: the counts of the whole tree, without the zeros, singular and plural", () => {
    assert.deepEqual(treeSummary({ total: 4, blocked: 1, active: 2, parked: 1 })?.map((p: { text: string }) => p.text), ['4 filhas', '1 precisa de você', '2 ativas', '1 parada']);
    assert.deepEqual(treeSummary({ total: 1, blocked: 0, active: 0, parked: 0 })?.map((p: { text: string }) => p.text), ['1 filha']);
    assert.deepEqual(treeSummary({ total: 3, blocked: 2, active: 0, parked: 2 })?.map((p: { text: string }) => p.text), ['3 filhas', '2 precisam de você', '2 paradas']);
    assert.equal(treeSummary(null), null);
    assert.equal(treeSummary({ total: 0, blocked: 0, active: 0, parked: 0 }), null);
  });

  test('childContent and parkedContent: what each row shows', () => {
    const now = Date.parse('2026-10-20T16:00:00Z');
    assert.equal(childContent(child('x', { since: '2026-10-20T11:00:00Z' }), now).since, 'há 5 h');
    assert.equal(parkedContent(null), null);
    assert.equal(parkedContent({ total: 0, items: [] }), null);
    assert.deepEqual(parkedContent({ total: 23, items: new Array(7) }), { title: 'Paradas (23)', shown: 7, total: 23, more: 16 });
    assert.equal(parkedContent({ total: 250, items: new Array(7) })?.more, 93, 'the core stops at 100');
  });

  test('a leader comes with its summary closed; opening shows the children, and each level opens closed inside its mother', async () => {
    const { area, sair } = await montarTela(async () => WALL_WITH_CHILDREN);
    try {
      await ate(() => sessionsOf(area).length === 2);
      const treeLine = area.todos((e) => e.getAttribute('data-tree') === 'lider')[0]!;
      assert.match(treeLine.textContent, /4 filhas.*1 precisa de você.*2 ativas.*1 parada/);
      assert.equal(treeLine.getAttribute('aria-expanded'), 'false');
      assert.equal(comClasse(area, 'wall-kid').length, 0, 'closed');
      treeLine.click();
      assert.deepEqual(area.todos((e) => e.getAttribute('data-child') !== null).map((e) => e.getAttribute('data-child')), ['tl', 'pede', 'velha'], 'only the first level');
      assert.ok(comClasse(area, 'wall-span').length === 1, 'an opened leader takes the row');
      const openKid = comClasse(area.todos((e) => e.getAttribute('data-child') === 'tl')[0]!, 'wall-kid-toggle')[0]!;
      openKid.click();
      assert.deepEqual(area.todos((e) => e.getAttribute('data-child') !== null).map((e) => e.getAttribute('data-child')), ['tl', 'neta', 'pede', 'velha'], 'the granddaughter shows, the great-granddaughter does not yet');
      assert.match(area.todos((e) => e.getAttribute('data-child') === 'velha')[0]!.textContent, /parada/);
      assert.equal(area.todos((e) => e.getAttribute('data-child') === 'pede')[0]!.todos((e) => e.tag === 'a')[0]!.getAttribute('href')?.includes('/ui/sessions/pede'), true, 'each child opens its own session');
    } finally {
      await sair();
    }
  });

  test('the child that needs you is a card of its own and says whose it is', async () => {
    const { area, sair } = await montarTela(async () => WALL_WITH_CHILDREN);
    try {
      await ate(() => sessionsOf(area).length === 2);
      const kid = area.todos((e) => e.getAttribute('data-session') === 'pede' && e.classes.includes('wall-card'))[0]!;
      assert.match(comClasse(kid, 'wall-from')[0]!.textContent, /filha de Sessão lider/);
    } finally {
      await sair();
    }
  });

  test('Paradas: closed with the counter; opened, the rows and "Mostrar mais", which re-reads with parkedLimit; only under Todas', async () => {
    const routes: string[] = [];
    const { area, sair, rotas: r } = await montarTela(async (rota) => (routes.push(rota), WALL_WITH_CHILDREN));
    try {
      await ate(() => sessionsOf(area).length === 2);
      const bandHead = () => area.todos((e) => e.getAttribute('data-parked') === 'toggle')[0]!;
      assert.match(bandHead().textContent, /Paradas \(9\)/);
      assert.match(bandHead().textContent, /Recolhida/);
      assert.equal(comClasse(area, 'wall-parked-list').length, 0);
      bandHead().click();
      assert.deepEqual(area.todos((e) => e.getAttribute('data-parked-row') !== null).map((e) => e.getAttribute('data-parked-row')), ['p1', 'p2']);
      assert.match(bandHead().textContent, /Mostrando 2 de 9/);
      area.todos((e) => e.getAttribute('data-parked') === 'more')[0]!.click();
      await ate(() => r.length === 2);
      assert.equal(r[1], '/api/wall?machine=all&parkedLimit=100');
      area.todos((e) => e.getAttribute('data-filter') === 'blocked')[0]!.click();
      assert.equal(area.todos((e) => e.getAttribute('data-parked') === 'toggle').length, 0, 'outside Todas the band does not show');
    } finally {
      await sair();
    }
  });

  test('an older core without children or Paradas shows the wall as before', async () => {
    const { area, sair } = await montarTela(async () => MURAL);
    try {
      await ate(() => sessionsOf(area).length === 5);
      assert.equal(area.todos((e) => e.getAttribute('data-tree') !== null).length, 0);
      assert.equal(area.todos((e) => e.getAttribute('data-parked') !== null).length, 0);
    } finally {
      await sair();
    }
  });
});

// ---------- #752: the sentence, the lists, the calm block and the sheet ----------

describe('#752: the sentence of the header is one live region, written only when it changes', () => {
  const writes: No[] = [];
  const desc = Object.getOwnPropertyDescriptor(No.prototype, 'textContent')!;
  const spy = () => Object.defineProperty(No.prototype, 'textContent', { ...desc, set(this: No, v: string) { writes.push(this); desc.set!.call(this, v); } });
  const unspy = () => Object.defineProperty(No.prototype, 'textContent', desc);
  const inSummary = (n: No) => (n.parent as Elemento | null)?.classes.includes('wall-summary') ?? false;

  test('first paint writes the sentence once; N redraws with the same sentence write nothing', async () => {
    writes.length = 0;
    spy();
    const { area, ouvintes, rotas, sair } = await montarTela(async () => MURAL);
    try {
      await ate(() => sessionsOf(area).length === 5);
      const summary = comClasse(area, 'wall-summary')[0]!;
      const mine = () => writes.filter(inSummary);
      assert.equal(mine().filter((n) => n === summary.filhos[0]).length <= 2, true, 'the loading sentence, then the real one');
      assert.equal(mine().filter((n) => n === summary.filhos[0]).length, 1, 'the lead is written once with the data');
      const before = mine().length;
      for (let i = 0; i < 5; i++) {
        for (const f of ouvintes.mudar) f([{ type: 'session', key: 'x' }]);
        await ate(() => rotas.length === 2 + i);
        await new Promise((r) => setTimeout(r, 20));
      }
      assert.equal(mine().length, before, 'no write into the live region while the sentence stays');
      assert.equal(summary.getAttribute('aria-live'), 'polite');
    } finally {
      unspy();
      await sair();
    }
  });

  test('nothing else on the screen is a live region: the calm block, the band and the loading do not repeat the sentence', async () => {
    const onlyActive = { ...MURAL, count: { all: 1, waiting: 0, active: 1, blocked: 0, idle: 0 }, cards: [MURAL.cards[0]] };
    const { area, sair } = await montarTela(async () => onlyActive);
    try {
      await ate(() => sessionsOf(area).length === 1);
      assert.equal(comClasse(area, 'wall-calm').length, 1);
      assert.deepEqual(area.todos((e) => e.getAttribute('aria-live') !== null).map((e) => e.classes.join(' ')), ['wall-summary']);
      assert.equal(area.todos((e) => ['status', 'alert'].includes(e.getAttribute('role') ?? '') && e.classes.includes('wall-calm')).length, 0);
    } finally {
      await sair();
    }
  });
});

describe('#752: no refresh button; the live stream and "Tentar de novo" read again', () => {
  test('the wall has no "Atualizar" and no refresh action, in the wall and in the error', async () => {
    const { area, sair } = await montarTela(async () => MURAL);
    try {
      await ate(() => sessionsOf(area).length === 5);
      assert.equal(area.todos((e) => e.getAttribute('data-action') === 'refresh').length, 0);
      assert.doesNotMatch(area.textContent, /Atualizar/);
    } finally {
      await sair();
    }
    const failed = await montarTela(async () => {
      throw Object.assign(new Error('O núcleo não respondeu'), { status: 0 });
    });
    try {
      await ate(() => /Sem conexão/.test(failed.area.textContent));
      assert.doesNotMatch(failed.area.textContent, /Atualizar/);
      assert.equal(failed.area.todos((e) => e.tag === 'button' && /Tentar de novo/.test(e.textContent)).length, 1);
    } finally {
      await failed.sair();
    }
  });
});

describe('#752: list semantics of the sections, the nested children and Paradas', () => {
  test('every list has a name and holds only list items or aria-hidden fillers; the children and Paradas lists are named', async () => {
    const { area, sair } = await montarTela(async () => WALL_WITH_CHILDREN);
    try {
      await ate(() => sessionsOf(area).length === 2);
      comClasse(area, 'wall-treeline')[0]!.click();
      area.todos((e) => e.getAttribute('data-parked') === 'toggle')[0]!.click();
      const lists = area.todos((e) => e.getAttribute('role') === 'list');
      assert.ok(lists.length >= 3, 'sections, the children and Paradas');
      for (const list of lists) {
        const named = list.getAttribute('aria-label') || list.getAttribute('aria-labelledby');
        assert.ok(named, `a list with no name: ${list.classes.join(' ')}`);
        for (const kid of list.children) assert.ok(kid.getAttribute('role') === 'listitem' || kid.getAttribute('aria-hidden') === 'true', `a child of a list that is no item: ${kid.classes.join(' ')}`);
      }
      assert.match(comClasse(area, 'wall-kids')[0]!.getAttribute('aria-label')!, /^Filhas de /);
      const band = comClasse(area, 'wall-parked-list')[0]!;
      assert.equal(area.todos((e) => e.getAttribute('id') === band.getAttribute('aria-labelledby')).length, 1, 'Paradas is named by its heading');
    } finally {
      await sair();
    }
  });
});

describe('#752: the sheet of the sections', () => {
  const sheet = css('wall.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...sheet.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
  const declared = (selector: string, prop: string) => rules.find((r) => r.selector === selector)?.body.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+)`))?.[1]?.trim();

  test('the sentence is 17px with the lead at weight 600 and line-height 1.5; the title keeps --text-title', () => {
    assert.equal(declared('.wall-summary', 'font-size'), '17px');
    assert.equal(declared('.wall-summary', 'line-height'), '1.5');
    assert.equal(declared('.wall-summary b', 'font-weight'), 'var(--weight-semibold)');
    assert.match(css('shell.css') + sheet, /--text-title/);
    assert.equal(declared('.wall-title', 'font-size') ?? 'var(--text-title)', 'var(--text-title)');
  });

  test('28px between the header, the segments, the sections and Paradas, and 12px from a heading to its list', () => {
    assert.equal(declared('.wall-top', 'margin-bottom'), '12px', 'the main gap of 16px plus 12px');
    assert.equal(declared('.wall-segs', 'margin-bottom'), '12px');
    assert.equal(declared('.wall-parked', 'margin-top'), '12px');
    assert.match(css('shell.css'), /\.cc-main \{[^}]*gap:\s*16px/);
    const head = rules.find((r) => /^\.wall-h\b/.test(r.selector) && /margin/.test(r.body));
    assert.ok(head, 'a heading rule with a margin');
    assert.match(head!.body, /margin[^;]*12px/);
  });

  test('the segment track is --border-control, the pending number is --status-waiting-text only above zero, and no dead rule is left', () => {
    assert.match(declared('.wall-seg', 'border') ?? '', /var\(--border-control\)/);
    assert.match(sheet, /--status-waiting-text/);
    assert.doesNotMatch(sheet, /\.wall-need\b/);
    assert.equal(declared('.wall-side', 'gap'), '12px');
    assert.match(declared('.wall-calm', 'padding') ?? '', /24px 28px/);
  });

  test('the yellow number of "Precisam de você" shows only above zero', async () => {
    assert.equal(declared('.wall-seg-need', 'color'), 'var(--status-waiting-text)');
    const none = await montarTela(async () => ({ ...MURAL, count: { all: 1, waiting: 0, active: 1, blocked: 0, idle: 0 }, cards: [MURAL.cards[0]] }));
    try {
      await ate(() => sessionsOf(none.area).length === 1);
      assert.equal(none.area.todos((e) => e.classes.includes('wall-seg-need')).length, 0);
    } finally {
      await none.sair();
    }
    const some = await montarTela(async () => MURAL);
    try {
      await ate(() => sessionsOf(some.area).length === 5);
      assert.equal(some.area.todos((e) => e.classes.includes('wall-seg-need')).length, 1);
    } finally {
      await some.sair();
    }
  });
});

describe('#752: round 3, the sheet and the names measured in the browser', () => {
  const sheet = css('wall.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...sheet.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
  const declared = (selector: string, prop: string) => rules.find((r) => r.selector === selector)?.body.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+)`))?.[1]?.trim();

  test('the toggle of Paradas takes the width of its block, so it never makes the page scroll sideways', () => {
    assert.equal(declared('.wall-parked-head', 'width'), '100%');
  });

  test('the rest of the sentence and the second line of the calm block are --muted, and the segment numbers take the colour of their label', () => {
    assert.equal(declared('.wall-summary', 'color'), 'var(--muted)');
    assert.equal(declared('.wall-calm-text', 'color'), 'var(--muted)');
    assert.equal(declared('.wall-seg-n', 'color'), undefined);
  });

  test('Paradas is named by its title alone, the id sits on the bold text and not on the heading or the button', async () => {
    const { area, sair } = await montarTela(async () => WALL_WITH_CHILDREN);
    try {
      await ate(() => sessionsOf(area).length === 2);
      for (const open of [false, true]) {
        if (open) area.todos((e) => e.getAttribute('data-parked') === 'toggle')[0]!.click();
        const band = comClasse(area, 'wall-parked')[0]!;
        const named = area.todos((e) => e.getAttribute('id') === band.getAttribute('aria-labelledby'));
        assert.equal(named.length, 1);
        assert.equal(named[0]!.tag, 'b');
        assert.match(named[0]!.textContent, /^Paradas \(\d+\)$/);
        assert.equal(comClasse(area, 'wall-parked-h')[0]!.getAttribute('id'), null);
      }
    } finally {
      await sair();
    }
  });
});

