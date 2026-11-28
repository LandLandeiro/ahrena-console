// #754: the band of a remote that needs a word on the Mural says the right state. "Sem conexão" is not the only one: a machine
// the person stopped says "parada por você" and one being updated says "atualizando", even when its raw state says `connected`.
// Precedence is the code's (screens.js): stopped by you > updating > the others. Access blocked, Versão diferente and
// Sem configuração keep the text they have today. The icon follows the state, with icons that already exist.
// Synthetic data only.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { ElementoFalso, documentoFalso, instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();

const page = { pathname: '/ui/wall', search: '', hash: '' };
Object.assign(globalThis, {
  location: page,
  history: { state: null, replaceState: () => {}, pushState: () => {} },
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  getComputedStyle: () => ({ getPropertyValue: () => '', paddingBottom: '0' }),
});

// @ts-expect-error: browser modules, plain JavaScript
const mf = await import('../../ui/machine-filter.js');
// @ts-expect-error: idem
const { icon } = await import('../../ui/dom.js');

// @ts-expect-error: idem
const { setAppMode } = await import('../../ui/mode.js');

const until = async (cond: () => boolean, what = 'the condition', ms = 2000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};

type Obj = Record<string, unknown>;
const AT = new Date('2026-11-28T10:41:00').toISOString();
const local = { id: 'local', label: 'Esta máquina', state: 'connected', reason: null, lastReadAt: null };
const remote = (extra: Obj = {}) => ({ id: 'ws', label: 'Workstation', state: 'connected', reason: null, lastReadAt: AT, ...extra });
const STOPPED = { connection: { state: 'stopped' } };
const UPDATING = { update: { configured: true, state: 'running', kind: 'update', phase: 'swap', startedAt: '2026-11-28T10:00:00.000Z' } };
const ownerAuth = { state: 'unreachable', reason: 'owner-auth-required' };
const notice = (m: Obj, now = Date.parse(AT) + 14 * 60_000) => mf.downNotice(mf.normalizeMachines([local, m])[1], { now });
const svgOf = (n: ElementoFalso) => (n.querySelector('.mf-notice-icon') as ElementoFalso).children[0] as ElementoFalso;
const sameIcon = (n: ElementoFalso, name: string) => svgOf(n).innerHTML === icon(name).innerHTML;

const mode = (value: 'dev' | 'project') => setAppMode(value, { root: new ElementoFalso('html'), storage: { getItem: () => null, setItem: () => {} }, persist: false });
afterEach(() => mode('dev'));

beforeEach(() => {
  mode('dev');
  mf.resetMachineChoice();
  documentoFalso.activeElement = null;
});

describe('#754 the band says the state of the machine', () => {
  test('the text of a machine without connection is the one of today, with the hour and the age', () => {
    const n = notice(remote({ state: 'unreachable', reason: 'port-closed' }));
    assert.match(texto(n), /^Workstation sem conexão desde \d\d:\d\d \(há 14 min\)\. As sessões de lá voltam quando ela responder\. Ver a Workstation$/);
    assert.ok(sameIcon(n, 'wifi-off'));
  });

  test('stopped by you: "<máquina> parada por você." and what happens to the sessions there, with its own icon', () => {
    const n = notice(remote({ state: 'unreachable', reason: 'port-closed', ...STOPPED }));
    assert.equal(texto(n), 'Workstation parada por você. As sessões de lá voltam quando você subir a conexão. Ver a Workstation');
    assert.ok(sameIcon(n, 'pause'));
    assert.ok(!sameIcon(n, 'wifi-off'));
  });

  test('updating: "<máquina> atualizando." and what happens to the sessions there, with its own icon', () => {
    const n = notice(remote(UPDATING));
    assert.equal(texto(n), 'Workstation atualizando. As sessões de lá podem sair da lista até ela terminar. Ver a Workstation');
    assert.ok(sameIcon(n, 'rotate-cw'));
  });

  test('the second sentences follow the voice of the system: no "!" and no dash', () => {
    for (const m of [remote({ ...STOPPED }), remote(UPDATING), remote({ state: 'unreachable' })]) {
      const t = texto(notice(m));
      assert.ok(!/[!—–]/.test(t), t);
    }
  });

  test('the precedence is the code\'s: stopped by you > updating > the others', () => {
    const both = notice(remote({ state: 'unreachable', reason: 'port-closed', ...STOPPED, ...UPDATING }));
    assert.match(texto(both), /^Workstation parada por você\./);
    const updatingAndDown = notice(remote({ state: 'unreachable', reason: 'port-closed', ...UPDATING }));
    assert.match(texto(updatingAndDown), /^Workstation atualizando\./);
    const stoppedWithProof = notice(remote({ ...ownerAuth, ...STOPPED }));
    assert.match(texto(stoppedWithProof), /^Workstation parada por você\./);
  });

  test('Acesso bloqueado, Versão diferente and Sem configuração keep the text and the icon of today', () => {
    for (const m of [remote(ownerAuth), remote({ state: 'incompatible-version' }), remote({ state: 'not-configured' })]) {
      const n = notice(m);
      assert.match(texto(n), /^Workstation sem conexão desde \d\d:\d\d \(há 14 min\)\. As sessões de lá voltam quando ela responder\./);
      assert.ok(sameIcon(n, 'wifi-off'));
    }
  });

  test('the machine of the band is found again by its id, whatever the state', () => {
    for (const m of [remote(STOPPED), remote(UPDATING), remote({ state: 'unreachable' })]) assert.equal(notice(m).getAttribute('data-machine'), 'ws');
  });
});

describe('#754 which machines the band covers', () => {
  const list = (m: Obj) => mf.normalizeMachines([local, m]);

  test('a stopped machine and an updating one are in the band although the raw state says connected', () => {
    assert.equal(list(remote(STOPPED))[1].state, 'connected');
    assert.deepEqual(mf.downFor(list(remote(STOPPED)), 'all').map((m: Obj) => m.id), ['ws']);
    assert.deepEqual(mf.downFor(list(remote(UPDATING)), 'all').map((m: Obj) => m.id), ['ws']);
    assert.deepEqual(mf.downFor(list(remote(UPDATING)), 'ws').map((m: Obj) => m.id), ['ws']);
    assert.deepEqual(mf.downFor(list(remote(UPDATING)), 'local'), []);
    assert.deepEqual(mf.downFor(list(remote()), 'all'), []);
  });

  test('"isDown" does not change: the segmented control and "seus itens não aparecem" say what they said for a connected machine that updates', () => {
    assert.equal(mf.isDown(list(remote(UPDATING))[1]), false);
    assert.equal(mf.isDown(list(remote(STOPPED))[1]), false);
    assert.equal(mf.isDown(list(remote({ state: 'unreachable' }))[1]), true);
    const control = mf.machineControl(list(remote(UPDATING)), 'all', () => {});
    assert.equal(control.querySelectorAll('.mf-off').length, 0);
  });

  test('an updating machine that has no update block, or a bad one, is not in the band', () => {
    assert.deepEqual(mf.downFor(list(remote({ update: { state: 'running' } })), 'all'), []);
    assert.deepEqual(mf.downFor(list(remote({ update: { configured: true, state: 'idle', kind: 'check' } })), 'all'), []);
  });
});

describe('#754 the band on the filter of a screen', () => {
  function rig(machines: unknown[], listAnswer: unknown[]) {
    const leave = new AbortController();
    const routes: string[] = [];
    const ctx = {
      signal: leave.signal,
      read: async (route: string) => {
        routes.push(route);
        if (route.startsWith('/api/machines')) return structuredClone(machines);
        return {};
      },
      onChange: () => {},
    };
    const filter = mf.createMachineFilter(ctx, { periodic: false, watchChanges: false });
    const host = new ElementoFalso('main');
    host.append(filter.row, filter.notices);
    // What the list routes answer: `machines: [{ id, label, state, reason, lastReadAt }]`, without connection or update.
    const raw = listAnswer.map((m) => {
      const { connection: _c, update: _u, ...rest } = m as Obj;
      return rest;
    });
    filter.update({ machines: raw });
    return { filter, routes, leave, raw };
  }
  const band = (f: { notices: ElementoFalso }) => (f.notices.querySelectorAll('.mf-notice') as unknown as ElementoFalso[]).map((n) => texto(n.querySelector('p') as ElementoFalso));

  test('the band of a stopped machine says so even when the list answer says connected', async () => {
    const full = [local, remote(STOPPED)];
    const { filter, leave } = rig(full, full);
    await until(() => band(filter).length === 1, 'the band');
    assert.match(band(filter)[0], /^Workstation parada por você\./);
    leave.abort();
  });

  test('the band of an updating machine says so even when the list answer says connected', async () => {
    const full = [local, remote(UPDATING)];
    const { filter, leave } = rig(full, full);
    await until(() => band(filter).length === 1, 'the band');
    assert.match(band(filter)[0], /^Workstation atualizando\./);
    leave.abort();
  });

  test('a connected machine has no band, and the answer of the list does not erase what the machines read said', async () => {
    const full = [local, remote(STOPPED)];
    const { filter, raw, leave } = rig(full, full);
    await until(() => band(filter).length === 1, 'the band');
    filter.update({ machines: raw });
    assert.match(band(filter)[0], /^Workstation parada por você\./);
    leave.abort();
    const quiet = rig([local, remote()], [local, remote()]);
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(band(quiet.filter), []);
    quiet.leave.abort();
  });

  test('the machines read is the existing route: nothing else is read for it', async () => {
    const full = [local, remote(STOPPED)];
    const { routes, filter, leave } = rig(full, full);
    await until(() => band(filter).length === 1, 'the band');
    assert.deepEqual([...new Set(routes)], ['/api/machines']);
    leave.abort();
  });

  test('the focus on the link of a band stays on the band of the same machine when the state arrives', async () => {
    const full = [local, remote(STOPPED)];
    const { filter, raw, leave } = rig(full, full);
    await until(() => band(filter).length === 1, 'the band');
    const link = filter.notices.querySelector('.mf-notice[data-machine="ws"] .mf-notice-link') as ElementoFalso;
    link.focus();
    filter.update({ machines: raw });
    const now = filter.notices.querySelector('.mf-notice[data-machine="ws"] .mf-notice-link') as ElementoFalso;
    assert.equal(documentoFalso.activeElement, now);
    leave.abort();
  });
});

describe('#754 in Projeto the band covers every remote of the set, whatever the choice of the filter', () => {
  const two = (a: Obj, b: Obj = {}) => mf.normalizeMachines([local, remote(a), { ...remote(b), id: 'lab', label: 'Laboratório' }]);
  const ids = (list: Obj[]) => list.map((m) => m.id);

  test('Dev keeps today: with "Esta máquina" there is no band, with a remote only that remote', () => {
    const list = two({ state: 'unreachable', reason: 'port-closed' }, STOPPED);
    assert.deepEqual(mf.downFor(list, 'local', 'dev'), []);
    assert.deepEqual(ids(mf.downFor(list, 'lab', 'dev')), ['lab']);
    assert.deepEqual(ids(mf.downFor(list, 'ws', 'dev')), ['ws']);
    assert.deepEqual(ids(mf.downFor(list, 'all', 'dev')), ['ws', 'lab']);
    assert.deepEqual(mf.downFor(list, 'local'), [], 'the mode defaults to Dev');
  });

  test('Projeto with the choice "Esta máquina": the band of the one that is down, stopped or updating', () => {
    for (const bad of [{ state: 'unreachable', reason: 'port-closed' }, STOPPED, UPDATING]) assert.deepEqual(ids(mf.downFor(two(bad), 'local', 'project')), ['ws']);
  });

  test('Projeto with another remote chosen: the band of the one that is down is there too', () => {
    const list = two({ state: 'unreachable', reason: 'port-closed' });
    assert.deepEqual(ids(mf.downFor(list, 'lab', 'project')), ['ws']);
    assert.deepEqual(ids(mf.downFor(two({ state: 'unreachable' }, STOPPED), 'lab', 'project')), ['ws', 'lab']);
    assert.deepEqual(mf.downFor(two({}), 'local', 'project'), []);
  });

  test('on the filter of a screen: Projeto with the choice "local" shows the band; Dev does not', async () => {
    const full = [local, remote({ state: 'unreachable', reason: 'port-closed', lastReadAt: AT })];
    mf.rememberChoice('local');
    const run = async (m: 'dev' | 'project') => {
      mode(m);
      const leave = new AbortController();
      const filter = mf.createMachineFilter({ signal: leave.signal, read: async () => structuredClone(full), onChange: () => {} }, { periodic: false, watchChanges: false });
      filter.update({ machines: full });
      await new Promise((r) => setTimeout(r, 30));
      const n = filter.notices.querySelectorAll('.mf-notice').length;
      leave.abort();
      return n;
    };
    assert.equal(await run('dev'), 0);
    assert.equal(await run('project'), 1);
  });
});
