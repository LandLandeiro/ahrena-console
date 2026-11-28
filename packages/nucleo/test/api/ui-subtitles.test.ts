// #766: a subtitle says something about the state now (how many, who, what changed, what waits for the person) or the screen
// #766: has only its title. The registry holds no subtitle (a live number is not known there); each screen sets its own after it
// #766: reads, through `setHeaderSub`; the sentences are pure functions of what the screen already read.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, test } from 'node:test';
import { ElementoFalso, instalarDomFalso, texto } from './fake-dom.ts';

// @ts-expect-error: browser modules, plain JavaScript
const subtitles = await import('../../ui/subtitles.js');
// @ts-expect-error: browser module, plain JavaScript
const { SCREENS } = await import('../../ui/screens.js');
const { sessionBoardSub, workBoardSub, costSub } = subtitles;

const col = (id: string, total: number) => ({ id, label: id, total, page: 1, hasMore: false, items: [] });

describe('#766: the registry has no subtitle', () => {
  test('no screen of the registry carries a sub: the live ones are set by the screen after it reads', () => {
    const withSub = SCREENS.filter((s: { sub?: unknown }) => s.sub !== null && s.sub !== undefined).map((s: { id: string }) => s.id);
    assert.deepEqual(withSub, []);
  });
});

describe('#766: setHeaderSub', () => {
  test('writes, replaces and removes the line under the title, never two of them', async () => {
    instalarDomFalso();
    // @ts-expect-error: browser module, plain JavaScript
    const { header, setHeaderSub } = await import('../../ui/dom.js');
    const head: ElementoFalso = header({ icon: 'sessions', title: 'Tela', sub: null });
    assert.equal(head.querySelector('.sub'), null);
    setHeaderSub(head, '2 sessões precisam de você.');
    assert.equal(texto(head.querySelector('.sub')), '2 sessões precisam de você.');
    setHeaderSub(head, 'Nada precisa de você agora.');
    assert.equal(head.querySelectorAll('.sub').length, 1);
    assert.equal(texto(head.querySelector('.sub')), 'Nada precisa de você agora.');
    setHeaderSub(head, null);
    assert.equal(head.querySelector('.sub'), null);
    setHeaderSub(head, '');
    assert.equal(head.querySelector('.sub'), null);
    assert.equal(head.querySelectorAll('h1').length, 1, 'the title stays');
  });

  test('a header that starts with a sub loses it when the state says nothing', async () => {
    instalarDomFalso();
    // @ts-expect-error: browser module, plain JavaScript
    const { header, setHeaderSub } = await import('../../ui/dom.js');
    const head: ElementoFalso = header({ icon: 'sessions', title: 'Tela', sub: 'Antes' });
    setHeaderSub(head, null);
    assert.equal(head.querySelector('.sub'), null);
  });
});

describe('#766: the sentence of the sessions board', () => {
  test('who needs the person first, then the rest, as the Mural says it', () => {
    const columns = [col('active', 3), col('blocked', 4), col('idle', 1), col('completed', 2), col('abandoned', 0)];
    assert.equal(sessionBoardSub(columns), '4 sessões precisam de você. 3 trabalhando, 1 em pausa e 2 concluídas.');
  });
  test('nobody needs the person; one session', () => {
    assert.equal(sessionBoardSub([col('active', 1), col('blocked', 0), col('idle', 0), col('completed', 0)]), 'Nada precisa de você agora. 1 trabalhando.');
    assert.equal(sessionBoardSub([col('blocked', 1)]), '1 sessão precisa de você.');
  });
  test('an empty board, or no columns, says nothing', () => {
    assert.equal(sessionBoardSub([col('active', 0), col('blocked', 0)]), null);
    assert.equal(sessionBoardSub([]), null);
    assert.equal(sessionBoardSub(null), null);
  });
});

describe('#766: the sentence of the work board', () => {
  const column = (id: string, n: number) => ({ id, count: n, cards: Array.from({ length: n }, (_, i) => ({ number: i + 1 })) });
  test('plan and review waiting', () => {
    assert.equal(workBoardSub([column('planning', 3), column('review', 1)]), '3 itens esperam um plano e 1 espera revisão.');
    assert.equal(workBoardSub([column('planning', 1), column('review', 2)]), '1 item espera um plano e 2 esperam revisão.');
  });
  test('only one of them', () => {
    assert.equal(workBoardSub([column('planning', 2), column('review', 0)]), '2 itens esperam um plano.');
    assert.equal(workBoardSub([column('planning', 0), column('review', 1)]), '1 item espera revisão.');
  });
  test('the count of the column wins over the cards the page holds; with no count it counts the cards', () => {
    assert.equal(workBoardSub([{ id: 'planning', count: 7, cards: [{ number: 1 }] }]), '7 itens esperam um plano.');
    assert.equal(workBoardSub([{ id: 'review', cards: [{ number: 1 }, { number: 2 }] }]), '2 itens esperam revisão.');
  });
  test('an item whose plan is already running does not wait for a plan (prototype, #766)', () => {
    const running = { id: 'planning', count: 3, cards: [{ number: 1, planning: { state: 'running' } }, { number: 2 }, { number: 3, planning: { state: 'failed' } }] };
    assert.equal(workBoardSub([running, column('review', 1)]), '2 itens esperam um plano e 1 espera revisão.');
    assert.equal(workBoardSub([{ id: 'planning', count: 1, cards: [{ number: 1, planning: { state: 'running' } }] }]), null);
  });
  test('nothing waits, or nothing was read: no sentence', () => {
    assert.equal(workBoardSub([column('planning', 0), column('review', 0), column('done', 9)]), null);
    assert.equal(workBoardSub([]), null);
    assert.equal(workBoardSub(undefined), null);
  });
});

describe('#766: the sentence of the cost tab', () => {
  test('today above, below and at the average of the period', () => {
    assert.equal(costSub({ today: 5.6, average: 5, days: 30 }), 'O gasto de hoje está 12% acima da média diária de 30 dias.');
    assert.equal(costSub({ today: 4, average: 5, days: 7 }), 'O gasto de hoje está 20% abaixo da média diária de 7 dias.');
    assert.equal(costSub({ today: 5.01, average: 5, days: 30 }), 'O gasto de hoje está na média diária de 30 dias.');
  });
  test('no price, no average or no spend today: no sentence, no invented number', () => {
    assert.equal(costSub({ today: null, average: 5, days: 30 }), null);
    assert.equal(costSub({ today: 5, average: null, days: 30 }), null);
    assert.equal(costSub({ today: 5, average: 0, days: 30 }), null);
    assert.equal(costSub({ today: 0, average: 5, days: 30 }), null);
    assert.equal(costSub({ today: Number.NaN, average: 5, days: 30 }), null);
    assert.equal(costSub(undefined), null);
  });
});

describe('#766: no screen keeps a line that explains how it works', () => {
  const ui = new URL('../../ui/', import.meta.url);
  const files = ['screens.js', ...readdirSync(new URL('screens/', ui)).filter((f) => f.endsWith('.js')).map((f) => `screens/${f}`)];
  const OLD = [
    'O agora das suas sessões',
    'Um card por sessão aberta',
    'As sessões registradas nesta máquina',
    'Todos os eventos das sessões',
    'por status, só leitura',
    'Organizações e repositórios da sua conta',
    'O GitHub Project por Status',
    'As issues de um GitHub Project pelo ciclo do agente',
    'PRs, issues e sessões dos repositórios do contexto',
    'Uso, custo e produtividade das sessões',
    'Custo estimado pelo transcript, com o preço',
    'Como os agentes se orquestram',
    'Sessões encerradas, por dia',
    'Sessões encerradas ${',
    'O que você e os agentes decidiram',
    'Decisões de arquitetura dos repositórios da sua conta',
    'Decisões de produto dos repositórios da sua conta',
    'Seu Claude Code: skills, subagentes',
    'As contas de fora que o console usa',
    'a coluna vem dos sinais',
    'arraste para mudar',
  ];
  test('the explanatory subtitles of #766 are gone from the registry and from the screens', () => {
    const found: string[] = [];
    for (const file of files) {
      const source = readFileSync(new URL(file, ui), 'utf8');
      for (const text of OLD) if (source.includes(text)) found.push(`${file}: ${text}`);
    }
    assert.deepEqual(found, []);
  });
});
