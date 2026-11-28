// #762: the one popover of the /ui (ui/popover.js) and the two flows that use it, Nova sessão and Planejar. Written
// against the fake DOM: the placement is tested with mocked rectangles (the fake has no layout) and the focus with
// the fake's `activeElement`. No workbench, visual or axe tool in this project (component map: node:test).
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { ElementoFalso, documentoFalso, instalarDomFalso, texto } from './fake-dom.ts';

instalarDomFalso();
const {
  OPEN_IN_KEY,
  POPOVER_WIDTH,
  anchorPopover,
  destinationLabel,
  openPopover,
  placement,
  popoverContext,
  popoverFooter,
  rememberedChoice,
  segmented,
  // @ts-expect-error: browser module, plain JavaScript
} = await import('../../ui/popover.js');
// @ts-expect-error: browser module, plain JavaScript
const { setStateLabelMode } = await import('../../ui/state-labels.js');
// @ts-expect-error: browser module, plain JavaScript
const { newSessionButton } = await import('../../ui/new-session.js');
// @ts-expect-error: browser module, plain JavaScript
const { planConfirm, missingFolder } = await import('../../ui/screens/work-board-plan.js');
// @ts-expect-error: browser module, plain JavaScript
const { issuePanelLoading } = await import('../../ui/screens/work-board-issue-panel.js');

const el = (tag = 'div') => new ElementoFalso(tag);
const all = (root: ElementoFalso, selector: string) => root.querySelectorAll(selector);
const one = (root: ElementoFalso, selector: string) => {
  const found = root.querySelector(selector);
  assert.ok(found, `no ${selector}`);
  return found;
};
const active = () => documentoFalso.activeElement;
const key = (node: ElementoFalso, name: string, extra: Record<string, unknown> = {}) => node.dispatchEvent({ type: 'keydown', key: name, ...extra });
const settle = () => new Promise((ok) => setTimeout(ok, 0));
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });
const withRect = (node: ElementoFalso, r: ReturnType<typeof rect>) => {
  (node as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => r;
  return node;
};

const storage = new Map<string, string>();
const setViewport = (width: number, height: number) => Object.assign(globalThis, { innerWidth: width, innerHeight: height });

beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) },
  });
  setViewport(1100, 800);
  setStateLabelMode('dev');
  documentoFalso.activeElement = null;
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
  setStateLabelMode('dev');
});

describe('placement: inside the window, flipped when there is no room', () => {
  const viewport = { width: 1100, height: 800 };
  const size = { width: POPOVER_WIDTH, height: 260 };
  const inside = (p: { left: number; top: number }) => p.left >= 16 && p.top >= 16 && p.left + size.width <= viewport.width - 16 && p.top + size.height <= viewport.height - 16;

  test('the width is 344 px', () => assert.equal(POPOVER_WIDTH, 344));

  test('room below: under the trigger, aligned to its left edge', () => {
    const p = placement({ trigger: rect(100, 100, 120, 28), size, viewport });
    assert.equal(p.side, 'bottom');
    assert.equal(p.left, 100);
    assert.ok(inside(p));
  });

  test('a trigger in the last column at 1100 px: the popover is whole on the screen', () => {
    const p = placement({ trigger: rect(900, 300, 160, 28), size, viewport });
    assert.ok(inside(p), JSON.stringify(p));
    assert.equal(p.left, 1060 - POPOVER_WIDTH, 'aligned to the right edge of the trigger');
  });

  test('a trigger at the bottom of the window: the popover flips above', () => {
    const p = placement({ trigger: rect(100, 740, 120, 28), size, viewport });
    assert.equal(p.side, 'top');
    assert.ok(inside(p));
    assert.ok(p.top + size.height <= 740, 'ends above the trigger');
  });

  test('no room above or below: goes to the side of the trigger', () => {
    const p = placement({ trigger: rect(100, 300, 120, 28), size: { width: POPOVER_WIDTH, height: 700 }, viewport: { width: 1100, height: 760 } });
    assert.equal(p.side, 'right');
    assert.ok(p.left >= 220);
  });

  test('below 600 px it is docked to the bottom edge, with no coordinates', () => {
    const p = placement({ trigger: rect(10, 10, 100, 28), size, viewport: { width: 390, height: 800 } });
    assert.equal(p.docked, true);
  });
});

describe('openPopover: focus, Esc, click outside', () => {
  function mount(extra: Record<string, unknown> = {}) {
    const host = el('span');
    const trigger = el('button');
    host.append(trigger);
    const field = el('select');
    const closed: string[] = [];
    const handle = openPopover({
      trigger,
      host,
      label: 'Nova sessão',
      title: 'Nova sessão',
      content: [field],
      footer: popoverFooter({ cancel: { onClick: () => handle.close() }, primary: { label: 'Abrir no Terminal' } }),
      onClose: () => closed.push('closed'),
      ...extra,
    });
    return { host, trigger, field, handle, closed };
  }

  test('opens as a dialog named by its label, with the title and the trigger expanded', () => {
    const { host, trigger, handle } = mount();
    const root = handle.element as ElementoFalso;
    assert.ok(host.contains(root));
    assert.equal(root.getAttribute('role'), 'dialog');
    assert.equal(root.getAttribute('aria-label'), 'Nova sessão');
    assert.ok(root.classList.contains('pop'));
    assert.equal(root.getAttribute('aria-modal'), null, 'not modal');
    assert.equal(texto(one(root, '.pop-title')), 'Nova sessão');
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  });

  test('the focus goes to the first field', () => {
    const { field } = mount();
    assert.equal(active(), field);
  });

  test('Esc closes and gives the focus back to the trigger', () => {
    const { host, trigger, field, handle, closed } = mount();
    key(field, 'Escape');
    assert.equal(active(), trigger);
    assert.ok(!host.contains(handle.element));
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(closed, ['closed']);
  });

  test('a click outside closes and gives the focus back to the trigger', () => {
    const { host, trigger, handle, closed } = mount();
    const outside = el('div');
    documentoFalso.dispatchEvent({ type: 'pointerdown', target: outside } as never);
    assert.equal(active(), trigger);
    assert.ok(!host.contains(handle.element));
    assert.deepEqual(closed, ['closed']);
  });

  test('a click inside stays; a click on the trigger is not "outside" (the trigger toggles it)', () => {
    const { host, trigger, field, handle } = mount();
    documentoFalso.dispatchEvent({ type: 'pointerdown', target: field } as never);
    documentoFalso.dispatchEvent({ type: 'pointerdown', target: trigger } as never);
    assert.ok(host.contains(handle.element));
  });

  test('close is idempotent and stops listening', () => {
    const { handle, closed } = mount();
    handle.close();
    handle.close();
    documentoFalso.dispatchEvent({ type: 'pointerdown', target: el('div') } as never);
    assert.deepEqual(closed, ['closed']);
  });

  test('setContent swaps the body and the footer and focuses the first field', () => {
    const { handle } = mount();
    const next = el('input');
    handle.setContent([next], popoverFooter({ cancel: { label: 'Fechar' }, primary: { label: 'Copiar comando' } }));
    assert.equal(active(), next);
    assert.equal(all(handle.element, 'select').length, 0);
    assert.equal(texto(one(handle.element, '.pop-foot .btn.outline')), 'Fechar');
  });

  test('placed from the rectangles of the trigger and of the popover, on open and on resize', () => {
    const host = el('span');
    const trigger = withRect(el('button'), rect(900, 300, 160, 28));
    host.append(trigger);
    const handle = openPopover({ trigger, host, label: 'x', title: 'x', content: [el('select')] });
    const root = withRect(handle.element, rect(0, 0, 344, 260));
    handle.place();
    const left = Number.parseFloat(root.style.getPropertyValue('--pop-left'));
    assert.ok(left >= 16 && left + 344 <= 1084, `left ${left}`);
    setViewport(390, 800);
    handle.place();
    assert.equal(root.getAttribute('data-docked'), 'true');
  });
});

describe('anchorPopover: a popover drawn by a screen, placed on its trigger', () => {
  test('puts the coordinates in the popover and calls onDismiss on Esc and on a click outside', () => {
    const trigger = withRect(el('button'), rect(900, 300, 160, 28));
    const shell = withRect(el('div'), rect(0, 0, 344, 260));
    const dismissed: string[] = [];
    const stop = anchorPopover(shell, { trigger, onDismiss: (how: string) => dismissed.push(how) });
    const left = Number.parseFloat(shell.style.getPropertyValue('--pop-left'));
    const top = Number.parseFloat(shell.style.getPropertyValue('--pop-top'));
    assert.ok(left >= 16 && left + 344 <= 1084, `left ${left}`);
    assert.ok(top >= 16 && top + 260 <= 784, `top ${top}`);
    key(shell, 'Escape');
    documentoFalso.dispatchEvent({ type: 'click', target: el('div') } as never);
    documentoFalso.dispatchEvent({ type: 'click', target: trigger } as never);
    assert.deepEqual(dismissed, ['escape', 'outside']);
    stop();
    documentoFalso.dispatchEvent({ type: 'click', target: el('div') } as never);
    assert.equal(dismissed.length, 2, 'stopped');
  });

  test('without layout (no rectangles) it degrades without throwing', () => {
    const shell = el('div');
    assert.doesNotThrow(() => anchorPopover(shell, { trigger: el('button'), onDismiss: () => {} })());
  });
});

describe('the structure: context, "Abrir em", footer', () => {
  test('the context is a dl; the folder and the repository are mono only in the Dev mode', () => {
    const rows = [{ label: 'Repositório', value: 'ahrena/console', mono: true, field: 'repo' }, { label: 'Conta', value: 'Ahrena · Team', field: 'account' }];
    setStateLabelMode('dev');
    const dev = popoverContext(rows) as ElementoFalso;
    assert.equal(dev.tagName, 'DL');
    assert.ok(one(dev, '[data-field="repo"]').classList.contains('mono'));
    assert.ok(!one(dev, '[data-field="account"]').classList.contains('mono'));
    setStateLabelMode('project');
    const project = popoverContext(rows) as ElementoFalso;
    assert.equal(all(project, '.mono').length, 0);
    assert.equal(texto(one(project, '[data-field="repo"]')), 'ahrena/console');
  });

  test('the footer has Cancelar outlined and the primary, last, on the right', () => {
    const calls: string[] = [];
    const foot = popoverFooter({ cancel: { onClick: () => calls.push('cancel') }, primary: { label: 'Planejar no Terminal', onClick: () => calls.push('go'), action: 'confirm' } }) as ElementoFalso;
    const buttons = all(foot, 'button');
    assert.deepEqual(buttons.map((b) => texto(b)), ['Cancelar', 'Planejar no Terminal']);
    assert.ok(buttons[0]!.classList.contains('outline'));
    assert.ok(buttons[1]!.classList.contains('primary'));
    assert.ok(!buttons[1]!.classList.contains('filled'), 'no orange inside the popover');
    buttons[0]!.click();
    buttons[1]!.click();
    assert.deepEqual(calls, ['cancel', 'go']);
  });

  test('a busy primary is disabled and says so', () => {
    const foot = popoverFooter({ cancel: {}, primary: { label: 'Abrir', busy: true, onClick: () => assert.fail('busy') } }) as ElementoFalso;
    const primary = one(foot, '.btn.primary');
    assert.equal(primary.getAttribute('aria-busy'), 'true');
    assert.ok(primary.hasAttribute('disabled'));
  });

  test('the primary names a verb and the destination', () => {
    assert.equal(destinationLabel('Abrir', 'terminal'), 'Abrir no Terminal');
    assert.equal(destinationLabel('Planejar', 'desktop'), 'Planejar no Claude Desktop');
    assert.equal(destinationLabel('Replanejar', 'desktop'), 'Replanejar no Claude Desktop');
  });
});

describe('the segmented "Abrir em"', () => {
  const options = [{ value: 'desktop', label: 'Claude Desktop' }, { value: 'terminal', label: 'Terminal' }];

  test('a radio group named "Abrir em": the first is checked, one tab stop, arrows move and call onChange', () => {
    const changes: string[] = [];
    const field = segmented({ label: 'Abrir em', options, onChange: (v: string) => changes.push(v) }) as ElementoFalso;
    const group = one(field, '[role="radiogroup"]');
    const radios = all(group, '[role="radio"]');
    assert.deepEqual(radios.map((r) => r.getAttribute('aria-checked')), ['true', 'false']);
    assert.deepEqual(radios.map((r) => r.getAttribute('tabindex')), ['0', '-1']);
    assert.ok(texto(field).includes('Abrir em'));
    radios[0]!.focus();
    key(group, 'ArrowRight');
    assert.deepEqual(changes, ['terminal']);
    assert.deepEqual(radios.map((r) => r.getAttribute('aria-checked')), ['false', 'true']);
    assert.equal(active(), radios[1]);
    key(group, 'ArrowLeft');
    assert.deepEqual(changes, ['terminal', 'desktop']);
  });

  test('a click chooses; the choice is remembered under an ahrena-console key', () => {
    assert.equal(OPEN_IN_KEY, 'ahrena-console-open-in');
    const field = segmented({ label: 'Abrir em', options, storageKey: OPEN_IN_KEY }) as ElementoFalso;
    one(field, '[data-value="terminal"]').click();
    assert.equal(storage.get(OPEN_IN_KEY), 'terminal');
    const again = segmented({ label: 'Abrir em', options, storageKey: OPEN_IN_KEY }) as ElementoFalso;
    assert.equal(one(again, '[aria-checked="true"]').getAttribute('data-value'), 'terminal');
  });

  test('an unknown remembered value or an unavailable storage falls back, without throwing', () => {
    storage.set(OPEN_IN_KEY, 'carrier-pigeon');
    assert.equal(rememberedChoice(OPEN_IN_KEY, ['desktop', 'terminal'], 'desktop'), 'desktop');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } },
    });
    assert.equal(rememberedChoice(OPEN_IN_KEY, ['desktop', 'terminal'], 'desktop'), 'desktop');
    const field = segmented({ label: 'Abrir em', options, storageKey: OPEN_IN_KEY }) as ElementoFalso;
    assert.doesNotThrow(() => one(field, '[data-value="terminal"]').click());
    assert.equal(one(field, '[aria-checked="true"]').getAttribute('data-value'), 'terminal');
  });
});

describe('Nova sessão and Planejar are the same popover', () => {
  const FOLDERS = { folders: [{ path: '/w/app', name: 'app' }], targets: { desktop: true, terminal: true } };

  /** The skeleton a person sees: the parts in order. */
  const skeleton = (root: ElementoFalso) =>
    ['.pop-title', 'dl.pop-context', '[role="radiogroup"]', '.pop-foot'].map((selector) => (all(root, selector).length === 1 ? selector : `${selector} x${all(root, selector).length}`));

  async function newSessionPopover() {
    const root = newSessionButton({ read: async () => FOLDERS, write: async () => ({ ok: true, opened: 'terminal' }) }) as ElementoFalso;
    one(root, '.ns-button').click();
    await settle();
    return { root, pop: one(root, '.pop') };
  }

  test('the same parts, the same classes, the same footer', async () => {
    const { pop } = await newSessionPopover();
    const plan = planConfirm({ repo: 'a/b', number: 5, target: 'desktop' }) as ElementoFalso;
    assert.deepEqual(skeleton(pop), ['.pop-title', 'dl.pop-context', '[role="radiogroup"]', '.pop-foot']);
    assert.deepEqual(skeleton(plan), skeleton(pop));
    for (const root of [pop, plan]) {
      assert.ok(root.classList.contains('pop'));
      assert.equal(root.getAttribute('role'), 'dialog');
      assert.deepEqual(all(root, '.pop-foot button').map((b) => b.classList.contains('outline') || b.classList.contains('primary')), [true, true]);
      assert.equal(all(root, '.btn.filled').length, 0, 'no orange inside');
      assert.equal(all(root, '.pop-foot button').at(-1)!.classList.contains('primary'), true);
    }
    const missing = missingFolder({ repo: 'a/b' }) as ElementoFalso;
    assert.ok(missing.classList.contains('pop'));
    assert.equal(all(missing, '.pop-foot').length, 1);
  });

  test('both start with the same keyboard: the focus on the first field, Esc out', async () => {
    const { pop } = await newSessionPopover();
    assert.equal(active()!.tagName, 'SELECT', 'Nova sessão: the folder');
    const plan = planConfirm({ repo: 'a/b', number: 5, target: 'desktop' }) as ElementoFalso;
    assert.ok(all(plan, '[role="radio"]').length === 2);
    let cancelled = 0;
    const again = planConfirm({ repo: 'a/b', number: 5, target: 'desktop', onCancel: () => (cancelled += 1) }) as ElementoFalso;
    key(again, 'Escape');
    assert.equal(cancelled, 1);
    assert.ok(pop);
  });

  test('Nova sessão: the primary names the destination and follows the segment', async () => {
    const { pop } = await newSessionPopover();
    assert.equal(texto(one(pop, '.btn.primary')), 'Abrir no Claude Desktop');
    one(pop, '[data-value="terminal"]').click();
    assert.equal(texto(one(pop, '.btn.primary')), 'Abrir no Terminal');
  });

  test('Nova sessão: Esc gives the focus back to the button', async () => {
    const { root } = await newSessionPopover();
    key(one(root, '.pop'), 'Escape');
    assert.equal(active(), one(root, '.ns-button'));
    assert.equal(all(root, '.pop').length, 0);
  });

  test('Nova sessão: the success does not close it by itself, and says where it opened', async () => {
    const { root, pop } = await newSessionPopover();
    one(pop, '[data-value="terminal"]').click();
    one(pop, '.btn.primary').click();
    await settle();
    await new Promise((ok) => setTimeout(ok, 40));
    assert.equal(all(root, '.pop').length, 1, 'still open');
    assert.match(texto(one(pop, '[role="status"]')), /Aberta no Terminal/);
    assert.equal(all(pop, 'a').length, 0, 'the answer carries no session id, so no link');
  });
});

describe('the issue panel is modal', () => {
  const panel = () => issuePanelLoading({ card: { number: 7, column: 'planning', type: 'story' }, onClose: () => {} }) as ElementoFalso;

  test('aria-modal on the dialog', () => {
    const root = panel();
    assert.equal(root.getAttribute('role'), 'dialog');
    assert.equal(root.getAttribute('aria-modal'), 'true');
  });

  test('Tab on the last control goes to the first, Shift+Tab on the first goes to the last', () => {
    const root = panel();
    const buttons = all(root, 'button');
    assert.ok(buttons.length >= 1);
    const first = buttons[0]!;
    const last = buttons.at(-1)!;
    last.focus();
    const forward = { type: 'keydown', key: 'Tab', shiftKey: false } as Record<string, unknown>;
    last.dispatchEvent(forward as never);
    assert.equal(active(), first);
    assert.equal(forward.defaultPrevented, true);
    first.focus();
    first.dispatchEvent({ type: 'keydown', key: 'Tab', shiftKey: true } as never);
    assert.equal(active(), last);
  });
});
