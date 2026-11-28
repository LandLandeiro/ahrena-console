// #759: the order of effects of the switch of screen (`showScreen` in app.js), pinned by the order the lines appear
// in the source from an anchor, so the branches can move between functions without changing what they do.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';

const app = readFileSync(join(UI_FOLDER, 'app.js'), 'utf8');

// The position of each needle, searched in order after the anchor: each one must come after the one before it.
function inOrder(anchor: string, needles: string[]) {
  let at = app.indexOf(anchor);
  assert.ok(at >= 0, `anchor ${anchor}`);
  for (const needle of needles) {
    const next = app.indexOf(needle, at);
    assert.ok(next >= 0, `${needle} comes after ${anchor} and the needles before it`);
    at = next + needle.length;
  }
}

describe('The switch of screen keeps its order of effects (#759)', () => {
  test('leaving: the drawer closes unless a mode switch keeps it, the old screen is aborted, then a new signal and a clean failure flag', () => {
    inOrder('async function showScreen()', [
      'if (keepDrawer) keepDrawer = false;',
      'else drawer.close();',
      'leaving?.abort();',
      'new AbortController()',
      'leaving = leave;',
      'screenFailed = false;',
      'findScreen(location.pathname)',
    ]);
  });

  test('a screen that does not exist: no highlight, no tabs, the plain title, the swap settles, then the message and its way home', () => {
    inOrder('highlight(null)', [
      'openScreenId = null;',
      'screenTabs.draw(null);',
      "document.title = 'Ahrena Console';",
      'swap.settle();',
      'area.replaceChildren(empty({ title: \'Página não encontrada\', text: `Nada em ${location.pathname}.`',
      "label: 'Ir para o Dashboard', onClick: () => navigate('/ui')",
    ]);
  });

  test('a screen with no file: the swap settles, then the header and the notice, then the live card is drawn; the swap never begins', () => {
    inOrder('highlight(litItem(screen, params))', [
      'openScreenId = screen.id;',
      'screenTabs.draw(tabsFor(screen.id, appMode()));',
      'document.title = `Ahrena Console · ${screen.title}`;',
      'if (!screen.file)',
      'swap.settle();',
      'header({ icon: screen.icon, title: screen.title, sub: screen.sub ?? params.id ?? null })',
      "empty({ title: 'Esta tela ainda não existe', text: 'Ela chega na próxima versão do console.' })",
      'drawLive();',
    ]);
    assert.ok(app.indexOf('swap.begin(screen.id)') > app.indexOf("'Esta tela ainda não existe'"), 'the swap begins only for a screen with a file');
  });

  test('a screen with a file: the swap begins, the module loads, the area is cleared, mount runs, cleanup rides the signal, the swap settles', () => {
    inOrder('swap.begin(screen.id)', [
      'await import(screen.file)',
      'if (leave.signal.aborted) return;',
      'area.replaceChildren();',
      'await module.mount(area, ctx)',
      "leave.signal.addEventListener('abort', cleanup)",
      'if (!leave.signal.aborted) swap.settle();',
      'drawLive();',
    ]);
  });

  test('a module that fails: an abort on leaving is silent; anything else marks the failure, settles and offers a retry that opens again', () => {
    inOrder("if (leave.signal.aborted || e?.name === 'AbortError') return;", [
      'screenFailed = true;',
      'swap.settle();',
      "error({ title: 'A tela não abriu', text: e?.message ?? String(e), retry: () => open() })",
    ]);
  });

  test('the context a screen gets reads and writes with the signal of its own visit and drops its listeners when it leaves', () => {
    for (const piece of [
      'read(route, { signal: leave.signal, ...options })',
      'if (coldLoad && !options) shellRead.adopt(route, asked);',
      'writeCounted(route, body, { signal: leave.signal, ...options })',
      'signal: leave.signal,',
      "leave.signal.addEventListener('abort', () => listeners.change.delete(f))",
      "leave.signal.addEventListener('abort', () => listeners.restart.delete(f))",
      "leave.signal.addEventListener('abort', () => listeners.mode.delete(f))",
      "leave.signal.addEventListener('abort', () => heldListeners.delete(f))",
    ]) assert.ok(app.includes(piece), piece);
  });
});
