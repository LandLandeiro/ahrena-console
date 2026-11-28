// The one popover of the /ui (#762): "Nova sessão", "Planejar" and, from #754, "Exibir" are drawn by it, so they share the
// structure, the tokens and the keyboard (ux-review 2.1, decision 0028). Plain JavaScript, no build; the styles are in
// `popover.css` (classes `pop-`, loaded once by index.html).
//
// The structure, top to bottom: the title (13 px, semibold), the context (`popoverContext`, a `dl`), the fields
// (`segmented` for "Abrir em", or whatever the flow needs) and the footer (`popoverFooter`: Cancelar outlined, the primary
// on the right with a verb and the destination, "Abrir no Terminal"). The primary is `.btn.primary`, the system's dark
// one; the orange stays out of the popover.
//
// Two ways to use it:
//
// - Imperative, for a button that owns its popover (Nova sessão, Exibir):
//     const handle = openPopover({ trigger, title, label, content: [node, ...], footer, onClose, host, kind });
//     handle.element       the `.pop` node, a dialog (not modal: no focus trap)
//     handle.setContent(content, footer)  swaps the body and the footer and focuses the first field
//     handle.place()       places it again (it already does on resize and on scroll)
//     handle.isOpen()      and handle.close()
//   It focuses the first field when it opens; Esc and a press outside close it and give the focus back to `trigger`,
//   which carries `aria-expanded` while it is open. `host` is the node it is appended to (default: the trigger's parent).
//
// - Declarative, for a screen that redraws (Planejar, Executar plano): `popoverShell({ title, label, content, footer,
//   kind, trigger, onDismiss })` returns the node for the screen to put where it draws it. With a `trigger` (a node, or
//   a function that finds it after the draw) it is placed on it and `onDismiss('escape' | 'outside')` is called; the
//   screen decides what dismissing means and where the focus goes.
//
// The position: `position: fixed`, coordinates from the rectangles of the trigger and of the popover, in the CSS variables
// `--pop-left` and `--pop-top` (see `placement`). Below the popover's side flips to the top, then to the side of the trigger;
// under 600 px it is docked to the bottom edge, full width (`data-docked`). Without layout (the fake DOM of the tests) it
// leaves the CSS fallback in place and does not throw.
//
// The motion: it opens with `opacity` and `scale(.98 -> 1)` over `--motion-fast`, by a CSS animation; it has no exit
// animation (it leaves at once, which is faster than any exit and keeps the DOM simple). Nothing moves with
// `prefers-reduced-motion: reduce`.

import { el, icon } from './dom.js';
import { stateLabelMode } from './state-labels.js';

export const POPOVER_WIDTH = 344;
/** Where the person last chose to open: one key for every popover that has "Abrir em". */
export const OPEN_IN_KEY = 'ahrena-console-open-in';
export const OPEN_TARGETS = Object.freeze([
  { value: 'desktop', label: 'Claude Desktop', icon: 'monitor' },
  { value: 'terminal', label: 'Terminal', icon: 'terminal' },
]);

const MARGIN = 16;
const GAP = 6;
const NARROW = 600;

/** "Abrir no Terminal": the verb and where it goes. */
export function destinationLabel(verb, target) {
  const place = OPEN_TARGETS.find((t) => t.value === target)?.label;
  return place ? `${verb} no ${place}` : verb;
}

/** The remembered choice of `key` when it is one of `allowed`; `fallback` when there is none, it is unknown or the storage is not available. */
export function rememberedChoice(key, allowed, fallback) {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function remember(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // The storage is off or full: the choice lasts until the next opening and no more (#762).
  }
}

/** The target "Abrir em" starts on: the one the person chose last, Claude Desktop the first time. */
export const rememberedTarget = () =>
  rememberedChoice(
    OPEN_IN_KEY,
    OPEN_TARGETS.map((t) => t.value),
    OPEN_TARGETS[0].value,
  );

/**
 * Where the popover goes, in window coordinates. `trigger` and `size` are `{ left, top, right, bottom, width, height }`
 * and `{ width, height }`, `viewport` is `{ width, height }`. Under 600 px of width the answer is `{ docked: true }`.
 * Otherwise `{ left, top, side }`: below the trigger when there is room, else above, else beside it (right, then left),
 * and always inside the window, `margin` from its edges.
 */
export function placement({ trigger, size, viewport, gap = GAP, margin = MARGIN }) {
  if (viewport.width < NARROW) return { docked: true };
  const width = Math.min(size.width, viewport.width - 2 * margin);
  const { height } = size;
  const clamp = (value, low, high) => Math.max(low, Math.min(value, Math.max(low, high)));
  const clampLeft = (left) => clamp(left, margin, viewport.width - margin - width);
  const clampTop = (top) => clamp(top, margin, viewport.height - margin - height);
  const alignedLeft = () => clampLeft(trigger.left + width > viewport.width - margin ? trigger.right - width : trigger.left);
  if (trigger.bottom + gap + height <= viewport.height - margin) return { side: 'bottom', left: alignedLeft(), top: trigger.bottom + gap };
  if (trigger.top - gap - height >= margin) return { side: 'top', left: alignedLeft(), top: trigger.top - gap - height };
  if (viewport.width - margin - trigger.right - gap >= width) return { side: 'right', left: trigger.right + gap, top: clampTop(trigger.top) };
  if (trigger.left - margin - gap >= width) return { side: 'left', left: trigger.left - gap - width, top: clampTop(trigger.top) };
  return { side: 'bottom', left: alignedLeft(), top: clampTop(trigger.bottom + gap) };
}

const resolve = (trigger) => (typeof trigger === 'function' ? trigger() : trigger);
const rectOf = (node) => {
  const r = node?.getBoundingClientRect?.();
  return r && Number.isFinite(r.left) && Number.isFinite(r.top) ? r : null;
};

/** Puts the coordinates of `placement` on `shell`; does nothing where there is no layout (#762). */
function place(shell, trigger) {
  const t = rectOf(resolve(trigger));
  const width = globalThis.innerWidth;
  const height = globalThis.innerHeight;
  if (!t || !(width > 0) || !(height > 0)) return;
  const own = rectOf(shell);
  const p = placement({ trigger: t, size: { width: own?.width || POPOVER_WIDTH, height: own?.height || 0 }, viewport: { width, height } });
  if (p.docked) {
    shell.setAttribute('data-docked', 'true');
    shell.removeAttribute('data-side');
    shell.style.removeProperty('--pop-left');
    shell.style.removeProperty('--pop-top');
    return;
  }
  shell.removeAttribute('data-docked');
  shell.setAttribute('data-side', p.side);
  shell.style.setProperty('--pop-left', `${Math.round(p.left)}px`);
  shell.style.setProperty('--pop-top', `${Math.round(p.top)}px`);
}

/**
 * The listeners of an open popover: Esc inside it, a press outside (`outsideEvent`), and the window's resize and scroll to
 * place it again. They stop by themselves when the node leaves the page. Returns `stop`. (#762)
 */
function watch(shell, { trigger, onDismiss, outsideEvent, escapeOnDocument = false }) {
  const attached = () => shell.isConnected !== false;
  const dismiss = (how) => onDismiss?.(how);
  const onEscape = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation?.();
    dismiss('escape');
  };
  const onOutside = (ev) => {
    if (!attached()) return stop();
    const trig = resolve(trigger);
    if (shell.contains(ev.target) || trig?.contains?.(ev.target)) return;
    dismiss('outside');
  };
  const onMove = () => (attached() ? place(shell, trigger) : stop());
  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    shell.removeEventListener('keydown', onEscape);
    document.removeEventListener?.(outsideEvent, onOutside, true);
    if (escapeOnDocument) document.removeEventListener?.('keydown', onEscape);
    globalThis.removeEventListener?.('resize', onMove);
    document.removeEventListener?.('scroll', onMove, true);
  }
  shell.addEventListener('keydown', onEscape);
  document.addEventListener?.(outsideEvent, onOutside, true);
  // Esc with the focus on the trigger or elsewhere: the popover is not modal, so the focus may be outside it (#762).
  if (escapeOnDocument) document.addEventListener?.('keydown', onEscape);
  globalThis.addEventListener?.('resize', onMove);
  document.addEventListener?.('scroll', onMove, true);
  return stop;
}

let drawn = null;
// Which popover the last call drew (kind and label) and its node, so a redraw of the same one skips the entrance (#762).
let drawnIdentity = null;
let drawnShell = null;

/**
 * Places and watches a popover that a screen drew: `trigger` is a node or a function that finds it, `onDismiss(how)` gets
 * `'escape'` or `'outside'`. It listens for a `click` outside, not a `pointerdown`: the screen answers a dismissal by
 * drawing again, and a redraw between the press and the release would swallow the click on whatever the person aimed at.
 * One drawn popover at a time: the next call stops the previous one. Returns `stop`.
 */
export function anchorPopover(shell, { trigger, onDismiss = null }) {
  drawn?.();
  // The screen redraws its whole area on each change, so the same popover comes back as a new node: it is settled, and
  // `pop-in` must not play again. It is a redraw only while the previous node is still on the page: the screen builds
  // the new nodes before it replaces the old ones, whereas a footer button or a dismissal takes the node away first,
  // and the next opening plays the entrance (#762).
  const identity = `${shell.getAttribute('data-kind')}|${shell.getAttribute('aria-label')}`;
  if (identity === drawnIdentity && drawnShell?.isConnected) shell.setAttribute('data-settled', 'true');
  drawnIdentity = identity;
  drawnShell = shell;
  const forgetAndDismiss = (how) => {
    drawnIdentity = null;
    onDismiss?.(how);
  };
  const stop = watch(shell, { trigger, onDismiss: forgetAndDismiss, outsideEvent: 'click' });
  drawn = stop;
  place(shell, trigger);
  // The screen puts the node on the page after this returns: place it again once it is there, before the first paint (#762).
  queueMicrotask?.(() => shell.isConnected !== false && place(shell, trigger));
  return stop;
}

/** The popover as a node: the title, the body, the footer. See the header for `trigger` and `onDismiss`. */
export function popoverShell({ title, label = title, content = [], footer = null, kind = null, trigger = null, onDismiss = null }) {
  const shell = el(
    'div',
    { class: 'pop', role: 'dialog', 'aria-label': label, 'data-kind': kind, tabindex: '-1' },
    el('h3', { class: 'pop-title' }, title),
    el('div', { class: 'pop-body' }, ...content),
    footer,
  );
  if (trigger) {
    anchorPopover(shell, { trigger, onDismiss });
  } else {
    shell.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation?.();
      onDismiss?.('escape');
    });
  }
  return shell;
}

/** The first thing to type in or press: the field the flow marks, a text field, the chosen radio, the first button. */
export function firstField(root) {
  const enabled = (n) => !n.hasAttribute('disabled') && n.getAttribute('aria-disabled') !== 'true';
  return (
    root.querySelector('[data-autofocus]') ??
    Array.from(root.querySelectorAll('select, input, textarea')).find(enabled) ??
    root.querySelector('[role="radio"][aria-checked="true"]') ??
    Array.from(root.querySelectorAll('button')).find(enabled) ??
    null
  );
}

/** A popover opened by `trigger`; see the header. */
export function openPopover({ trigger, title, label = title, content = [], footer = null, onClose = null, host = null, kind = null }) {
  const shell = popoverShell({ title, label, content, footer, kind });
  (host ?? trigger.parentNode ?? document.body).append(shell);
  trigger.setAttribute('aria-expanded', 'true');
  let open = true;
  const stop = watch(shell, { trigger, onDismiss: () => close(), outsideEvent: 'pointerdown', escapeOnDocument: true });
  const focusIn = () => (firstField(shell) ?? shell).focus?.();

  function close() {
    if (!open) return;
    open = false;
    stop();
    shell.remove();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus?.();
    onClose?.();
  }

  function setContent(next = [], nextFooter = null) {
    shell.querySelector('.pop-body')?.replaceChildren(...next);
    shell.querySelector('.pop-foot')?.remove();
    if (nextFooter) shell.append(nextFooter);
    place(shell, trigger);
    focusIn();
  }

  place(shell, trigger);
  focusIn();
  return { element: shell, close, setContent, place: () => place(shell, trigger), isOpen: () => open };
}

/**
 * The context of the popover as a `dl`: `rows` are `{ label, value, mono, field }`. `value` is text or a node. A row
 * marked `mono` (a folder, a repository) is set in the monospace only in the Dev mode; `{ mono }` forces the mode.
 */
export function popoverContext(rows, { mono = stateLabelMode() === 'dev' } = {}) {
  return el(
    'dl',
    { class: 'pop-context' },
    ...rows
      .filter(Boolean)
      .flatMap((r) => [el('dt', {}, r.label), el('dd', { class: r.mono && mono ? 'mono pop-trunc' : 'pop-trunc', 'data-field': r.field }, r.value)]),
  );
}

let segments = 0;

/**
 * "Abrir em" as a segmented control: a radio group of `options` (`{ value, label, icon }`), one tab stop, the arrows move
 * and choose. `value` is the chosen one; without it the control starts on the remembered choice of `storageKey`, else on
 * the first option. Choosing calls `onChange(value)` and, with a `storageKey`, remembers it (a storage that is off is
 * tolerated). Returns the field: a label and the group, `data-field` set to `field`.
 */
export function segmented({ label, options, value = null, onChange = null, storageKey = null, field = 'target' }) {
  const allowed = options.map((o) => o.value);
  let current = allowed.includes(value) ? value : storageKey ? rememberedChoice(storageKey, allowed, allowed[0]) : allowed[0];
  const id = `pop-seg-${(segments += 1)}`;
  const radios = options.map((o) =>
    el('button', { type: 'button', class: 'pop-radio', role: 'radio', 'data-value': o.value, onClick: () => choose(o.value) }, o.icon ? icon(o.icon) : null, o.label),
  );
  const group = el('div', { class: 'pop-seg', role: 'radiogroup', 'aria-labelledby': id }, ...radios);

  function paint() {
    radios.forEach((r, i) => {
      const on = options[i].value === current;
      r.setAttribute('aria-checked', String(on));
      r.setAttribute('tabindex', on ? '0' : '-1');
    });
  }

  function choose(next, { focus = false } = {}) {
    if (next === current) return void (focus && radios[allowed.indexOf(next)].focus?.());
    current = next;
    paint();
    // The focus first: `onChange` may draw the screen again, and a node that left the page cannot take it (#762).
    if (focus) radios[allowed.indexOf(next)].focus?.();
    if (storageKey) remember(storageKey, next);
    onChange?.(next);
  }

  group.addEventListener('keydown', (ev) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    if (!step) return;
    ev.preventDefault?.();
    const at = allowed.indexOf(current);
    choose(allowed[(at + step + allowed.length) % allowed.length], { focus: true });
  });
  paint();
  return el('div', { class: 'pop-field', 'data-field': field }, el('span', { class: 'pop-label', id }, label), group);
}

/**
 * The footer: `cancel` (`{ label = 'Cancelar', onClick, action = 'cancel' }`, outlined) and the `primary` on the right
 * (`{ label, icon, onClick, action = 'confirm', busy, disabled }`, the dark one). A busy primary is disabled and says so.
 */
export function popoverFooter({ cancel = null, primary = null }) {
  const button = (kind, { label, icon: name = null, onClick = null, action, busy = false, disabled = false }) =>
    el(
      'button',
      { type: 'button', class: `btn ${kind}`, 'data-action': action, disabled: busy || disabled, 'aria-busy': busy ? 'true' : null, onClick: (ev) => !busy && onClick?.(ev) },
      name ? icon(name) : null,
      label,
    );
  return el(
    'div',
    { class: 'pop-foot' },
    cancel ? button('outline', { label: 'Cancelar', action: 'cancel', ...cancel }) : null,
    primary ? button('primary', { action: 'confirm', ...primary }) : null,
  );
}

const TABBABLE = 'a[href], button, input, select, textarea, [tabindex]';

/**
 * The panels with the board dimmed behind them (the issue panel and its edit mode) are modal: `aria-modal` on the dialog
 * and a Tab that wraps from the last control to the first and back, so the focus does not leave for the board behind.
 * Esc and the way out are the panel's own. A `dialog` element with `showModal()` would do the same in a browser; the
 * fake DOM of the tests has none, and the panel is redrawn from the screen's state, which a top-layer dialog does not
 * survive without a second code path. Returns `root`.
 */
export function trapFocus(root) {
  root.setAttribute('aria-modal', 'true');
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab') return;
    const items = Array.from(root.querySelectorAll(TABBABLE)).filter((n) => !n.hasAttribute('disabled') && n.getAttribute('tabindex') !== '-1' && !n.closest?.('[hidden]'));
    if (!items.length) return void ev.preventDefault?.();
    const at = globalThis.document?.activeElement;
    const [first, last] = [items[0], items[items.length - 1]];
    if (ev.shiftKey && (at === first || at === root)) {
      ev.preventDefault?.();
      last.focus?.();
    } else if (!ev.shiftKey && at === last) {
      ev.preventDefault?.();
      first.focus?.();
    }
  });
  return root;
}
