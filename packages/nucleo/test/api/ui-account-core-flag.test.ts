// #754: the arrow of the outdated núcleo leaves the bar item for the account menu, in both modes. Each remote whose núcleo is older
// than the app (any state of the machine) gets a link to its screen in the menu, with the arrow icon and the words; the account button
// and, below 860 px, the ☰ button show a dot, and their names say it (the dot is not only a color). The "N esperam" of the ☰ is untouched.
// The data are the list the bar already reads (`machineItems`): there is no new read. Synthetic data only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';
import { documentoFalso, ElementoFalso, instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();
Object.assign(globalThis, { location: { pathname: '/ui/wall', search: '', hash: '' } });

// @ts-expect-error: browser modules, plain JavaScript
import { createAccountMenu } from '../../ui/account-menu.js';
// @ts-expect-error: idem
import { icon } from '../../ui/dom.js';
// @ts-expect-error: idem
import { createDrawer } from '../../ui/drawer.js';
// @ts-expect-error: idem
import { createNav } from '../../ui/nav.js';
// @ts-expect-error: idem
import { setAppMode } from '../../ui/mode.js';
// @ts-expect-error: idem
import { SCREENS } from '../../ui/screens.js';
// @ts-expect-error: idem
import * as coreFormat from '../../ui/screens/machine-core-format.js';

const read = (file: string) => readFileSync(`${UI_FOLDER}${file}`, 'utf8');
const html = read('index.html');
const app = read('app.js');
const nav = read('nav.js');
const accountSource = read('account-menu.js');

type Obj = Record<string, unknown>;
const coreOld = { version: '0.0.18', commit: 'a1b2c3d', expectedVersion: '0.0.22', status: 'outdated', readAt: '2026-11-28T10:00:00.000Z', mac: { telemetryVersion: 1, credentialCommand: true, checkout: null } };
const machine = (id: string, extra: Obj = {}) => ({ id, label: id.toUpperCase(), state: 'connected', ...extra });
const every = [
  machine('fine'),
  machine('old', { core: coreOld }),
  machine('down', { state: 'unreachable', reason: 'port-closed', core: coreOld }),
  machine('stop', { connection: { state: 'stopped' }, core: coreOld }),
];

function menuRig() {
  const button = new ElementoFalso('button');
  button.setAttribute('aria-label', 'Opções da conta');
  const dot = new ElementoFalso('span');
  dot.setAttribute('class', 'cc-ibtn-dot');
  dot.hidden = true;
  button.append(dot);
  const menu = new ElementoFalso('div');
  menu.setAttribute('id', 'account-menu');
  menu.hidden = true;
  const link = new ElementoFalso('a');
  link.setAttribute('class', 'cc-menu-item');
  link.setAttribute('href', '/ui/connections');
  menu.append(link);
  const account = createAccountMenu({ button, menu, doc: documentoFalso });
  return { button, dot, menu, link, account };
}
const outdatedLinks = (menu: ElementoFalso) => menu.querySelectorAll('a[data-core-outdated]') as unknown as ElementoFalso[];

describe('#754 the shared label', () => {
  test('the bar and the menu use one constant: "Núcleo defasado"', () => {
    assert.equal((coreFormat as Obj).CORE_OUTDATED_LABEL, 'Núcleo defasado');
    assert.match(nav, /CORE_OUTDATED_LABEL/);
    assert.doesNotMatch(nav, /const CORE_OUTDATED_LABEL/);
    assert.match(accountSource, /CORE_OUTDATED_LABEL/);
    assert.doesNotMatch(accountSource, /'Núcleo defasado'/);
  });
});

describe('#754 the account menu', () => {
  test('a link per outdated remote to its screen, with the arrow, the name and the words visible', () => {
    const { menu, account } = menuRig();
    account.setCoreOutdated([{ id: 'machine-old', label: 'Workstation', route: '/ui/machines/old' }]);
    const [a] = outdatedLinks(menu);
    assert.equal(outdatedLinks(menu).length, 1);
    assert.equal(a.getAttribute('href'), '/ui/machines/old');
    assert.ok(a.classList.contains('cc-menu-item'));
    assert.equal(texto(a), 'Workstation Núcleo defasado');
    assert.equal(a.querySelector('svg')!.innerHTML, icon('arrow-up-circle').innerHTML);
    assert.equal(a.querySelector('.cc-sr-only'), null, 'the words are visible, not only read');
  });

  test('the label has at most 4 words and 28 characters besides the name of the machine', () => {
    const { menu, account } = menuRig();
    account.setCoreOutdated([{ id: 'machine-old', label: 'Workstation', route: '/ui/machines/old' }]);
    const words = texto(outdatedLinks(menu)[0].querySelector('.cc-menu-note') as ElementoFalso);
    assert.ok(words.split(/\s+/).length <= 4 && words.length <= 28, words);
  });

  test('the links come before Conexões, and an empty list leaves the menu as it was', () => {
    const { menu, link, account } = menuRig();
    account.setCoreOutdated([{ id: 'machine-a', label: 'A', route: '/ui/machines/a' }, { id: 'machine-b', label: 'B', route: '/ui/machines/b' }]);
    assert.deepEqual(menu.children.map((c) => c.getAttribute('href')), ['/ui/machines/a', '/ui/machines/b', '/ui/connections']);
    account.setCoreOutdated([]);
    assert.deepEqual(menu.children, [link]);
  });

  test('a new list replaces the old one, and what is not a machine route is not drawn', () => {
    const { menu, account } = menuRig();
    account.setCoreOutdated([{ id: 'machine-a', label: 'A', route: '/ui/machines/a' }]);
    account.setCoreOutdated([{ id: 'machine-b', label: 'B', route: '/ui/machines/b' }, { id: 'x', label: 'X', route: 'https://example.com/' }]);
    assert.deepEqual(outdatedLinks(menu).map((a) => a.getAttribute('href')), ['/ui/machines/b']);
  });

  test('the dot of the button shows while there is one outdated núcleo, and the name of the button says it', () => {
    const { button, dot, account } = menuRig();
    assert.equal(dot.hidden, true);
    assert.equal(button.getAttribute('aria-label'), 'Opções da conta');
    account.setCoreOutdated([{ id: 'machine-old', label: 'Workstation', route: '/ui/machines/old' }]);
    assert.equal(dot.hidden, false);
    assert.equal(button.getAttribute('aria-label'), 'Opções da conta, núcleo defasado');
    assert.equal(dot.getAttribute('aria-hidden'), 'true', 'the name is on the button, the dot is not read twice');
    account.setCoreOutdated([]);
    assert.equal(dot.hidden, true);
    assert.equal(button.getAttribute('aria-label'), 'Opções da conta');
  });

  test('the focus on a link of the menu stays on the link of the same machine when the list is drawn again', () => {
    const { menu, account } = menuRig();
    const list = [{ id: 'machine-a', label: 'A', route: '/ui/machines/a' }, { id: 'machine-b', label: 'B', route: '/ui/machines/b' }];
    account.setCoreOutdated(list);
    account.open();
    outdatedLinks(menu)[1].focus();
    account.setCoreOutdated(list);
    assert.equal(documentoFalso.activeElement, outdatedLinks(menu)[1]);
    assert.equal(account.isOpen(), true);
  });

  test('a click on a link closes the menu, as the other one does', () => {
    const { menu, account } = menuRig();
    account.setCoreOutdated([{ id: 'machine-a', label: 'A', route: '/ui/machines/a' }]);
    account.open();
    outdatedLinks(menu)[0].click();
    assert.equal(account.isOpen(), false);
  });
});

describe('#754 the ☰ button', () => {
  function drawerRig() {
    const button = new ElementoFalso('button');
    const count = new ElementoFalso('span');
    count.setAttribute('class', 'cc-nav-tag');
    count.hidden = true;
    const dot = new ElementoFalso('span');
    dot.setAttribute('class', 'cc-ibtn-dot');
    dot.hidden = true;
    button.append(count, dot);
    const side = new ElementoFalso('aside');
    const scrim = new ElementoFalso('div');
    const drawer = createDrawer({ button, side, scrim, background: [], count, media: { matches: true, addEventListener() {} } });
    return { button, count, dot, drawer };
  }

  test('the dot shows with the same words, and goes away with them', () => {
    const { button, dot, drawer } = drawerRig();
    drawer.outdated(true);
    assert.equal(dot.hidden, false);
    assert.equal(button.getAttribute('aria-label'), 'Menu, núcleo defasado');
    drawer.outdated(false);
    assert.equal(dot.hidden, true);
    assert.equal(button.getAttribute('aria-label'), 'Menu');
  });

  test('"N esperam" is not touched: the tag and the name hold both, in either order', () => {
    const { button, count, dot, drawer } = drawerRig();
    drawer.waiting({ text: '3 esperam' });
    drawer.outdated(true);
    assert.equal(count.textContent, '3 esperam');
    assert.equal(count.hidden, false);
    assert.equal(dot.hidden, false);
    assert.equal(button.getAttribute('aria-label'), 'Menu, 3 esperam, núcleo defasado');
    drawer.waiting({ text: '4 esperam' });
    assert.equal(count.textContent, '4 esperam');
    assert.equal(button.getAttribute('aria-label'), 'Menu, 4 esperam, núcleo defasado');
    drawer.waiting(null);
    assert.equal(count.hidden, true);
    assert.equal(button.getAttribute('aria-label'), 'Menu, núcleo defasado');
    drawer.outdated(false);
    drawer.waiting({ text: '2 esperam' });
    assert.equal(button.getAttribute('aria-label'), 'Menu, 2 esperam');
  });
});

describe('#754 the nav gives the list, in both modes, from the list it already reads', () => {
  const mode = (value: 'dev' | 'project') => setAppMode(value, { root: new ElementoFalso('html'), storage: { getItem: () => null, setItem: () => {} }, persist: false });

  async function rig(machines: unknown[], m: 'dev' | 'project') {
    mode(m);
    const heard: unknown[] = [];
    const reads: string[] = [];
    const bar = new ElementoFalso('nav');
    const { readMachines } = createNav({ nav: bar, read: async (route: string) => (reads.push(route), machines), screens: SCREENS, onCoreOutdated: (l: unknown) => heard.push(l) });
    await readMachines();
    mode('dev');
    return { heard, reads };
  }

  for (const m of ['dev', 'project'] as const) {
    test(`${m}: every outdated remote, in any state of the machine, and none of the others`, async () => {
      const { heard, reads } = await rig(every, m);
      assert.deepEqual(heard.at(-1), [
        { id: 'machine-old', label: 'OLD', route: '/ui/machines/old' },
        { id: 'machine-down', label: 'DOWN', route: '/ui/machines/down' },
        { id: 'machine-stop', label: 'STOP', route: '/ui/machines/stop' },
      ]);
      assert.deepEqual(reads, ['/api/machines'], 'no new read of the API');
    });

    test(`${m}: with no outdated núcleo the list is empty`, async () => {
      const { heard } = await rig([machine('fine'), machine('down', { state: 'unreachable' })], m);
      assert.deepEqual(heard.at(-1), []);
    });
  }

  test('the list is given again when it goes, even if the bar did not change', async () => {
    mode('dev');
    let list: unknown[] = [machine('old', { core: coreOld })];
    const heard: unknown[][] = [];
    const { readMachines } = createNav({ nav: new ElementoFalso('nav'), read: async () => list, screens: SCREENS, onCoreOutdated: (l: unknown[]) => heard.push(l) });
    await readMachines();
    list = [machine('old')];
    await readMachines();
    assert.equal(heard.at(-2)!.length, 1);
    assert.equal(heard.at(-1)!.length, 0);
  });
});

describe('#754 the page and the wiring', () => {
  test('index.html has the dot in the account button and in the ☰, hidden, not read, beside the "N esperam"', () => {
    const account = html.match(/<button[^>]*id="account-button"[\s\S]*?<\/button>/)![0];
    const menuButton = html.match(/<button[^>]*id="menu-button"[\s\S]*?<\/button>/)![0];
    for (const b of [account, menuButton]) assert.match(b, /<span class="cc-ibtn-dot" aria-hidden="true" hidden><\/span>/);
    assert.match(menuButton, /cc-nav-tag/);
  });

  test('app.js sends the list from the nav to the menu and the ☰, and creates no read of its own', () => {
    assert.match(app, /onCoreOutdated/);
    assert.match(app, /accountMenu\.setCoreOutdated\(/);
    assert.match(app, /drawer\.outdated\(/);
    assert.equal((app.match(/MACHINES_ROUTE|\/api\/machines/g) ?? []).length, 0);
  });

  test('the CSS of the dot uses tokens only', () => {
    const css = read('shell.css');
    const rule = css.match(/\.cc-ibtn-dot\s*\{[^}]*\}/)?.[0] ?? '';
    assert.ok(rule, 'a rule for .cc-ibtn-dot');
    assert.doesNotMatch(rule, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    assert.match(rule, /var\(--/);
    assert.match(css, /\.cc-menu-outdated|\.cc-menu-note/);
  });
});
