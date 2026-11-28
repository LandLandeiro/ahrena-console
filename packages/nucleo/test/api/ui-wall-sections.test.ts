// #752: the sections of the wall and the sentence of its header, as pure functions: no DOM.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

// @ts-expect-error: browser module, plain JavaScript
const sections = await import('../../ui/wall-sections.js');
const { sectionOf, sectionsOf, countsOf, summaryOf, summaryText, clockOf } = sections;

type Card = Record<string, unknown>;
const card = (id: string, extra: Card = {}): Card => ({ id, status: 'active', attention: null, ...extra });
const blocked = (id: string, reason = 'question', extra: Card = {}) => card(id, { status: 'waiting', attention: { level: 'blocked', reason }, ...extra });
const idle = (id: string, extra: Card = {}) => card(id, { status: 'waiting', attention: { level: 'idle', reason: 'turn_ended' }, ...extra });
const done = (id: string, extra: Card = {}) => card(id, { status: 'completed', ...extra });

describe('#752: sectionOf puts each session in exactly one section', () => {
  test('blocked by attention, an error by status, idle, completed, and everything else active', () => {
    assert.equal(sectionOf(blocked('a')), 'blocked');
    assert.equal(sectionOf(blocked('a', 'error', { status: 'error' })), 'blocked');
    assert.equal(sectionOf(card('a', { status: 'error' })), 'blocked', 'an error by status alone needs the person too');
    assert.equal(sectionOf(idle('a')), 'idle');
    assert.equal(sectionOf(done('a')), 'completed');
    assert.equal(sectionOf(card('a')), 'active');
    assert.equal(sectionOf(card('a', { status: 'waiting', state: 'delegating' })), 'active', 'waiting without attention is working');
    assert.equal(sectionOf(card('a', { status: 'abandoned' })), 'active', 'an abandoned one the core sends without blocked stays in the list');
    assert.equal(sectionOf(blocked('a', 'permission', { status: 'abandoned' })), 'blocked');
  });
  test('idle attention wins over a completed status; blocked wins over idle', () => {
    assert.equal(sectionOf(idle('a', { status: 'completed' })), 'idle');
    assert.equal(sectionOf(card('a', { status: 'completed', attention: { level: 'blocked', reason: 'plan' } })), 'blocked');
  });
  test('an attention the UI does not know is no attention', () => {
    assert.equal(sectionOf(card('a', { attention: { level: 'urgent' } })), 'active');
    assert.equal(sectionOf(card('a', { attention: 'blocked' })), 'active');
  });
});

describe('#752: sectionsOf and countsOf keep the core order and count each card once', () => {
  const cards = [idle('i1'), blocked('b1'), card('w1'), done('d1'), blocked('b2'), card('w2'), idle('i2')];
  test('the ids of each section, in the order the core sent them', () => {
    const by = sectionsOf(cards);
    assert.deepEqual(Object.keys(by), ['blocked', 'active', 'idle', 'completed']);
    assert.deepEqual(by.blocked.map((c: Card) => c.id), ['b1', 'b2']);
    assert.deepEqual(by.active.map((c: Card) => c.id), ['w1', 'w2']);
    assert.deepEqual(by.idle.map((c: Card) => c.id), ['i1', 'i2']);
    assert.deepEqual(by.completed.map((c: Card) => c.id), ['d1']);
  });
  test('the counts add up to the cards; no card is in two sections', () => {
    const counts = countsOf(cards);
    assert.deepEqual(counts, { blocked: 2, active: 2, idle: 2, completed: 1 });
    assert.equal(Object.values(counts as Record<string, number>).reduce((a, b) => a + b, 0), cards.length);
  });
  test('a card with nested children counts once: the children are not cards of the wall', () => {
    const leader = card('l', { children: [{ id: 'k1', status: 'active', children: [] }, { id: 'k2', status: 'waiting', attention: { level: 'blocked', reason: 'question' }, children: [] }], tree: { total: 2 } });
    assert.deepEqual(countsOf([leader]), { blocked: 0, active: 1, idle: 0, completed: 0 });
  });
  test('nothing, or a missing list, is all zeros', () => {
    assert.deepEqual(countsOf([]), { blocked: 0, active: 0, idle: 0, completed: 0 });
    assert.deepEqual(countsOf(undefined), { blocked: 0, active: 0, idle: 0, completed: 0 });
  });
});

describe('#752: summaryOf, the sentence under "Mural ao vivo"', () => {
  const say = (blocked: number, active: number, idle: number, completed: number) => summaryOf({ blocked, active, idle, completed });
  test('the example of the issue, word for word', () => {
    assert.deepEqual(say(3, 3, 2, 2), { lead: '3 sessões precisam de você.', rest: '3 ativas, 2 ociosas e 2 concluídas.' });
    assert.equal(summaryText(say(3, 3, 2, 2)), '3 sessões precisam de você. 3 ativas, 2 ociosas e 2 concluídas.');
  });
  test('nobody blocked: "Nada precisa de você agora." and the rest, if any', () => {
    assert.deepEqual(say(0, 3, 2, 2), { lead: 'Nada precisa de você agora.', rest: '3 ativas, 2 ociosas e 2 concluídas.' });
  });
  test('one of each: singular where it needs it', () => {
    assert.deepEqual(say(1, 1, 1, 1), { lead: '1 sessão precisa de você.', rest: '1 ativa, 1 ociosa e 1 concluída.' });
  });
  test('a part that is zero is left out, and the "e" goes before the last one', () => {
    assert.equal(say(2, 0, 4, 1).rest, '4 ociosas e 1 concluída.');
    assert.equal(say(2, 5, 0, 0).rest, '5 ativas.');
    assert.equal(say(2, 5, 3, 0).rest, '5 ativas e 3 ociosas.');
    assert.equal(say(2, 0, 0, 7).rest, '7 concluídas.');
    assert.equal(say(0, 1, 0, 2).rest, '1 ativa e 2 concluídas.');
  });
  test('only one part, and all zero: the lead alone, with no trailing space', () => {
    assert.deepEqual(say(0, 0, 0, 0), { lead: 'Nada precisa de você agora.', rest: '' });
    assert.equal(summaryText(say(0, 0, 0, 0)), 'Nada precisa de você agora.');
    assert.equal(summaryText(say(4, 0, 0, 0)), '4 sessões precisam de você.');
  });
  test('before the first read and after a failed first read there is no sentence at all', () => {
    for (const none of [null, undefined]) {
      assert.deepEqual(summaryOf(none), { lead: '', rest: '' });
      assert.equal(summaryText(summaryOf(none)), '');
    }
  });
  test('the sentence never says "hoje"', () => {
    for (const n of [0, 1, 5]) assert.doesNotMatch(summaryText(say(n, n, n, n)), /hoje/);
  });
});

describe('#752: clockOf, the time a completed row shows', () => {
  test('HH:MM in the local time of the person, two digits', () => {
    const at = new Date(2026, 9, 20, 9, 5, 30);
    assert.equal(clockOf(at.toISOString()), '09:05');
    assert.equal(clockOf(new Date(2026, 9, 20, 23, 59).toISOString()), '23:59');
  });
  test('an invalid or missing date is an empty text, never "NaN:NaN"', () => {
    for (const bad of [undefined, null, '', 'x', '2026-13-45']) assert.equal(clockOf(bad), '');
  });
});

describe('#752: duoCells, where each row of the two-column list lands', () => {
  const { duoCells } = sections;
  const shape = (spans: boolean[]) => duoCells(spans).map((c: { i: number | null; side: string; first: boolean; last: boolean }) => `${c.i ?? '-'}${c.side[0]}${c.first ? '^' : ''}${c.last ? '$' : ''}`);
  test('an even list is pairs, row-major: the order of the core is the order of the grid', () => {
    assert.deepEqual(shape([false, false, false, false]), ['0l^', '1r^', '2l$', '3r$']);
  });
  test('an odd list ends with a filler, so the last row has no hole', () => {
    assert.deepEqual(shape([false, false, false]), ['0l^', '1r^', '2l$', '-f$']);
  });
  test('a single row is the full width, with no empty right column and no filler', () => {
    assert.deepEqual(shape([false]), ['0f^$']);
    assert.deepEqual(shape([true]), ['0f^$']);
  });
  test('a row with its tree open spans both columns; a hole it would leave beside the row before is filled', () => {
    assert.deepEqual(shape([false, false, true, false]), ['0l^', '1r^', '2f', '3l$', '-f$']);
    assert.deepEqual(shape([false, true, false, false]), ['0l^', '-f^', '1f', '2l$', '3r$']);
    assert.deepEqual(shape([true, false, false]), ['0f^', '1l$', '2r$']);
  });
  test('nothing is nothing', () => {
    assert.deepEqual(duoCells([]), []);
  });
});
