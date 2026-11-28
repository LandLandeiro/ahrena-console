import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isYourTurn, NEEDS_YOU_REASONS, needsYou } from './needs-you.ts';

describe('needsYou: the one rule behind "precisa de você" (#761)', () => {
  it('lists the six reasons that need the person, in the order the MCP enum has them', () => {
    assert.deepEqual([...NEEDS_YOU_REASONS], ['permission', 'question', 'plan', 'decision', 'error', 'turn_ended']);
  });

  for (const reason of ['permission', 'question', 'plan', 'decision', 'error', 'turn_ended']) {
    it(`is true for ${reason}`, () => {
      assert.equal(needsYou(reason), true);
    });
  }

  for (const reason of ['interrupted', 'first_prompt']) {
    it(`is false for ${reason}: nothing awaits the person`, () => {
      assert.equal(needsYou(reason), false);
    });
  }

  it('is false for no attention and for a reason it does not know', () => {
    assert.equal(needsYou(null), false);
    assert.equal(needsYou(undefined), false);
    assert.equal(needsYou(''), false);
    assert.equal(needsYou('something_else'), false);
    assert.equal(needsYou('toString'), false);
  });
});

describe('isYourTurn: the "Sua vez" row below the cards (#761)', () => {
  it('is true only for turn_ended', () => {
    assert.equal(isYourTurn('turn_ended'), true);
    for (const reason of ['permission', 'question', 'plan', 'decision', 'error', 'interrupted', 'first_prompt']) {
      assert.equal(isYourTurn(reason), false, reason);
    }
  });

  it('is false for no attention and for an unknown reason', () => {
    assert.equal(isYourTurn(null), false);
    assert.equal(isYourTurn(undefined), false);
    assert.equal(isYourTurn('something_else'), false);
  });

  it('is always inside needsYou', () => {
    for (const reason of [...NEEDS_YOU_REASONS, 'interrupted', 'first_prompt', null]) {
      if (isYourTurn(reason)) assert.equal(needsYou(reason), true);
    }
  });
});
