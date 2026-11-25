// ADR-0028: the blocked sessions are cards under "Precisam de você", the rest is one list; `GET /api/wall` comes in the core's order.
//
// As barras são `<progress>`: a largura sai do `value`, sem estilo inline (a CSP bloqueia).
// As funções sem DOM (formatação e o que cada card mostra) saem exportadas para o teste.

import { header, el, icon } from '../dom.js';
import { loading, error, errorBand, empty } from '../states.js';
import { ATTENTION_PLURAL, ATTENTION_REASONS, attentionOf, isBlocked, isIdle } from '../attention.js';
import { stateOfSession, stateTag } from '../state-icon.js';
import { agentMonogram } from '../agent-monogram.js';
import { openAction } from '../open-action.js';
import { newSessionButton } from '../new-session.js';
import { createMachineFilter, isRemote, itemHref, itemKey, machineMark, sinceText, whereText } from '../machine-filter.js';

const STYLE = '/ui/wall.css';
export const WALL_ROUTE = '/api/wall';
/** Releitura depois de uma rajada de mudanças. */
export const DEBOUNCE_MS = 400;
/** Contexto acima daqui aparece em vermelho no pé do card. */
export const HIGH_CONTEXT = 90;
const AGENT = 'Claude';

/** C85: the "Paradas" band shows this many rows at first; "Mostrar mais" asks for all of them (the core stops at 100). */
export const PARKED_PAGE = 7;
export const PARKED_MAX = 100;


// The same groups as the core's `count` (issue 245): blocked (errors included), idle, active.
export const FILTERS = [
  { id: 'all', rotulo: 'Todas', passa: () => true, vazio: 'Nenhuma sessão aberta' },
  { id: 'blocked', rotulo: 'Precisam de você', count: 'blocked', passa: (c) => isBlocked(c.attention), vazio: 'Ninguém precisa de você agora' },
  { id: 'idle', rotulo: 'Ociosas', count: 'idle', passa: (c) => isIdle(c.attention), vazio: 'Nenhuma sessão ociosa' },
  { id: 'active', rotulo: 'Ativas', passa: (c) => !attentionOf(c.attention) && ['active', 'delegating', 'background'].includes(c.state), vazio: 'Nenhuma sessão ativa' },
];

/** The selector label: "Precisam de você · 5" with the core's count; without it, the label alone. */
export function filterLabel(filter, count) {
  const n = filter.count ? count?.[filter.count] : undefined;
  return Number.isInteger(n) ? `${filter.rotulo} · ${n}` : filter.rotulo;
}


const limit = (n) => Math.min(100, Math.max(0, Math.round(n)));
const clean = (text) => String(text ?? '').trim();

// ADR-0028: the plan is null without steps; the step is done + 1 while one runs, never above the total.
function planOf(c) {
  const total = c.plan?.total;
  if (!(total > 0)) return null;
  const done = Math.min(Math.max(0, c.plan.done ?? 0), total);
  return { done, total, step: Math.min(total, c.plan.current ? done + 1 : done) };
}

const base = (c) => ({
  id: c.id,
  // ADR-0028: two machines can have the same id; a remote card opens its Detail with `?machine=`.
  key: itemKey(c),
  machine: c.machine ?? null,
  href: itemHref(c),
  open: c.open ?? null,
  title: c.title,
  state: stateOfSession({ attention: c.attention, status: c.status }),
});

/** What a card shows, without DOM: the ask, the action, the step and the usage of the conversation. */
export function cardContent(c) {
  const v = base(c);
  const plan = planOf(c);
  const pct = c.context ? limit(c.context.pct) : null;
  const failed = v.state.kind === 'error';
  return {
    ...v,
    ask: clean(c.activity?.text) || v.state.label,
    actionLabel: failed ? 'Abrir para retomar' : 'Responder no Claude',
    plan: plan ? { ...plan, label: `Passo ${plan.step} de ${plan.total}` } : null,
    usage: pct !== null && (failed || pct > HIGH_CONTEXT) ? { pct, label: `Uso da conversa ${pct}%` } : null,
  };
}

// ADR-0028: an idle row says why it waits ("Sua vez · text"); the text alone when it already starts with the reason.
function idlePhrase(c) {
  const a = attentionOf(c.attention);
  const reason = a?.level === 'idle' && a.reason && ATTENTION_REASONS[a.reason]?.level === 'idle' ? ATTENTION_REASONS[a.reason].label : null;
  const text = clean(c.activity?.text);
  if (!reason) return text;
  if (!text) return reason;
  return text.toLowerCase().startsWith(reason.toLowerCase()) ? text : `${reason} · ${text}`;
}

/** What a row shows, without DOM: the phrase, the slice of the state and "X de Y" when there is a plan. */
export function rowContent(c) {
  const v = base(c);
  const plan = planOf(c);
  return {
    ...v,
    phrase: c.status === 'completed' ? 'Terminou sem erro' : idlePhrase(c),
    fraction: plan ? plan.done / plan.total : 0,
    ratio: plan ? `${plan.done} de ${plan.total}` : null,
    idle: isIdle(c.attention),
    since: c.since,
  };
}

// ---------- The nested children and the "Paradas" band (C85 to C87, issue 333) ----------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The line under a leader's card: "4 filhas", "1 precisa de você", "2 ativas", "1 parada", the counts of its
 * whole tree, without the zeros. `null` when the card has no children.
 */
export function treeSummary(tree) {
  if (!tree || !(tree.total > 0)) return null;
  return [
    { text: plural(tree.total, 'filha', 'filhas'), tone: 'total' },
    tree.blocked ? { text: tree.blocked === 1 ? '1 precisa de você' : `${tree.blocked} precisam de você`, tone: 'blocked' } : null,
    tree.active ? { text: plural(tree.active, 'ativa', 'ativas'), tone: 'active' } : null,
    tree.parked ? { text: plural(tree.parked, 'parada', 'paradas'), tone: 'parked' } : null,
  ].filter(Boolean);
}

/** What a nested child shows, without DOM: the title, the pill's input and how long ago its state began. */
export function childContent(node, now = Date.now()) {
  return {
    id: node.id,
    title: node.title,
    status: node.status,
    attention: attentionOf(node.attention),
    since: sinceText(node.since, now),
    parked: Boolean(node.parked),
    children: node.children ?? [],
  };
}

/** The band: "Paradas (23)", and how many rows "Mostrar mais" would add; `null` without any. */
export function parkedContent(parked) {
  const total = parked?.total ?? 0;
  if (!(total > 0)) return null;
  const shown = parked.items?.length ?? 0;
  return { title: `Paradas (${total})`, shown, total, more: Math.max(0, Math.min(total, PARKED_MAX) - shown) };
}

// ---------- Peças ----------

function useStyle() {
  if (document.querySelector(`link[href="${STYLE}"]`)) return;
  document.head.append(el('link', { rel: 'stylesheet', href: STYLE }));
}

function bar({ valor: value, max, rotulo: label, alto: high = false, tipo: type }) {
  return el('progress', { class: `wall-bar${high ? ' wall-high' : ''}`, 'data-bar': type, max: max > 0 ? max : 1, value: max > 0 ? Math.min(value, max) : 0, 'aria-label': label });
}

/** The monogram, the name and since when, with the state on the right (ADR-0028). */
function who(tag, since) {
  return el('div', { class: 'wall-who' }, agentMonogram(AGENT), el('b', { class: 'wall-name' }, AGENT), el('span', { class: 'wall-age' }, sinceText(since)), el('span', { class: 'wall-state' }, tag));
}

const machineOf = (c, known) => (known || isRemote(c) ? el('span', { class: 'wall-mach' }, machineMark(c)) : null);

function titleLine(link, parentTitle) {
  return el('div', { class: 'wall-titleline' }, link, parentTitle ? el('span', { class: 'wall-from', title: `Aberta por ${parentTitle}` }, `filha de ${parentTitle}`) : null);
}

function tree(c, summary, opened, nest) {
  return summary ? [el('div', { class: 'wall-tree' }, treeLine(c, summary, opened, nest)), opened ? el('div', { class: 'wall-kids' }, ...kidRows(c.children ?? [], 0, c, nest)) : null] : [];
}

function card(c, write, nest, known) {
  const v = cardContent(c);
  const summary = treeSummary(c.tree);
  const opened = Boolean(summary) && nest.isOpen(c.id);
  const parentTitle = c.parentId ? nest.titleOf(c.parentId) : null;
  const link = el('a', { class: 'wall-tt wall-link', href: v.href, title: v.title, 'data-session': v.id, 'data-key': v.key }, v.title);
  const action = openAction({ id: v.id, open: v.open, machine: v.machine }, { size: 'small', write, machine: v.machine?.label ?? null, primary: true, label: v.actionLabel });
  const node = el(
    'div',
    { class: `card wall-card${summary ? ' wall-lead' : ''}${opened ? ' wall-span' : ''}`, 'data-session': v.id, 'data-key': v.key },
    who(stateTag({ kind: v.state.kind, label: v.state.label }), c.since),
    el('div', { class: 'wall-head' }, titleLine(link, parentTitle), el('p', { class: 'wall-ask', title: v.ask }, v.ask)),
    action ? el('div', { class: 'wall-act' }, action) : null,
    ...tree(c, summary, opened, nest),
    foot(v, machineOf(c, known)),
  );
  return { node, link };
}

function row(c, write, nest, known) {
  const v = rowContent(c);
  const summary = treeSummary(c.tree);
  const opened = Boolean(summary) && nest.isOpen(c.id);
  const parentTitle = c.parentId ? nest.titleOf(c.parentId) : null;
  const working = v.state.kind === 'working';
  const link = el('a', { class: `wall-link wall-rt${working ? ' wall-rt-work' : ''}`, href: v.href, title: v.title, 'data-session': v.id, 'data-key': v.key }, v.title);
  const action = openAction({ id: v.id, open: v.open, machine: v.machine }, { size: 'icon', write, machine: v.machine?.label ?? null });
  const node = el(
    'div',
    { class: `wall-row${summary ? ' wall-lead' : ''}${opened ? ' wall-span' : ''}`, 'data-session': v.id, 'data-key': v.key },
    el(
      'div',
      { class: 'wall-main' },
      agentMonogram(AGENT),
      el('div', { class: 'wall-text' }, titleLine(link, parentTitle), v.phrase ? el('span', { class: 'wall-phrase', title: v.phrase }, v.phrase) : null),
      el(
        'div',
        { class: 'wall-side' },
        stateTag({ kind: v.state.kind, label: v.state.label, fraction: v.fraction }),
        v.idle ? el('span', { class: 'wall-since' }, sinceText(v.since)) : null,
        v.ratio ? el('span', { class: 'wall-ratio' }, v.ratio) : null,
        machineOf(c, known),
        action ? el('span', { class: 'wall-act' }, action) : null,
      ),
    ),
    ...tree(c, summary, opened, nest),
  );
  return { node, link };
}

/** The toggle under a leader's card (C85): the counts of its whole tree; it opens the children in place (C86). */
function treeLine(c, summary, opened, nest) {
  return el(
    'button',
    { type: 'button', class: 'wall-treeline', 'data-tree': c.id, 'aria-expanded': opened ? 'true' : 'false', onClick: () => nest.toggle(c.id) },
    icon(opened ? 'chevron-down' : 'chevron-right'),
    ...summary.flatMap((part, i) => [i ? el('span', { class: 'wall-muted' }, '·') : null, el('span', { class: `wall-tree-${part.tone}` }, part.text)].filter(Boolean)),
  );
}

/** One row per nested child, one level inside the other; a child with children opens recolhida. */
function kidRows(nodes, depth, leader, nest) {
  return nodes.flatMap((node) => {
    const k = childContent(node);
    const hasKids = k.children.length > 0;
    const opened = hasKids && nest.isOpen(k.id);
    const pill = stateTag(stateOfSession({ attention: k.attention, status: k.status }));
    const row = el(
      'div',
      { class: `wall-kid wall-depth-${Math.min(depth, 6)}${k.parked ? ' wall-kid-parked' : ''}`, 'data-child': k.id },
      hasKids ? el('button', { type: 'button', class: 'wall-kid-toggle', 'data-toggle': k.id, 'aria-expanded': opened ? 'true' : 'false', 'aria-label': opened ? 'Recolher' : 'Abrir as filhas', onClick: () => nest.toggle(k.id) }, icon(opened ? 'chevron-down' : 'chevron-right')) : el('span', { class: 'wall-kid-toggle' }),
      el('a', { class: 'wall-trunc wall-kid-title', href: itemHref({ id: k.id, machine: leader.machine }), title: k.title }, k.title),
      pill,
      k.parked ? el('span', { class: 'wall-muted' }, 'parada') : null,
      el('span', { class: 'wall-muted wall-kid-age' }, k.since),
    );
    return [row, ...(opened ? kidRows(k.children, depth + 1, leader, nest) : [])];
  });
}

/** The "Paradas" band (C85, C86): recolhida with the counter; opened, the most recent rows and "Mostrar mais". */
function parkedBand(parked, opened, { toggle, more }) {
  const p = parkedContent(parked);
  if (!p) return null;
  const head = el(
    'button',
    { type: 'button', class: 'wall-parked-head', 'data-parked': 'toggle', 'aria-expanded': opened ? 'true' : 'false', onClick: toggle },
    icon(opened ? 'chevron-down' : 'chevron-right'),
    el('b', {}, p.title),
    el('span', { class: 'wall-muted wall-trunc' }, 'sem atividade há mais de 180 min e sem pedir nada a você'),
    el('span', { class: 'wall-muted wall-parked-r' }, opened ? `Mostrando ${p.shown} de ${p.total} · as mais recentes` : 'Recolhida'),
  );
  const rows = !opened
    ? []
    : parked.items.map((c) => {
        const href = itemHref(c);
        return el(
          'div',
          { class: 'wall-kid', 'data-parked-row': c.id },
          el('a', { class: 'wall-trunc wall-kid-title', href, title: c.title }, c.title),
          el('span', { class: 'wall-origin wall-trunc' }, [c.project, c.branch].filter(Boolean).join(' · ') || '—'),
          el('span', { class: 'wall-chip' }, clean(c.activity?.text) || (attentionOf(c.attention) ? 'Sua vez' : '—')),
          el('span', { class: 'wall-muted wall-kid-age' }, sinceText(c.since)),
          el('a', { class: 'btn outline', href }, 'Abrir'),
        );
      });
  const moreButton = opened && p.more > 0 ? el('button', { type: 'button', class: 'btn outline', 'data-parked': 'more', onClick: more }, `Mostrar mais ${p.more}`) : null;
  return el('div', { class: 'card wall-parked' }, head, ...(opened ? [el('div', { class: 'wall-parked-list' }, ...rows, moreButton)] : []));
}

function foot(v, machine) {
  const failed = v.state.kind === 'error';
  const step = v.plan && !failed ? v.plan : null;
  const parts = [
    step ? el('span', { class: 'wall-num', 'data-foot': 'step' }, step.label) : null,
    step ? bar({ tipo: 'plan', valor: step.done, max: step.total, rotulo: `Plano: ${step.done} de ${step.total}` }) : null,
    v.usage ? el('span', { class: 'wall-num wall-over', 'data-foot': 'usage' }, v.usage.label) : null,
    v.usage && !step ? bar({ tipo: 'context', valor: v.usage.pct, max: 100, alto: true, rotulo: `Contexto: ${v.usage.pct}%` }) : null,
    machine,
  ].filter(Boolean);
  return parts.length ? el('div', { class: 'wall-foot' }, ...parts) : null;
}

// ---------- A tela ----------

export async function mount(area, ctx) {
  useStyle();
  let filter = 'all';
  let wall = null;
  let failure = null;
  let request = 0;
  let wait = null;
  // C86: what is open (a leader or a child with children) and whether the band is, kept while the page lives.
  const opened = new Set();
  let parkedOpen = false;
  let parkedLimit = PARKED_PAGE;

  // The selector with the core's `count` on "Precisam de você" and "Ociosas" (C2, issue 245).
  const buttons = new Map();
  const selector = el(
    'div',
    { class: 'wall-seg', role: 'group', 'aria-label': 'Filtrar sessões' },
    ...FILTERS.map((f) => {
      const b = el('button', { type: 'button', 'data-filter': f.id, 'aria-pressed': f.id === filter ? 'true' : 'false', onClick: () => choose(f.id) }, f.rotulo);
      buttons.set(f.id, b);
      return b;
    }),
  );
  const refresh = el('button', { type: 'button', class: 'btn outline', 'data-action': 'refresh', onClick: () => read() }, icon('refresh'), 'Atualizar');
  const head = header({ icon: 'wall', title: 'Mural ao vivo', sub: 'Um card por sessão aberta nesta máquina', actions: [selector, refresh, newSessionButton({ read: ctx.read, write: ctx.write })] });
  const sub = head.querySelector?.('.sub') ?? null;
  // Issue 243 (C46): the machine filter on its own row under the header.
  const machines = createMachineFilter(ctx, { onChange: () => ((wall = null), draw(), read()), reread: () => read(), onLayout: () => draw() });

  function choose(id) {
    filter = id;
    for (const [k, b] of buttons) b.setAttribute('aria-pressed', k === id ? 'true' : 'false');
    draw();
  }

  function draw() {
    if (!wall) {
      area.replaceChildren(head, ...machines.parts(), failure ? error({ text: failure.message, retry: () => read() }) : loading({ label: 'Lendo o mural' }));
      return;
    }
    for (const f of FILTERS) buttons.get(f.id).replaceChildren(filterLabel(f, wall.count));
    const f = FILTERS.find((x) => x.id === filter);
    const cards = (wall.cards ?? []).filter(f.passa);
    const band = failure ? errorBand({ title: 'O mural não atualizou.', text: failure.message, action: { label: 'Tentar de novo', onClick: () => read() } }) : null;
    const nest = {
      isOpen: (id) => opened.has(id),
      toggle: (id) => (opened.has(id) ? opened.delete(id) : opened.add(id), draw()),
      titleOf: (id) => (wall.cards ?? []).find((x) => x.id === id)?.title ?? null,
    };
    const known = machines.hasRemotes();
    const needs = cards.filter((c) => isBlocked(c.attention)).map((c) => card(c, ctx.write, nest, known));
    const rest = cards.filter((c) => !isBlocked(c.attention)).map((c) => row(c, ctx.write, nest, known));
    // ADR-0028: the keyboard lands on the link of the card or the row (the title stretched over it).
    const links = [...needs, ...rest].map((b) => b.link);
    const body = cards.length
      ? el(
          'div',
          { class: 'wall-body' },
          needs.length ? el('section', { class: 'wall-need' }, el('h2', { class: 'wall-h' }, ATTENTION_PLURAL.blocked), el('div', { class: 'wall-grid' }, ...needs.map((b) => b.node))) : null,
          rest.length ? el('div', { class: 'wall-list' }, ...rest.map((b) => b.node)) : null,
        )
      : machines.chosenDown()
        ? null
        : empty({ icon: 'wall', title: f.vazio, text: filter === 'all' ? `Abra uma sessão do Claude Code ${machines.hasRemotes() ? whereText(machines.choice, machines.machines(), { form: 'any' }) : 'nesta máquina'} e ela aparece aqui.` : 'Troque o filtro para ver as outras.' });
    // Redesenhar troca os cards: o foco do teclado volta ao card da mesma sessão.
    // Issue 243: by machine + id (`data-key`), since two machines can have the same session id.
    const holder = globalThis.document?.activeElement?.closest?.('[data-session]') ?? null;
    const focused = holder ? (holder.getAttribute('data-key') ?? holder.getAttribute('data-session')) : null;
    // The toggles of the tree and of the band are buttons inside a card: the focus goes back to the one just used.
    const active = globalThis.document?.activeElement ?? null;
    const toggled = active ? ['data-tree', 'data-toggle', 'data-parked'].map((a) => [a, active.getAttribute?.(a)]).find(([, v]) => v) ?? null : null;
    if (sub) sub.textContent = machines.hasRemotes() ? `Um card por sessão aberta, ${whereText(machines.choice, machines.machines())}` : 'Um card por sessão aberta nesta máquina';
    // The band is part of "Todas": the other filters are about the cards.
    const parked = filter === 'all' ? parkedBand(wall.parked, parkedOpen, { toggle: () => ((parkedOpen = !parkedOpen), draw()), more: () => ((parkedLimit = PARKED_MAX), read()) }) : null;
    area.replaceChildren(...[head, ...machines.parts(), band, body, parked].filter(Boolean));
    if (toggled) [...(area.querySelectorAll?.(`[${toggled[0]}]`) ?? [])].find((n) => n.getAttribute(toggled[0]) === toggled[1])?.focus();
    else if (focused) links.find((n) => n.getAttribute('data-key') === focused)?.focus();
  }

  async function read() {
    const mine = ++request;
    try {
      const route = machines.route(WALL_ROUTE);
      const fresh = await ctx.read(parkedLimit === PARKED_PAGE ? route : `${route}${route.includes('?') ? '&' : '?'}parkedLimit=${parkedLimit}`);
      if (mine !== request) return;
      machines.update(fresh);
      wall = fresh;
      failure = null;
    } catch (e) {
      if (e?.name === 'AbortError' || mine !== request) return;
      if (machines.recover(e)) return;
      failure = e instanceof Error ? e : new Error(String(e));
    }
    draw();
  }

  ctx.onRestart(() => read());
  // Junta a rajada, mas com teto: com atividade contínua, relê no máximo a cada ESPERA_MS.
  ctx.onChange(() => {
    wait ??= setTimeout(() => {
      wait = null;
      read();
    }, DEBOUNCE_MS);
  });

  draw();
  await read();
  return () => clearTimeout(wait);
}
