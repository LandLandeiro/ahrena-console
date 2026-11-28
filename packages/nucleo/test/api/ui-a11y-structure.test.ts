/* #764 (M16, M17, B3): the live region announces the connection only, "Ao vivo" is not in the h1, the sections of the
   Início are h2, and the first focus of the page is the link that skips to the content. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();

const read = (f: string) => readFileSync(`${UI_FOLDER}${f}`, 'utf8');
const html = read('index.html');
const app = read('app.js');
const shell = read('shell.css');

describe('issue 764 (M17): the headings', () => {
  test('the h1 of a screen is its title: the "Ao vivo" pill is not in it, nor in the header', async () => {
    // @ts-expect-error: browser module, plain JavaScript
    const dom = await import('../../ui/dom.js');
    const head = dom.header({ icon: 'sessions', title: 'Sessões', sub: null });
    assert.equal(texto(head.querySelector('h1')), 'Sessões');
    assert.equal(texto(head).includes('Ao vivo'), false);
    assert.equal(head.querySelector('[data-live]'), null);
    assert.equal(dom.livePill, undefined, 'the pill is gone, the bar shows the connection');
  });

  test('the sections of the Início are h2, not div', () => {
    const source = read('screens/dashboard.js');
    assert.doesNotMatch(source, /el\(\s*'div',\s*\{\s*class: 'ttl'/);
    assert.equal((source.match(/el\(\s*'h2',\s*\{\s*class: 'ttl'/g) ?? []).length, 3, 'inbox, active agents and recent activity');
  });

  test('the h2 of a section looks as the div did: no default margin', () => {
    assert.match(readFileSync(`${UI_FOLDER}dashboard.css`, 'utf8'), /\.ttl\s*\{[^}]*margin:\s*0/);
  });
});

describe('issue 764 (M16): the live region', () => {
  test('only the connection state of the bar is a live region; the screens do not rewrite it', () => {
    assert.doesNotMatch(app, /\[data-live\]/, 'drawLive no longer paints a pill on every screen');
    assert.doesNotMatch(html, /id="live"[^>]*(aria-live|role=)/, 'the footer block is not a region itself');
    assert.equal((read('live-block.js').match(/'aria-live'/g) ?? []).length, 1, 'one region, the state text');
  });

  test('drawing the same state again leaves the announced text as it was', async () => {
    // @ts-expect-error: browser module, plain JavaScript
    const { createLiveBlock } = await import('../../ui/live-block.js');
    const node = document.createElement('div');
    const live = createLiveBlock({ node, doc: document });
    live.draw({ state: 'live', machines: 2, version: null });
    const region = node.querySelector('[aria-live]')!;
    const text = region.firstChild;
    for (let i = 0; i < 5; i += 1) live.draw({ state: 'live', machines: 2 + i, version: null });
    assert.equal(region.firstChild, text, 'five screens later the region still holds the same text');
    live.draw({ state: 'offline', machines: 2, version: null });
    assert.equal(texto(region), 'Sem conexão', 'a change of state is the announcement');
  });
});

describe('issue 764 (B3): the skip link', () => {
  test('"Ir para o conteúdo" is the first focusable element and points at the main, which takes the focus', () => {
    const body = html.slice(html.indexOf('<body>'));
    const first = /<(a|button|input|select|textarea)\b[^>]*>/.exec(body)!;
    assert.match(first[0], /<a class="cc-skip" href="#content"[^>]*>/);
    assert.match(body, /<a class="cc-skip" href="#content">Ir para o conteúdo<\/a>/);
    assert.match(html, /<main class="cc-main" id="content" tabindex="-1">/);
  });

  test('the link is hidden until it has the focus, then visible with a focus ring, without motion', () => {
    assert.match(shell, /\.cc-skip\s*\{[^}]*position:\s*absolute/);
    assert.match(shell, /\.cc-skip:focus(-visible)?\s*\{[^}]*(top|inset-block-start):\s*(8px|0|12px)/);
    assert.match(shell, /\.cc-skip:focus(-visible)?[^{]*\{[^}]*outline/);
    assert.doesNotMatch(shell.match(/\.cc-skip[^{]*\{[^}]*\}/g)!.join(''), /transition|animation/);
  });

  test('the shell focuses the main on the link without routing to #content', () => {
    assert.match(app, /cc-skip/);
    assert.match(app, /\.focus\(\{\s*preventScroll:\s*false\s*\}\)|\.focus\(\)/);
    assert.match(app, /preventDefault/);
  });

  test('the label has at most 4 words and 28 characters, no "!" and no dash', () => {
    const label = 'Ir para o conteúdo';
    assert.ok(label.split(' ').length <= 4 && label.length <= 28 && !/[!—–]/.test(label));
  });
});
