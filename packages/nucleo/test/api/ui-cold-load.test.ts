/* #765 (M4): on a cold load no route is asked twice. The screen's own reads come first, and a shell read of a route
   the screen has just answered takes that answer. The one exception that stays is the first call of /api/changes
   (the handshake of the long polling), which belongs to live.js and not to a shell read. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { UI_FOLDER } from '../../src/api/ui.ts';

// @ts-expect-error: browser module, plain JavaScript
import { shareReads } from '../../ui/shell-load.js';

const app = readFileSync(join(UI_FOLDER, 'app.js'), 'utf8');

function rig(clock = { at: 0 }) {
  const asked: string[] = [];
  const read = async (route: string) => (asked.push(route), { route });
  const shared = shareReads(read, { now: () => clock.at });
  return { asked, shared, clock };
}

describe('A shell read takes the answer the screen has just read (#765, M4)', () => {
  test('the Dashboard reads /api/attention, then the sidebar count asks for it: one request', async () => {
    const { asked, shared } = rig();
    const screen = Promise.resolve({ blocked: 2 });
    shared.adopt('/api/attention', screen);
    await screen;
    assert.deepEqual(await shared('/api/attention'), { blocked: 2 });
    assert.deepEqual(asked, []);
  });

  test('the answer is used once: the next shell read asks again, so a later change is never answered with an old read', async () => {
    const { asked, shared } = rig();
    shared.adopt('/api/attention', Promise.resolve({ blocked: 2 }));
    await Promise.resolve();
    await shared('/api/attention');
    await shared('/api/attention');
    assert.deepEqual(asked, ['/api/attention']);
  });

  test('a route the screen did not read is asked as before', async () => {
    const { asked, shared } = rig();
    shared.adopt('/api/attention', Promise.resolve({ blocked: 0 }));
    await Promise.resolve();
    await shared('/api/work?level=item');
    assert.deepEqual(asked, ['/api/work?level=item']);
  });

  test('a read that failed (an abort on leaving the screen) is not adopted', async () => {
    const { asked, shared } = rig();
    shared.adopt('/api/attention', Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    await new Promise((r) => setTimeout(r, 0));
    await shared('/api/attention');
    assert.deepEqual(asked, ['/api/attention']);
  });

  test('an answer older than 3 s is not used', async () => {
    const { asked, shared, clock } = rig();
    shared.adopt('/api/attention', Promise.resolve({ blocked: 1 }));
    await Promise.resolve();
    clock.at = 3001;
    await shared('/api/attention');
    assert.deepEqual(asked, ['/api/attention']);
  });

  test('a cold load of the Dashboard: the screen and the shell together ask each route once', async () => {
    const { asked, shared } = rig();
    const screen = (route: string) => {
      const promise = Promise.resolve({ route });
      shared.adopt(route, promise);
      return promise;
    };
    await Promise.all([screen('/api/dashboard?machine=all'), screen('/api/attention')]);
    // #765: the shell, once the screen has settled: the version, the machines, the connectors, GitHub, the update notice, the counts
    await Promise.all(['/api/overview', '/api/machines', '/api/connectors', '/api/connections', '/api/app-update', '/api/attention', '/api/work?level=item'].map((r) => shared(r)));
    assert.equal(new Set(asked).size, asked.length, `a route was asked twice: ${asked.join(', ')}`);
    assert.ok(!asked.includes('/api/attention'));
  });
});

describe('The shell hands the screen reads to the shared layer, on a cold load only (#765)', () => {
  test('ctx.read adopts what it reads while the shell has not booted', () => {
    assert.match(app, /shellRead\.adopt\(route, /);
    assert.match(app, /coldLoad/);
  });
  test('the cold load ends when the first screen has settled and the shell starts to read', () => {
    assert.match(app, /gate\.ready\.then\(\(\) => \{[^}]*coldLoad = false/s);
  });
  test('the shell reads still wait for the first screen', () => {
    assert.match(app, /const shell = createShellLoad\(\{\s*gate,/);
  });
});
