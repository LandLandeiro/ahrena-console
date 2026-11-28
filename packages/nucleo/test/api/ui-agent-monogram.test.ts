// #751: the agent monogram: the initial in a 28px circle, the colour by the agent's name.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { instalarDomFalso } from './fake-dom.ts';

instalarDomFalso();
// @ts-expect-error: browser module, plain JavaScript
const { agentColorOf, agentMonogram } = await import('../../ui/agent-monogram.js');
const css = readFileSync(`${UI_FOLDER}agent-monogram.css`, 'utf8');

describe('#751: agentMonogram', () => {
  test('the four named agents have their colour; any other name is neutral', () => {
    assert.deepEqual(['Athena', 'Iris', 'Argos', 'Revisor', 'Claude', 'Outro', '', undefined].map(agentColorOf), ['violet', 'blue', 'teal', 'indigo', null, null, null, null]);
  });

  test('one letter, the first of the name, upper case; the colour is a class', () => {
    const m = agentMonogram('Athena');
    assert.equal(m.tagName, 'SPAN');
    assert.equal(m.textContent, 'A');
    assert.match(m.getAttribute('class')!, /^agent-monogram agent-monogram-violet$/);
    assert.equal(m.getAttribute('aria-hidden'), 'true');
    assert.equal(agentMonogram('Argos').textContent, 'A');
    assert.match(agentMonogram('Argos').getAttribute('class')!, /agent-monogram-teal/);
    assert.equal(agentMonogram('claude').textContent, 'C');
    assert.equal(agentMonogram('Claude').getAttribute('class'), 'agent-monogram');
    assert.equal(agentMonogram('').textContent, '?');
    assert.equal(agentMonogram(undefined).textContent, '?');
  });

  test('the name is data: the initial goes in as text', () => {
    const m = agentMonogram('<img src=x>');
    assert.equal(m.textContent, '<');
    assert.equal(m.children.length, 0);
  });

  test('the circle is 28px, 12px at 600, and no colour is written in the sheet', () => {
    const rule = css.match(/^\.agent-monogram \{([^}]*)\}/m)![1]!;
    assert.match(rule, /width:\s*28px/);
    assert.match(rule, /height:\s*28px/);
    assert.match(rule, /border-radius:\s*50%/);
    assert.match(rule, /font-size:\s*12px/);
    assert.match(rule, /font-weight:\s*600/);
    assert.match(rule, /background:\s*var\(--avatar\)/);
    assert.match(rule, /color:\s*var\(--muted\)/);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });
});
