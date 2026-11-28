import { OWNER_TOKEN, ownerFetch as fetch } from '../owner-http.ts';
// A tela Dashboard da /ui (#27, C1): a formatação, o que cada parte mostra e a montagem da tela
// num DOM mínimo, lendo a API de verdade com os dados do simulador (cenário p1).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { openSqliteStorage, type SqliteStorage } from '../../src/adapters/sqlite/sqlite-storage.ts';
import { Accounts, startLocalApi, MontadorDoPainel, type LocalApi } from '../../src/api/index.ts';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { FleetReader } from '../../src/mcp/index.ts';
import { seedPanelScenario, PANEL_SESSION } from '../../src/simulator/panel.ts';

// ---------- Um DOM mínimo: só o que dom.js, states.js e a tela usam ----------

class No {
  filhos: No[] = [];
  pai: No | null = null;
  append(...nos: (No | string)[]) {
    for (const n of nos) {
      const no = typeof n === 'string' ? new Texto(n) : n;
      no.pai = this;
      this.filhos.push(no);
    }
  }
  replaceChildren(...nos: No[]) {
    this.filhos = [];
    this.append(...nos);
  }
  // Issue 765: the screen redraws keeping the nodes that did not change (see dashboard.js `place`).
  get childNodes(): No[] {
    return this.filhos;
  }
  remove() {
    if (this.pai) this.pai.filhos = this.pai.filhos.filter((f) => f !== this);
    this.pai = null;
  }
  get textContent(): string {
    return this.filhos.map((f) => f.textContent).join('');
  }
  set textContent(v: string) {
    this.filhos = [];
    this.append(v);
  }
  // Issue 759: the screen writes the greeting and the sentence in its own header (dom.js `setHeaderSub`).
  get parentNode(): No | null {
    return this.pai;
  }
  querySelector(seletor: string): Elemento | null {
    const [primeiro] = this.todos((e) => (seletor.startsWith('.') ? e.classes.includes(seletor.slice(1)) : e.tag === seletor));
    return primeiro ?? null;
  }
  contains(outro: unknown): boolean {
    return outro === this || this.filhos.some((f) => f.contains(outro));
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
  set innerHTML(v: string) {
    this.html = v;
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
    createElement: (t: string) => new Elemento(t),
    createElementNS: (_ns: string, t: string) => new Elemento(t),
    createTextNode: (t: string) => new Texto(t),
    querySelector: (sel: string) => head.todos((e) => sel === `link[href="${e.getAttribute('href')}"]`)[0] ?? null,
  },
});

// @ts-expect-error: módulo do navegador, em JavaScript puro
const tela = await import('../../ui/screens/dashboard.js');
const { inboxCards, cost, age, mount, modelName, quantity, inboxTitle, idleChips, idleTitle, blockedCount, idleCount } = tela;

const comClasse = (raiz: No, c: string) => raiz.todos((e) => e.classes.includes(c));

describe('Dashboard: formatação', () => {
  test('quantidades em pt-BR, como no C1', () => {
    assert.equal(quantity(412), '412');
    assert.equal(quantity(3200), '3,2 mil');
    assert.equal(quantity(48_100), '48,1 mil');
    assert.equal(quantity(2_100_000), '2,1 mi');
  });
  test('custo sempre com "~"; sem preço é traço', () => {
    assert.equal(cost(41.2), '~US$ 41,20');
    assert.equal(cost(0), '~US$ 0,00');
    assert.equal(cost(null), '~US$ —');
  });
  test('idade curta', () => {
    const agora = Date.parse('2026-11-02T12:00:00Z');
    const antes = (s: number) => new Date(agora - s * 1000).toISOString();
    assert.deepEqual([antes(2), antes(12), antes(120), antes(3 * 3600), antes(2 * 86_400)].map((i) => age(i, agora)), ['agora', '12 s', '2 min', '3 h', '2 d']);
  });
  test('nome do modelo', () => {
    assert.equal(modelName('claude-opus-5-5'), 'Opus 5.5');
    assert.equal(modelName('claude-sonnet-5'), 'Sonnet 5');
    assert.equal(modelName('claude-haiku-4-5-20251001'), 'Haiku 4.5');
    assert.equal(modelName('outro-modelo'), 'outro-modelo');
    assert.equal(modelName(null), null);
  });
  test('inbox: only the blocked ones, at most five, the ask and the model from the agent card; the idle ones go to their own row (issue 245)', () => {
    const blocked = (reason: string) => ({ level: 'blocked', reason });
    const item = (session: string, attention: { level: string; reason: string }, minutes = 2) => ({ session, title: session, project: `p-${session}`, account: { label: 'equipe', color: '' }, level: attention.level === 'blocked' ? 'needs' : 'your-turn', reason: attention.reason, attention, shortReason: 'Pede permissão', longReason: 'pede permissão para usar Bash', since: '', minutes, local: null });
    const atencao = {
      total: 8,
      blocked: 6,
      idle: 2,
      items: [item('a', blocked('permission')), item('b', blocked('error'), 0), item('c', { level: 'idle', reason: 'turn_ended' }), item('d', blocked('plan')), item('e', blocked('question')), item('f', blocked('decision')), item('g', blocked('permission')), item('h', { level: 'idle', reason: 'first_prompt' })],
    };
    const c = inboxCards(atencao, [{ session: 'a', task: 'Bash: npm run migrate', model: 'claude-opus-5-5' }]);
    assert.deepEqual(c.map((x: { session: string }) => x.session), ['a', 'b', 'd', 'e', 'f'], 'blocked only, in the route order, five at most');
    assert.deepEqual([c[0].name, c[0].text, c[0].foot, c[0].href], ['p-a', 'Bash: npm run migrate', 'Opus 5.5', '/ui/sessions/a']);
    assert.deepEqual([c[1].text, c[1].foot, c[1].age, c[1].attention], ['pede permissão para usar Bash', 'equipe', 'agora', { level: 'blocked', reason: 'error' }]);
    assert.equal(blockedCount(atencao), 6);
    assert.equal(idleCount(atencao), 2);
    assert.equal(blockedCount({ items: atencao.items }), 6, 'without the number, the blocked items');
    assert.deepEqual(idleChips(atencao).map((x: { session: string; name: string }) => [x.session, x.name]), [['c', 'p-c'], ['h', 'p-h']]);
    assert.equal(inboxTitle(1), '1 precisa de você');
    assert.equal(inboxTitle(4), '4 precisam de você');
    assert.equal(idleTitle(1), '1 em pausa');
    assert.equal(idleTitle(3), '3 em pausa');
  });

  test('waiting without attention (delegating) is "Trabalhando", not idle; the attention tones carry the dash- prefix (issue 245)', () => {
    const { statusPill, cardToneClass } = tela;
    const pill = statusPill('waiting', null);
    assert.equal(pill.textContent, 'Trabalhando');
    assert.equal(pill.getAttribute('data-state-kind'), 'working', 'the state tag of the Mural, not the pill');
    assert.equal(statusPill('waiting', { level: 'idle', reason: 'turn_ended' }).getAttribute('data-state-kind'), 'paused');
    assert.equal(statusPill('waiting', { level: 'idle', reason: 'turn_ended' }).textContent, 'Em pausa');
    assert.equal(cardToneClass('waiting', null), 'st-active');
    assert.equal(cardToneClass('waiting', { level: 'blocked', reason: 'permission' }), 'dash-st-blocked');
    assert.equal(cardToneClass('waiting', { level: 'idle', reason: 'turn_ended' }), 'dash-st-idle');
    assert.equal(cardToneClass('error', { level: 'blocked', reason: 'error' }), 'st-error');
  });
});

describe('Dashboard: a tela montada sobre a API (simulador p1)', () => {
  let sqlite: SqliteStorage;
  let api: LocalApi;
  before(async () => {
    sqlite = openSqliteStorage({ path: ':memory:' });
    await seedPanelScenario(sqlite, 'p1');
    const contas = new Accounts({ storage: sqlite, file: null });
    const frota = new FleetReader({ storage: sqlite, accounts: contas, cacheMs: 0, costMs: 0 });
    api = await startLocalApi({ ownerToken: () => OWNER_TOKEN, panelBuilder: new MontadorDoPainel({ storage: sqlite, contas, desktop: null, trabalho: null as never }), hooks: { storage: sqlite }, port: 0, log: () => {}, fleet: frota });
  });
  after(async () => {
    await api.close();
    await sqlite.close();
  });

  async function montarTela(lerOutra?: (rota: string) => Promise<unknown>) {
    const area = new Elemento('main');
    const contadores: Record<string, number> = {};
    const sair = new AbortController();
    const ctx = {
      params: {},
      signal: sair.signal,
      read: lerOutra ?? (async (rota: string) => (await fetch(`${api.url}${rota}`)).json()),
      onChange: () => {},
      onRestart: () => {},
      counter: (id: string, n: number) => (contadores[id] = n),
      titulo: () => {},
      navigate: () => {},
      liveState: () => 'live',
    };
    const limpar = await mount(area, ctx);
    return { area, contadores, sair: () => (sair.abort(), limpar()) };
  }

  test('header, the three numbers, the blocked inbox, the idle row, the agents and the activity (issue 245)', async () => {
    const { area, contadores, sair } = await montarTela();
    try {
      const texto = area.textContent;
      assert.match(texto, /^(Bom dia|Boa tarde|Boa noite)/, 'issue 759: the greeting is the title');
      assert.doesNotMatch(texto, /O agora das suas sessões/);
      assert.match(comClasse(area, 'sub')[0]?.textContent ?? '', /^1 espera por você/, '#766: the line under the title says the state now: who waits (the sessions and the cost are not in this fixture)');
      assert.deepEqual(
        comClasse(area, 'stat').map((c) => c.getAttribute('data-card')),
        ['working-now', 'spend-today', 'completed-today'],
      );
      assert.match(comClasse(area, 'stat')[0]!.textContent, /^Trabalhando agora1 sessão$/);

      const inbox = comClasse(area, 'inbox')[0]!;
      assert.match(inbox.textContent, /1 precisa de você/);
      assert.match(inbox.textContent, /travadas até você agir · quem espera há mais tempo primeiro/);
      const minis = comClasse(inbox, 'mini');
      assert.deepEqual(minis.map((m) => m.getAttribute('data-session')), ['sim-panel-motor-de-regras'], 'only the blocked one');
      // issue 285: the card is a div; "Abrir ›" is the link to the Detail.
      assert.deepEqual(minis.flatMap((m) => m.todos((e) => e.tag === 'a').map((a) => a.getAttribute('href'))), ['/ui/sessions/sim-panel-motor-de-regras']);
      assert.match(minis[0]!.textContent, /Pede permissão.*motor-de-regras.*Bash: npm run migrate.*Opus 5\.5.*Abrir/);
      assert.deepEqual(contadores, {}, 'the number of who waits is on the Mural, read by the shell (issue 750)');

      const idle = comClasse(area, 'dash-idle')[0]!;
      assert.match(idle.textContent, /^1 em pausa · sem pressaInterrompidaapp-receitasVer em Sessões$/);
      assert.equal(comClasse(idle, 'attention-chip-light').length, 1);
      assert.equal(idle.todos((e) => e.getAttribute('href') === '/ui/sessions?status=idle').length, 1, 'Ver em Sessões opens the idle filter');

      const agentes = comClasse(area, 'ac');
      assert.equal(agentes.length, 3);
      assert.equal(agentes[0]!.getAttribute('href'), `/ui/sessions/${PANEL_SESSION}`);
      assert.match(agentes[0]!.textContent, /Agente principal · Kanban de sessões no artefato.*ahrena-demo · 2 subagentes · 18 turnos.*Trabalhando/);
      assert.match(agentes[0]!.textContent, /Opus 5\.5.*~US\$ 1,84.*Rodar a bateria/);
      assert.ok(agentes[1]!.classes.includes('dash-st-blocked'));
      assert.match(agentes[1]!.textContent, /Pede permissão/, 'the tag says the reason, as the Mural does');
      assert.ok(agentes[2]!.classes.includes('dash-st-idle'));
      assert.match(agentes[2]!.textContent, /Em pausa/);

      const linhas = comClasse(area, 'row');
      assert.deepEqual(linhas.map((l) => l.getAttribute('href')), ['/ui/sessions/sim-panel-motor-de-regras', '/ui/sessions/sim-panel-app-receitas']);
      assert.match(linhas[0]!.textContent, /Pede permissão.*Pede permissão: Bash npm run migrate.*motor-de-regras/);
      assert.match(linhas[1]!.textContent, /Em pausa.*Interrompida \(Esc\).*app-receitas/);
      assert.doesNotMatch(area.textContent, /Esperando/);
      assert.ok(comClasse(area, 'ttl').some((t) => t.todos((e) => e.getAttribute('href') === '/ui/sessions').length > 0), 'Ver tudo leva às Sessões');
    } finally {
      sair();
    }
  });

  test('a árvore de subagentes abre e fecha pelo botão', async () => {
    const { area, sair } = await montarTela();
    try {
      assert.equal(comClasse(area, 'tree').length, 0);
      const botao = comClasse(area, 'subs')[0]!;
      assert.match(botao.textContent, /2 subagentes · 1 ativo/);
      botao.click();
      const arvore = comClasse(area, 'tree');
      assert.equal(arvore.length, 1);
      assert.deepEqual(comClasse(arvore[0]!, 'child').map((f) => f.textContent.replace(/\d+ (s|min)|agora/, '')), ['Explore · mapear usosTrabalhando', 'Plan · planoConcluída']);
      comClasse(area, 'subs')[0]!.click();
      assert.equal(comClasse(area, 'tree').length, 0);
    } finally {
      sair();
    }
  });

  test('sem a /api/attention, o resto fica no ar e a inbox vira a faixa de erro', async () => {
    const { area, sair } = await montarTela(async (rota) => {
      if (rota === tela.ATTENTION_ROUTE) throw Object.assign(new Error('O núcleo respondeu 404.'), { status: 404 });
      return (await fetch(`${api.url}${rota}`)).json();
    });
    try {
      assert.equal(comClasse(area, 'inbox').length, 0);
      assert.match(comClasse(area, 'error-band')[0]!.textContent, /Não deu para ler quem precisa de você/);
      assert.equal(comClasse(area, 'stat').length, 3);
    } finally {
      sair();
    }
  });

  test('sem o núcleo, o estado de erro com "Tentar de novo"', async () => {
    const { area, sair } = await montarTela(async () => {
      throw Object.assign(new Error('O núcleo não respondeu.'), { status: 0 });
    });
    try {
      assert.match(area.textContent, /Sem conexão com o núcleo.*Tentar de novo/);
      assert.equal(comClasse(area, 'stat').length, 0);
    } finally {
      sair();
    }
  });
});

test('as rotas da tela são as do núcleo', async () => {
  const { ATTENTION_ROUTE, DASHBOARD_ROUTE } = await import('../../src/api/index.ts');
  assert.equal(tela.ATTENTION_ROUTE, ATTENTION_ROUTE);
  assert.equal(tela.DASHBOARD_ROUTE, DASHBOARD_ROUTE);
});

test('a tela e o estilo dela não escrevem cor à mão nem chamam endereço de fora', () => {
  for (const arquivo of ['screens/dashboard.js', 'dashboard.css']) {
    const texto = readFileSync(`${UI_FOLDER}${arquivo}`, 'utf8');
    assert.doesNotMatch(texto, /#[0-9a-f]{3,8}\b(?![\w-])|rgba?\(|hsla?\(/i, `${arquivo} escreve cor à mão`);
    assert.doesNotMatch(texto, /https?:\/\//, `${arquivo} chama endereço de fora`);
    assert.doesNotMatch(texto, /innerHTML|style=/, `${arquivo} põe HTML ou estilo inline`);
  }
});
