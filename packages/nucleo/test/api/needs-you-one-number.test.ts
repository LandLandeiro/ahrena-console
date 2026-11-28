import { OWNER_TOKEN, ownerFetch as fetch } from '../owner-http.ts';
// #761: "precisa de você" has one rule (`needsYou`, src/states/needs-you.ts) and four places read it:
// the bar (`/api/attention`), the Mural (`/api/wall`), the Sessions filter (`/api/sessions?status=blocked`)
// and the Início (`/api/dashboard` numbers, and the inbox, which is the blocked items of `/api/attention`).
// The demo is scenario p4 (`demo-api.ts`), synthetic data. The API shape does not change: only which
// sessions each answer classifies as needing the person.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { RespostaDaAtencao } from '../../src/api/attention-route.ts';
import type { RespostaDoDashboard, ListaDeSessoesHttp, Wall } from '../../src/api/index.ts';
import { startDemoApi, type DemoApi } from './demo-api.ts';

interface Four {
  bar: { number: number; ids: string[] };
  wall: { number: number; ids: string[] };
  sessions: { number: number; ids: string[] };
  home: { number: number; ids: string[] };
}

describe('#761 one rule for "precisa de você"', () => {
  let demo: DemoApi;
  const read = async <T>(path: string): Promise<T> => {
    const r = await fetch(`${demo.api.url}${path}`);
    assert.equal(r.status, 200, `${path}: ${r.status}`);
    return (await r.json()) as T;
  };
  const sorted = (ids: string[]) => [...ids].sort();

  before(async () => {
    demo = await startDemoApi();
  });
  after(async () => {
    await demo.close();
  });

  async function four(): Promise<Four> {
    const [attention, wall, blocked, dashboard] = await Promise.all([
      read<RespostaDaAtencao>('/api/attention'),
      read<Wall>('/api/wall'),
      read<ListaDeSessoesHttp>('/api/sessions?status=blocked'),
      read<RespostaDoDashboard>('/api/dashboard'),
    ]);
    const blockedItems = attention.items.filter((i) => i.attention.level === 'blocked');
    return {
      bar: { number: attention.blocked, ids: sorted(blockedItems.map((i) => i.session)) },
      wall: { number: wall.count.blocked, ids: sorted(wall.cards.filter((c) => c.attention?.level === 'blocked').map((c) => c.id)) },
      sessions: { number: blocked.total, ids: sorted(blocked.items.map((r) => r.id)) },
      // The Início: the dashboard number, and the inbox, which is the blocked items of the attention route.
      home: { number: dashboard.numbers.sessions.blocked, ids: sorted(blockedItems.map((i) => i.session)) },
    };
  }

  test('#761/AC-1 um número só: the bar, the Mural, the Sessions filter and the Início give the same number and the same sessions in p4', async () => {
    const f = await four();
    console.log(`#761 numbers: bar=${f.bar.number} wall=${f.wall.number} sessions=${f.sessions.number} home=${f.home.number}; ids=${f.bar.ids.join(',')}`);
    assert.equal(f.bar.number, 4);
    assert.equal(f.wall.number, 4, 'the Mural');
    assert.equal(f.sessions.number, 4, 'the Sessions filter');
    assert.equal(f.home.number, 4, 'the Início');
    assert.deepEqual(f.wall.ids, f.bar.ids, 'the Mural cards');
    assert.deepEqual(f.sessions.ids, f.bar.ids, 'the Sessions filter rows');
    assert.deepEqual(f.home.ids, f.bar.ids, 'the Início inbox');
    assert.deepEqual(f.bar.ids, ['sim-detail-orders', 'sim-history-monthly-report', 'sim-panel-fila-de-tarefas', 'sim-wf-cache']);
  });

  test('#761/AC-2 sua vez: a session whose turn ended is counted as needing you in the four places, and not as idle', async () => {
    const [attention, wall, idle, blocked] = await Promise.all([
      read<RespostaDaAtencao>('/api/attention'),
      read<Wall>('/api/wall'),
      read<ListaDeSessoesHttp>('/api/sessions?status=idle'),
      read<ListaDeSessoesHttp>('/api/sessions?status=blocked'),
    ]);
    const yourTurn = attention.items.filter((i) => i.attention.reason === 'turn_ended').map((i) => i.session);
    assert.deepEqual(yourTurn, ['sim-panel-fila-de-tarefas']);
    const [id] = yourTurn;
    assert.equal(attention.items.find((i) => i.session === id)!.attention.level, 'blocked', 'the bar');
    assert.deepEqual(wall.cards.find((c) => c.id === id)?.attention, { level: 'blocked', reason: 'turn_ended' }, 'the Mural');
    assert.ok(blocked.items.some((r) => r.id === id), 'the Sessions filter, blocked');
    assert.ok(!idle.items.some((r) => r.id === id), 'the Sessions filter, idle');
    assert.ok(!wall.cards.some((c) => c.id === id && c.attention?.level === 'idle'), 'the Mural, idle');
    assert.ok(!attention.items.some((i) => i.session === id && i.attention.level === 'idle'), 'the bar, idle');
    assert.equal(wall.count.idle, wall.cards.filter((c) => c.attention?.level === 'idle').length);
    const f = await four();
    assert.ok(f.home.ids.includes(id!), 'the Início');
  });

  test('#761/AC-1 the Mural puts the cards before the "Sua vez" rows, and the old error is a card, not a parked session', async () => {
    const wall = await read<Wall>('/api/wall');
    const blocked = wall.cards.filter((c) => c.attention?.level === 'blocked');
    const lastCard = blocked.map((c) => c.attention?.reason !== 'turn_ended').lastIndexOf(true);
    const firstRow = blocked.findIndex((c) => c.attention?.reason === 'turn_ended');
    assert.ok(firstRow > lastCard, 'cards first, then "Sua vez"');
    assert.ok(wall.cards.some((c) => c.id === 'sim-history-monthly-report' && c.attention?.reason === 'error'), 'the old error is a card');
    assert.ok(!wall.parked.items.some((c) => c.id === 'sim-history-monthly-report'), 'and not parked');
  });
});
