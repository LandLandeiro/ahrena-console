// "Nova sessão" in the /ui: the popover (popover.js) reads the folders, the primary sends `{ folder, target }` for the chosen
// segment, and the answer becomes the state in the popover, which stays open (#762). Reader and writer are stubs: nothing here reaches
// a core, a terminal or the Claude Desktop.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { ElementoFalso, documentoFalso, instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();
// @ts-expect-error: browser module, plain JavaScript
const { newSessionButton, stateOfAnswer, FOLDERS_ROUTE, NEW_SESSION_ROUTE } = await import('../../ui/new-session.js');

const FOLDERS = { folders: [{ path: '/w/app', name: 'app' }, { path: '/w/other', name: 'other' }], targets: { desktop: true, terminal: true } };
const settle = () => new Promise((ok) => setTimeout(ok, 0));
const writeError = (message: string, body: Record<string, unknown>) => Object.assign(new Error(message), { name: 'WriteError', status: 501, body });

function setup(answer: unknown, folders: unknown = FOLDERS) {
  const reads: string[] = [];
  const writes: { route: string; body: unknown }[] = [];
  const root = newSessionButton({
    read: async (route: string) => (reads.push(route), folders),
    write: async (route: string, body: unknown) => {
      writes.push({ route, body });
      if (answer instanceof Error) throw answer;
      return answer;
    },
  }) as ElementoFalso;
  // The popover exists only while it is open: `pop()` is looked up each time (#762).
  const pop = () => root.querySelector('.pop')!;
  return { root, pop, reads, writes, toggle: () => root.querySelector('.ns-button')!.click() };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => {} } });
});

describe('new session button', () => {
  test('closed at first; opening reads the folders and offers the folder, the segment and one primary', async () => {
    const { root, reads, toggle } = setup({ ok: true, opened: 'desktop' });
    assert.equal(root.querySelectorAll('.pop').length, 0);
    toggle();
    await settle();
    const pop = root.querySelector('.pop')!;
    assert.equal(root.querySelector('.ns-button')!.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(reads, [FOLDERS_ROUTE]);
    assert.deepEqual(pop.querySelectorAll('option').map((o) => o.getAttribute('value')), ['/w/app', '/w/other']);
    assert.deepEqual(pop.querySelectorAll('[role="radio"]').map((b) => b.getAttribute('data-value')), ['desktop', 'terminal']);
    assert.equal(pop.querySelectorAll('.btn.primary').length, 1);
    assert.equal(pop.querySelectorAll('.btn.filled').length, 0, 'no orange inside the popover');
  });

  test('the folder is the first field and has the focus', async () => {
    const { pop, toggle } = setup({ ok: true, opened: 'desktop' });
    toggle();
    await settle();
    assert.equal(documentoFalso.activeElement, pop().querySelector('select.ns-folder'));
  });

  test('the primary sends the chosen folder and the chosen segment; the success shows and the popover stays', async () => {
    const { pop, writes, toggle } = setup({ ok: true, opened: 'terminal' });
    toggle();
    await settle();
    pop().querySelector('[data-value="terminal"]')!.click();
    pop().querySelector('.btn.primary')!.click();
    await settle();
    assert.deepEqual(writes, [{ route: NEW_SESSION_ROUTE, body: { folder: '/w/app', target: 'terminal' } }]);
    assert.match(texto(pop().querySelector('[role="status"]')), /Aberta no Terminal/);
    await new Promise((ok) => setTimeout(ok, 30));
    assert.ok(pop(), 'it does not close by itself');
    assert.equal(texto(pop().querySelector('.btn.outline')), 'Fechar');
  });

  test('the other folder and the other segment go in the body; a second press while it opens is ignored', async () => {
    const { pop, writes, toggle } = setup({ ok: true, opened: 'desktop' });
    toggle();
    await settle();
    const select = pop().querySelector('select')!;
    select.value = '/w/other';
    select.dispatchEvent({ type: 'change' });
    const primary = pop().querySelector('.btn.primary')!;
    primary.click();
    assert.equal(primary.getAttribute('aria-busy'), 'true');
    assert.match(texto(pop().querySelector('[role="status"]')), /Abrindo…/);
    primary.click();
    await settle();
    assert.deepEqual(writes, [{ route: NEW_SESSION_ROUTE, body: { folder: '/w/other', target: 'desktop' } }]);
  });

  test('an error shows the core text and "Copiar comando"', async () => {
    const { pop, toggle } = setup(writeError('Não há um terminal que o console saiba abrir aqui; copie o comando', { command: "cd '/w/app' && claude" }));
    toggle();
    await settle();
    pop().querySelector('[data-value="terminal"]')!.click();
    pop().querySelector('.btn.primary')!.click();
    await settle();
    assert.match(texto(pop().querySelector('[role="status"]')), /copie o comando/);
    assert.ok(pop().querySelector('.ns-copy'));
  });

  test('no folder known: says how one appears, no segment and no primary', async () => {
    const { pop, toggle } = setup({ ok: true }, { folders: [], targets: {} });
    toggle();
    await settle();
    assert.match(texto(pop()), /Nenhuma pasta conhecida/);
    assert.equal(pop().querySelectorAll('[role="radio"]').length, 0);
    assert.equal(pop().querySelectorAll('.btn.primary').length, 0);
  });

  test('a launcher that is missing says the command is all that is left', async () => {
    const { pop, toggle } = setup({ ok: true }, { ...FOLDERS, targets: { desktop: false, terminal: true } });
    toggle();
    await settle();
    assert.match(pop().querySelector('.btn.primary')!.getAttribute('title') ?? '', /copiar o comando/);
    pop().querySelector('[data-value="terminal"]')!.click();
    assert.equal(pop().querySelector('.btn.primary')!.getAttribute('title'), null);
  });

  test('the button closes it again', async () => {
    const { root, toggle } = setup({ ok: true, opened: 'desktop' });
    toggle();
    await settle();
    toggle();
    assert.equal(root.querySelectorAll('.pop').length, 0);
    assert.equal(root.querySelector('.ns-button')!.getAttribute('aria-expanded'), 'false');
  });

  test('stateOfAnswer', () => {
    assert.deepEqual(stateOfAnswer({ ok: true, opened: 'desktop' }), { kind: 'ok', text: 'Aberta no Claude Desktop' });
    assert.deepEqual(stateOfAnswer(null, writeError('x', {})), { kind: 'fail', text: 'x', command: null });
  });
});
