// #750: a redraw of the sidebar keeps the scroll, the lit item and the focus; a new lit item is brought into view once.
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { documentoFalso, ElementoFalso, instalarDomFalso } from './fake-dom.ts';

instalarDomFalso();

// @ts-expect-error: browser modules, plain JavaScript
import { createNav } from '../../ui/nav.js';
// @ts-expect-error: idem
import { SCREENS } from '../../ui/screens.js';

const original = ElementoFalso.prototype.scrollIntoView;
const originalFocus = ElementoFalso.prototype.focus;
afterEach(() => {
  ElementoFalso.prototype.scrollIntoView = original;
  ElementoFalso.prototype.focus = originalFocus;
  delete (ElementoFalso.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
});

// #750: boxes for the layout the fake DOM does not have: the nav is 0..100; an item sits at `tops[id]` and is 30 tall.
function layout(tops: Record<string, number>) {
  (ElementoFalso.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect = function (this: ElementoFalso) {
    const top = this.tagName?.toLowerCase() === 'nav' ? 0 : (tops[this.getAttribute('data-screen') ?? ''] ?? 0);
    const height = this.tagName?.toLowerCase() === 'nav' ? 100 : 30;
    return { top, bottom: top + height, left: 0, right: 0, width: 0, height };
  };
}

function rig() {
  const reveals: string[] = [];
  ElementoFalso.prototype.scrollIntoView = function (this: ElementoFalso) {
    reveals.push(this.getAttribute('data-screen') ?? '?');
  };
  const nav = new ElementoFalso('nav');
  const made = createNav({ nav, read: async () => [], screens: SCREENS });
  return { nav, reveals, ...made };
}

describe('#750: the lit item and the scroll across a redraw', () => {
  test('highlight brings the item into view once; a redraw keeps the scroll and does not bring it back', () => {
    const { nav, reveals, highlight, draw } = rig();
    highlight('sessions');
    assert.deepEqual(reveals, ['sessions']);
    nav.scrollTop = 120;
    draw();
    draw();
    assert.equal(nav.scrollTop, 120);
    assert.deepEqual(reveals, ['sessions'], 'the redraw did not call scrollIntoView');
    assert.equal(nav.querySelector('[data-screen="sessions"]')!.getAttribute('aria-current'), 'page');
    assert.ok(nav.querySelector('[data-screen="sessions"]')!.classList.contains('on'));
  });

  test('a different id brings the new item into view; the same id again does not', () => {
    const { reveals, highlight } = rig();
    highlight('sessions');
    highlight('sessions');
    highlight('wall');
    assert.deepEqual(reveals, ['sessions', 'wall']);
  });

  test('a remote machine lit before its item exists is brought into view once, when the list draws it', async () => {
    const reveals: string[] = [];
    ElementoFalso.prototype.scrollIntoView = function (this: ElementoFalso) {
      reveals.push(this.getAttribute('data-screen') ?? '?');
    };
    const nav = new ElementoFalso('nav');
    const { highlight, readMachines, draw } = createNav({ nav, read: async () => [{ id: 'ws', label: 'Workstation', state: 'connected' }], screens: SCREENS });
    highlight('machine-ws');
    assert.deepEqual(reveals, []);
    await readMachines();
    assert.deepEqual(reveals, ['machine-ws']);
    draw();
    assert.deepEqual(reveals, ['machine-ws']);
  });

  test('an id with no item in the list scrolls nothing, on highlight or on a redraw', () => {
    const { reveals, highlight, draw } = rig();
    highlight('machine-ghost');
    assert.deepEqual(reveals, []);
    draw();
    assert.deepEqual(reveals, []);
  });
});

describe('#750: a redraw keeps who could see the lit item looking at it', () => {
  const remote = [{ id: 'ws', label: 'Workstation', state: 'connected' }];

  test('the lit item was in view and a remote machine is added above it: it is brought into view again', async () => {
    const reveals: string[] = [];
    ElementoFalso.prototype.scrollIntoView = function (this: ElementoFalso) {
      reveals.push(this.getAttribute('data-screen') ?? '?');
    };
    layout({ connections: 60 });
    const nav = new ElementoFalso('nav');
    const { highlight, readMachines } = createNav({ nav, read: async () => remote, screens: SCREENS });
    highlight('connections');
    assert.deepEqual(reveals, ['connections']);
    await readMachines();
    assert.deepEqual(reveals, ['connections', 'connections']);
  });

  test('the lit item was out of view: a redraw does not pull the list back to it', async () => {
    const reveals: string[] = [];
    ElementoFalso.prototype.scrollIntoView = function (this: ElementoFalso) {
      reveals.push(this.getAttribute('data-screen') ?? '?');
    };
    layout({ connections: 400 });
    const nav = new ElementoFalso('nav');
    const { highlight, readMachines, draw } = createNav({ nav, read: async () => remote, screens: SCREENS });
    highlight('connections');
    reveals.length = 0;
    await readMachines();
    draw();
    assert.deepEqual(reveals, []);
  });
});

describe('#750: the focus of an item survives the redraw', () => {
  test('the focus comes back without scrolling the list to the item', () => {
    const { nav, draw } = rig();
    const calls: unknown[] = [];
    ElementoFalso.prototype.focus = function (this: ElementoFalso, ...args: unknown[]) {
      calls.push(args[0]);
      return originalFocus.call(this);
    };
    nav.querySelector('[data-screen="sessions"]')!.focus();
    calls.length = 0;
    nav.scrollTop = 238;
    draw();
    assert.deepEqual(calls, [{ preventScroll: true }]);
    assert.equal(nav.scrollTop, 238);
  });

  test('the item with the same id gets the focus back', () => {
    const { nav, draw } = rig();
    nav.querySelector('[data-screen="sessions"]')!.focus();
    draw();
    const again = nav.querySelector('[data-screen="sessions"]')!;
    assert.equal(documentoFalso.activeElement, again);
  });

  test('a focus outside the list stays where it is, and a gone item takes none', () => {
    const { nav, draw } = rig();
    const outside = new ElementoFalso('button');
    outside.focus();
    draw();
    assert.equal(documentoFalso.activeElement, outside);
    nav.querySelector('[data-screen="sessions"]')!.focus();
    nav.querySelector('[data-screen="sessions"]')!.setAttribute('data-screen', 'gone');
    draw();
    assert.notEqual(documentoFalso.activeElement?.getAttribute?.('data-screen'), 'gone');
  });
});
