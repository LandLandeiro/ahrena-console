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
afterEach(() => {
  ElementoFalso.prototype.scrollIntoView = original;
});

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

describe('#750: the focus of an item survives the redraw', () => {
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
