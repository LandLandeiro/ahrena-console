import { ownerFetch as fetch } from '../owner-http.ts';
/*
 * #761 contract: the /ui reads the real answers of the p4 demo (`startDemoApi`) and every place that says
 * "precisa de você" gives the same number and the same sessions: the bar, the Mural, the Sessions filter
 * and the Início. The code under test is the real /ui code (`ui/counts.js`, `ui/wall-sections.js`, `ui/screens/wall.js`,
 * `ui/screens/sessions.js`, `ui/screens/dashboard.js`); no rule is copied here. The API side is proved by
 * `needs-you-one-number.test.ts`. The Detail focusing the message box on `?focus=message` is proved by
 * `ui-session-message.test.ts` ("Mandar mensagem" lands here with ?focus=message), which this test points at (#761).
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ElementoFalso, instalarDomFalso } from './fake-dom.ts';
import { startDemoApi, type DemoApi } from './demo-api.ts';

instalarDomFalso();
Object.assign(globalThis, {
  reportError: (e: unknown) => {
    throw e;
  },
  location: { pathname: '/ui/wall', search: '', hash: '' },
  history: { state: null, replaceState: () => {}, pushState: () => {} },
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
});

// @ts-expect-error: browser module, plain JavaScript
const { createCounts, waitingCount } = await import('../../ui/counts.js');
// @ts-expect-error: idem
const { countsOf, sectionsOf } = await import('../../ui/wall-sections.js');
// @ts-expect-error: idem
const wallScreen = await import('../../ui/screens/wall.js');
// @ts-expect-error: idem
const sessionsScreen = await import('../../ui/screens/sessions.js');
// @ts-expect-error: idem
const dashboardScreen = await import('../../ui/screens/dashboard.js');
// @ts-expect-error: idem
const { attentionOfItem, isBlocked } = await import('../../ui/attention.js');
// @ts-expect-error: idem
const { composeHref } = await import('../../ui/screens/session-message.js');
// @ts-expect-error: idem
const { resetOpenStates } = await import('../../ui/open-action.js');
// @ts-expect-error: idem
const { resetMachineChoice } = await import('../../ui/machine-filter.js');

const EXPECTED = ['sim-detail-orders', 'sim-history-monthly-report', 'sim-panel-fila-de-tarefas', 'sim-wf-cache'];
const YOUR_TURN = 'sim-panel-fila-de-tarefas';
const sorted = (ids: string[]) => [...ids].sort();
const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('did not happen in time');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('#761 contract: one number for "precisa de você" in the /ui, over the real p4 answers', () => {
  let demo: DemoApi;
  const read = async <T>(path: string): Promise<T> => {
    const r = await fetch(`${demo.api.url}${path}`);
    assert.equal(r.status, 200, `${path}: ${r.status}`);
    return (await r.json()) as T;
  };

  before(async () => {
    demo = await startDemoApi();
  });
  after(async () => {
    await demo.close();
  });

  /** Mounts the real Mural on the fake DOM, fed by `/api/wall` of the demo. */
  async function mountWall() {
    resetOpenStates();
    resetMachineChoice();
    const area = new ElementoFalso('main');
    const leave = new AbortController();
    const ctx = {
      params: {},
      signal: leave.signal,
      read: (route: string) => read<unknown>(route),
      write: async () => ({}),
      onChange: () => {},
      onRestart: () => {},
      counter: () => {},
      title: () => {},
      navigate: () => {},
      liveState: () => 'live',
    };
    const done = (await wallScreen.mount(area, ctx)) as () => void;
    await until(() => area.querySelectorAll('.wall-sec-blocked').length > 0);
    return { area, close: () => (leave.abort(), done()) };
  }

  const idsOfNodes = (nodes: ElementoFalso[]) => nodes.map((n) => n.getAttribute('data-session')!);

  test('#761/AC-1 the bar, the Mural, the Sessions filter and the Início give 4 and the same four sessions', async () => {
    const [attention, wall, sessions, dashboard] = await Promise.all([
      read<{ items: Record<string, unknown>[]; blocked: number }>('/api/attention'),
      read<{ cards: { id: string }[] }>('/api/wall'),
      read<{ items: { id: string }[]; counts: Record<string, number> }>(sessionsScreen.listRoute(sessionsScreen.stateFromQuery('?status=blocked'))),
      read<{ numbers: { sessions: { blocked: number } } }>(dashboardScreen.DASHBOARD_ROUTE),
    ]);

    // The bar: the number of the real `createCounts` tag, and the blocked items of the attention answer it counts.
    const tags: Record<string, { text: string } | null> = {};
    await createCounts({ read: (route: string) => read(route), nav: { tag: (id: string, tag: { text: string } | null) => void (tags[id] = tag) } }).refresh();
    const barNumber = waitingCount(attention);
    const barIds = attention.items.filter((i) => isBlocked(attentionOfItem(i))).map((i) => i.session as string);
    assert.equal(tags.wall?.text, '4 esperam', 'the tag the bar draws');

    // The Mural: the section of the blocked, by the real `sectionsOf`/`countsOf`, and the same section mounted in the DOM.
    const wallNumber = countsOf(wall.cards).blocked;
    const wallIds = sectionsOf(wall.cards).blocked.map((c: { id: string }) => c.id);
    const mounted = await mountWall();
    try {
      const section = mounted.area.querySelector('.wall-sec-blocked')!;
      const drawn = idsOfNodes(section.querySelectorAll('.wall-card, .wall-row'));
      assert.equal(section.querySelector('.wall-h-n')!.textContent, String(wallNumber), 'the number of the section heading');
      assert.deepEqual(sorted(drawn), sorted(wallIds), 'the DOM section holds the sessions of the model');

      // The Sessions filter: the route the screen sends for the Precisam de você pill, and its pill count.
      const filterIds = sessions.items.map((s) => s.id);
      const filterNumber = Number(sessionsScreen.pillCount(sessions.counts, 'blocked'));

      // The Início: the blocked items and count the screen reads, the cards of its inbox, and the dashboard number.
      const homeItems = dashboardScreen.blockedItems(attention);
      const homeIds = homeItems.map((i: { session: string }) => i.session);
      const inboxIds = dashboardScreen.inboxCards(attention, []).map((c: { session: string }) => c.session);

      console.log(`#761 numbers: bar=${barNumber} wall=${wallNumber} sessions=${filterNumber} home=${dashboardScreen.blockedCount(attention)} dashboard=${dashboard.numbers.sessions.blocked}`);
      console.log(`#761 ids: ${sorted(barIds).join(',')}`);

      assert.equal(barNumber, 4, 'the bar');
      assert.equal(wallNumber, 4, 'the Mural');
      assert.equal(filterNumber, 4, 'the Sessions filter');
      assert.equal(dashboardScreen.blockedCount(attention), 4, 'the Início inbox');
      assert.equal(dashboard.numbers.sessions.blocked, 4, 'the Início card');
      assert.equal(dashboardScreen.inboxTitle(dashboardScreen.blockedCount(attention)), '4 precisam de você');
      assert.deepEqual(sorted(barIds), EXPECTED, 'the bar');
      assert.deepEqual(sorted(wallIds), sorted(barIds), 'the Mural');
      assert.deepEqual(sorted(drawn), sorted(barIds), 'the Mural DOM');
      assert.deepEqual(sorted(filterIds), sorted(barIds), 'the Sessions filter');
      assert.deepEqual(sorted(homeIds), sorted(barIds), 'the Início');
      assert.deepEqual(sorted(inboxIds), sorted(barIds), 'the Início inbox cards');
    } finally {
      await mounted.close();
    }
  });

  test('#761/AC-2 the Mural draws "Sua vez" as a row of "Precisam de você" after the cards, not in "Ociosas", and "Responder" opens the message box', async () => {
    const mounted = await mountWall();
    try {
      const blocked = mounted.area.querySelector('.wall-sec-blocked')!;
      const idle = mounted.area.querySelector('.wall-sec-idle');
      const row = blocked.querySelectorAll('.wall-row').find((r) => r.getAttribute('data-session') === YOUR_TURN);
      assert.ok(row, 'a .wall-row of "Precisam de você"');
      assert.equal(blocked.querySelectorAll('.wall-card').some((c) => c.getAttribute('data-session') === YOUR_TURN), false, 'it is not a card');
      assert.ok(!idle || !idle.querySelectorAll('.wall-row, .wall-card').some((n) => n.getAttribute('data-session') === YOUR_TURN), 'not in "Ociosas"');

      // After the cards: in the order of the section's nodes, every card comes before the row.
      const order = idsOfNodes(blocked.querySelectorAll('.wall-card, .wall-row'));
      const cards = idsOfNodes(blocked.querySelectorAll('.wall-card'));
      assert.deepEqual(order.slice(0, cards.length), cards, 'the cards first');
      assert.ok(order.indexOf(YOUR_TURN) >= cards.length, 'the row after the cards');

      const answer = row.querySelector('.wall-answer')!;
      assert.equal(answer.textContent, 'Responder');
      const title = answer.getAttribute('aria-label')!;
      assert.match(title, /^Responder, .+/, 'accessible name "Responder, <title>"');
      assert.equal(answer.getAttribute('href'), `/ui/sessions/${YOUR_TURN}?focus=message#conversation`);
      assert.equal(answer.getAttribute('href'), composeHref(YOUR_TURN), 'the link the Detail reads to focus the box');
      console.log(`#761 row: ${YOUR_TURN} in "Precisam de você" after ${cards.length} cards; "${title}" -> ${answer.getAttribute('href')}`);
    } finally {
      await mounted.close();
    }
  });
});
