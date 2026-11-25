// #750: the theme. The choice lives in localStorage and becomes data-theme on <html> before the first paint
// (a classic external script in <head>: the content policy forbids an inline one); without a choice the page
// follows the system. No browser here: the script runs in a bare vm context and the button on the fake DOM.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, test } from 'node:test';
import { respondUi, UI_FOLDER } from '../../src/api/ui.ts';
import { ElementoFalso, instalarDomFalso } from './fake-dom.ts';

instalarDomFalso();

// @ts-expect-error: browser module, plain JavaScript
import { createTheme, THEME_KEY } from '../../ui/theme.js';

const SCRIPT = readFileSync(`${UI_FOLDER}theme-init.js`, 'utf8');

function runInit(storage: unknown) {
  const attributes = new Map<string, string>();
  const documentElement = { setAttribute: (k: string, v: string) => void attributes.set(k, v), getAttribute: (k: string) => attributes.get(k) ?? null };
  runInNewContext(SCRIPT, { document: { documentElement }, ...(storage === undefined ? {} : { localStorage: storage }) });
  return attributes.get('data-theme') ?? null;
}
const storageWith = (value: string | null) => ({ getItem: (k: string) => (k === 'ahrena-console-theme' ? value : null) });

describe('#750 the script of the head', () => {
  test('a saved choice becomes data-theme; a value that is not light or dark is ignored', () => {
    assert.equal(runInit(storageWith('light')), 'light');
    assert.equal(runInit(storageWith('dark')), 'dark');
    for (const bad of ['purple', '', 'Light', ' dark', '<script>', 'auto']) assert.equal(runInit(storageWith(bad)), null, JSON.stringify(bad));
    assert.equal(runInit(storageWith(null)), null);
  });

  test('without localStorage, or with one that throws, the page loads and follows the system', () => {
    assert.equal(runInit(undefined), null);
    const denied = { getItem: () => { throw new Error('SecurityError'); } };
    assert.equal(runInit(denied), null);
    assert.equal(runInit(null), null);
  });

  test('the key is the one the toggle writes, and the script is served by /ui as JavaScript', async () => {
    assert.equal(THEME_KEY, 'ahrena-console-theme');
    assert.match(SCRIPT, /ahrena-console-theme/);
    const sent: { status?: number; headers?: Record<string, unknown>; body?: Buffer } = {};
    const res = { writeHead: (status: number, headers: Record<string, unknown>) => Object.assign(sent, { status, headers }), end: (body: Buffer) => void (sent.body = body) };
    await respondUi(res as never, '/ui/theme-init.js');
    assert.equal(sent.status, 200);
    assert.match(String(sent.headers?.['content-type']), /^text\/javascript/);
    assert.equal(sent.body?.toString('utf8'), SCRIPT);
  });

  test('index.html loads it as a classic script, with no defer or async, before every style sheet and before the module', () => {
    const page = readFileSync(`${UI_FOLDER}index.html`, 'utf8');
    const tag = /<script\b[^>]*src="\/ui\/theme-init\.js"[^>]*>/.exec(page);
    assert.ok(tag, 'index.html loads /ui/theme-init.js');
    assert.doesNotMatch(tag[0], /type=|defer|async/);
    const at = tag.index;
    assert.ok(at < page.indexOf('<link rel="stylesheet"'), 'before the first style sheet');
    assert.ok(at < page.indexOf('type="module"'), 'before the module');
    assert.doesNotMatch(page, /<script(?![^>]*\ssrc=)[^>]*>/, 'no inline script');
  });
});

function setup({ saved = null, dark = true }: { saved?: string | null; dark?: boolean } = {}) {
  const root = new ElementoFalso('html');
  const button = new ElementoFalso('button');
  const writes: [string, string][] = [];
  const listeners: ((e: { matches: boolean }) => void)[] = [];
  const media = { matches: dark, addEventListener: (_t: string, f: (e: { matches: boolean }) => void) => void listeners.push(f) };
  const store = new Map<string, string>(saved === null ? [] : [[THEME_KEY, saved]]);
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => (store.set(k, v), void writes.push([k, v])) };
  if (saved !== null) root.setAttribute('data-theme', saved);
  const theme = createTheme({ button, root, storage, media });
  const system = (matches: boolean) => (media.matches = matches, listeners.forEach((f) => f({ matches })));
  return { root, button, theme, writes, store, system };
}
const iconOf = (button: ElementoFalso) => button.querySelector('svg')?.getAttribute('data-icon') ?? button.querySelector('svg')?.innerHTMLFalso ?? '';

describe('#750 the toggle', () => {
  test('scenario: the system is dark, the label offers the light theme, the click goes light and it is saved', () => {
    const { root, button, writes } = setup({ dark: true });
    assert.equal(button.getAttribute('aria-label'), 'Usar tema claro');
    assert.equal(button.getAttribute('type'), 'button');
    button.click();
    assert.equal(root.getAttribute('data-theme'), 'light');
    assert.deepEqual(writes, [['ahrena-console-theme', 'light']]);
    assert.equal(button.getAttribute('aria-label'), 'Usar tema escuro');
    button.click();
    assert.equal(root.getAttribute('data-theme'), 'dark');
    assert.equal(button.getAttribute('aria-label'), 'Usar tema claro');
  });

  test('reloading keeps it: the saved choice wins over the system and the label follows the choice', () => {
    const light = setup({ saved: 'light', dark: true });
    assert.equal(light.button.getAttribute('aria-label'), 'Usar tema escuro');
    const dark = setup({ saved: 'dark', dark: false });
    assert.equal(dark.button.getAttribute('aria-label'), 'Usar tema claro');
    assert.equal(dark.button.getAttribute('title'), 'Usar tema claro');
  });

  test('a saved value that is not light or dark is ignored: the page follows the system', () => {
    const { root, button } = setup({ saved: 'purple', dark: false });
    assert.equal(button.getAttribute('aria-label'), 'Usar tema escuro');
    assert.equal(root.getAttribute('data-theme'), null, 'the bad value is not left on <html>');
  });

  test('without a choice the label follows the system, also when it changes while the page is open', () => {
    const { root, button, system, writes } = setup({ dark: true });
    assert.equal(root.getAttribute('data-theme'), null);
    system(false);
    assert.equal(button.getAttribute('aria-label'), 'Usar tema escuro');
    system(true);
    assert.equal(button.getAttribute('aria-label'), 'Usar tema claro');
    assert.deepEqual(writes, []);
  });

  test('after a choice the system changing does not move the label', () => {
    const { button, system } = setup({ saved: 'dark', dark: true });
    system(false);
    assert.equal(button.getAttribute('aria-label'), 'Usar tema claro');
  });

  test('the icon shows what the click does: the sun on the dark theme, the moon on the light one', () => {
    const { button } = setup({ dark: true });
    const dark = button.querySelector('svg')!.innerHTMLFalso;
    button.click();
    const light = button.querySelector('svg')!.innerHTMLFalso;
    assert.notEqual(dark, light);
    assert.match(dark, /circle/, 'sun');
    assert.match(light, /M12 3a6 6 0 0 0 9 9/, 'moon');
    assert.equal(button.querySelectorAll('svg').length, 1);
  });

  test('localStorage that throws or is missing: the click still switches the page, nothing breaks', () => {
    const root = new ElementoFalso('html');
    const button = new ElementoFalso('button');
    const denied = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };
    createTheme({ button, root, storage: denied, media: { matches: true, addEventListener() {} } });
    assert.equal(button.getAttribute('aria-label'), 'Usar tema claro');
    button.click();
    assert.equal(root.getAttribute('data-theme'), 'light');
    assert.equal(button.getAttribute('aria-label'), 'Usar tema escuro');
    const none = new ElementoFalso('button');
    createTheme({ button: none, root: new ElementoFalso('html'), storage: null, media: { matches: false, addEventListener() {} } });
    none.click();
    assert.equal(none.getAttribute('aria-label'), 'Usar tema claro');
  });

  test('brand.css already answers data-theme: light and dark are pinned, and without it the system decides', () => {
    const css = readFileSync(`${UI_FOLDER}brand.css`, 'utf8');
    assert.match(css, /:root\[data-theme="light"\]/);
    assert.match(css, /:root:not\(\[data-theme="dark"\]\)/);
  });
});
