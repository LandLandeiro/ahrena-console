// #761: the /ui table of reasons (ui/attention.js) is tied to the core's rule, so a reason added to one and not to the other fails here.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { IDLE_REASONS } from '../../src/api/attention.ts';
import { NEEDS_YOU_REASONS } from '../../src/states/needs-you.ts';
// @ts-expect-error: browser module, plain JavaScript
import { ATTENTION_REASONS } from '../../ui/attention.js';

describe('the /ui table of reasons follows the one needs-you rule (#761)', () => {
  test('every reason that needs you is blocked in the table', () => {
    for (const reason of NEEDS_YOU_REASONS) assert.equal(ATTENTION_REASONS[reason]?.level, 'blocked', reason);
  });

  test('every other reason is idle in the table', () => {
    for (const reason of IDLE_REASONS) assert.equal(ATTENTION_REASONS[reason]?.level, 'idle', reason);
  });

  test('the table has no reason the core does not know', () => {
    assert.deepEqual(Object.keys(ATTENTION_REASONS).sort(), [...NEEDS_YOU_REASONS, ...IDLE_REASONS].sort());
  });
});
