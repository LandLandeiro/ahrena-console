// ADR-0028: four sections (Precisam de você as cards; Ativas, Ociosas and Concluídas as rows), a sentence and a state filter; `GET /api/wall` comes in the core's order.
//
// As barras são `<progress>`: a largura sai do `value`, sem estilo inline (a CSP bloqueia).
// As funções sem DOM (formatação e o que cada card mostra) saem exportadas para o teste.

import { el, icon } from '../dom.js';
import { loading, error, errorBand, empty } from '../states.js';
import { ATTENTION_PLURAL, ATTENTION_REASONS, attentionOf, isIdle } from '../attention.js';
import { stateOfSession, stateTag } from '../state-icon.js';
import { agentMonogram } from '../agent-monogram.js';
import { openAction } from '../open-action.js';
import { newSessionButton } from '../new-session.js';
import { clockOf, countsOf, duoCells, sectionOf, sectionsOf, summaryOf, summaryText } from '../wall-sections.js';
import { createMachineFilter, isRemote, itemHref, itemKey, machineMark, sinceText, whereText } from '../machine-filter.js';

const STYLE = '/ui/wall.css';
export const WALL_ROUTE = '/api/wall';
/** Wait before re-reading after a burst of changes that need no attention. */
export const THROTTLE_MS = 120;
// ADR-0028: the usage is red from this percentage on (`>=`); the kit says "above 90%", the person asked for "from 90%".
export const HIGH_CONTEXT = 90;
// ADR-0028, issue 751: the agent is data, from the contract's `identity.provider`; no identity is the legacy Claude.
const AGENTS = { codex: 'Codex' };
const SEE_SESSION = 'Ver sessão';

/** The agent's name on screen: 'Codex' for a codex session, 'Claude' for the rest (ADR-0028, issue 751). */
export const agentOf = (c) => AGENTS[c?.identity?.provider] ?? 'Claude';

/** C85: the "Paradas" band shows this many rows at first; "Mostrar mais" asks for all of them (the core stops at 100). */
export const PARKED_PAGE = 7;
export const PARKED_MAX = 100;

// ADR-0028: the filter is the section of the card; "Concluídas" has no filter of its own and shows under "Todas".
export const FILTERS = [
  { id: 'all', rotulo: 'Todas', passa: () => true, vazio: 'Nenhuma sessão aberta' },
  { id: 'blocked', rotulo: 'Precisam de você', passa: (c) => sectionOf(c) === 'blocked', vazio: 'Ninguém precisa de você agora' },
  { id: 'active', rotulo: 'Ativas', passa: (c) => sectionOf(c) === 'active', vazio: 'Nenhuma sessão ativa' },
  { id: 'idle', rotulo: 'Ociosas', passa: (c) => sectionOf(c) === 'idle', vazio: 'Nenhuma sessão ociosa' },
];

const limit = (n) => Math.min(100, Math.max(0, Math.round(n)));
const clean = (text) => String(text ?? '').trim();
// ADR-0028: a session without a title (null, empty or blanks) reads "Sem título", as the Histórico does; the data stays as it came.
const titled = (title) => (clean(title) ? title : 'Sem título');

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
  agent: agentOf(c),
  title: titled(c.title),
  state: stateOfSession({ attention: c.attention, status: c.status }),
});

/** What a card shows, without DOM: the ask, the action, the step and the usage of the conversation. */
export function cardContent(c) {
  const v = base(c);
  const plan = planOf(c);
  const pct = Number.isFinite(c.context?.pct) ? limit(c.context.pct) : null;
  const failed = v.state.kind === 'error';
  return {
    ...v,
    ask: clean(c.activity?.text) || v.state.label,
    actionLabel: failed ? 'Abrir para retomar' : 'Responder no Claude',
    plan: plan ? { ...plan, label: `Passo ${plan.step} de ${plan.total}` } : null,
    usage: pct !== null && (failed || pct >= HIGH_CONTEXT) ? { pct, label: `Uso da conversa ${pct}%`, high: pct >= HIGH_CONTEXT } : null,
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

/** What a row shows, without DOM: the phrase, the slice of the state, "passo X de Y" when there is a plan and the time of a completed one. */
export function rowContent(c) {
  const v = base(c);
  const plan = planOf(c);
  const idle = isIdle(c.attention);
  return {
    ...v,
    phrase: c.status === 'completed' ? 'Terminou sem erro' : idlePhrase(c),
    fraction: plan ? plan.step / plan.total : 0,
    // ADR-0028: an idle row is the icon, the written label and the time; the "passo X de Y" is for the others.
    ratio: plan && !idle && c.status !== 'completed' ? `passo ${plan.step} de ${plan.total}` : null,
    // ADR-0028: a completed row shows the time of its last activity (`since`), not the plan.
    time: c.status === 'completed' ? clockOf(c.since) || null : null,
    idle,
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
    title: titled(node.title),
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

/** The monogram (only where agents differ on screen, issue 751), the name and since when, with the state on the right (ADR-0028). */
function who(tag, since, agent, mono) {
  return el('div', { class: 'wall-who' }, mono ? agentMonogram(agent) : null, el('b', { class: 'wall-name' }, agent), el('span', { class: 'wall-age' }, sinceText(since)), el('span', { class: 'wall-state' }, tag));
}

const machineOf = (c, known) => (known || isRemote(c) ? el('span', { class: 'wall-mach' }, machineMark(c)) : null);

// ADR-0028: what the keyboard can be on, by session key: the link and the open button; a redraw puts the focus back by it.
function spotsOf(nest, key, link, action, see = null) {
  nest.spot('link', key, link);
  if (action) nest.spot('open', key, action.children[0]);
  // ADR-0028, issue 751: "Ver sessão" is its own spot, so a redraw puts the focus back on it by the session key.
  if (see) nest.spot('see', key, see);
}

// ADR-0028: the tag sits above the stretched link so its `title` shows; a click on it goes to the link, modifiers and all.
function tagOver(tag, link) {
  tag.setAttribute('class', `${tag.getAttribute('class')} wall-tag`);
  tag.addEventListener('click', (ev) => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: ev.button, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, shiftKey: ev.shiftKey, altKey: ev.altKey })));
  return tag;
}

function titleLine(link, parentTitle) {
  return el('div', { class: 'wall-titleline' }, link, parentTitle ? el('span', { class: 'wall-from', title: `Aberta por ${parentTitle}` }, `filha de ${parentTitle}`) : null);
}

function tree(c, summary, opened, nest) {
  return summary ? [el('div', { class: 'wall-tree' }, treeLine(c, summary, opened, nest)), opened ? el('div', { class: 'wall-kids', role: 'list', 'aria-label': `Filhas de ${c.title}` }, ...kidRows(c.children ?? [], 0, c, nest)) : null] : [];
}

function card(c, write, nest, known, mono) {
  const v = cardContent(c);
  const summary = treeSummary(c.tree);
  const opened = Boolean(summary) && nest.isOpen(c.id);
  const parentTitle = c.parentId ? nest.titleOf(c.parentId) : null;
  const link = el('a', { class: 'wall-tt wall-link', href: v.href, title: v.title, 'data-session': v.id, 'data-key': v.key }, v.title);
  const action = openAction({ id: v.id, open: v.open, machine: v.machine }, { size: 'small', write, machine: v.machine?.label ?? null, primary: true, label: v.actionLabel, reveal: true, className: opened ? 'open-beside' : null });
  // ADR-0028, issue 751: a card that cannot open still goes somewhere: "Ver sessão" is a link to the Detail, drawn as the primary button.
  const see = action ? null : el('a', { class: 'btn primary md wall-see', href: v.href, 'data-see': v.key }, SEE_SESSION);
  spotsOf(nest, v.key, link, action, see);
  const node = el(
    'div',
    { class: `card wall-card${summary ? ' wall-lead' : ''}${opened ? ' wall-span' : ''}`, role: 'listitem', 'data-session': v.id, 'data-key': v.key },
    who(tagOver(stateTag({ kind: v.state.kind, label: v.state.label }), link), c.since, v.agent, mono),
    el('div', { class: 'wall-head' }, titleLine(link, parentTitle), el('p', { class: 'wall-ask', title: v.ask }, v.ask)),
    action || see ? el('div', { class: 'wall-act' }, action ?? see) : null,
    ...tree(c, summary, opened, nest),
    foot(v, machineOf(c, known)),
  );
  return { node, link };
}

function row(c, write, nest, known, mono, place = '') {
  const v = rowContent(c);
  const summary = treeSummary(c.tree);
  const opened = Boolean(summary) && nest.isOpen(c.id);
  const parentTitle = c.parentId ? nest.titleOf(c.parentId) : null;
  const working = v.state.kind === 'working';
  const link = el('a', { class: `wall-link wall-rt${working ? ' wall-rt-work' : ''}`, href: v.href, title: v.title, 'data-session': v.id, 'data-key': v.key }, v.title);
  const action = openAction({ id: v.id, open: v.open, machine: v.machine }, { size: 'icon', write, machine: v.machine?.label ?? null, reveal: true });
  spotsOf(nest, v.key, link, action);
  const node = el(
    'div',
    { class: `wall-row${summary ? ' wall-lead' : ''}${opened ? ' wall-span' : ''}${place}`, role: 'listitem', 'data-session': v.id, 'data-key': v.key },
    el(
      'div',
      { class: `wall-main${mono ? '' : ' wall-main-solo'}` },
      mono ? agentMonogram(v.agent) : null,
      el('div', { class: 'wall-text' }, titleLine(link, parentTitle), v.phrase ? el('span', { class: `wall-phrase${working ? ' wall-phrase-work' : ''}`, title: v.phrase }, v.phrase) : null),
      el(
        'div',
        { class: 'wall-side' },
        tagOver(stateTag({ kind: v.state.kind, label: v.state.label, fraction: v.fraction }), link),
        v.idle ? el('span', { class: 'wall-since' }, sinceText(v.since)) : null,
        v.time ? el('span', { class: 'wall-since', title: 'Última atividade' }, v.time) : null,
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
    const kidLink = el('a', { class: 'wall-trunc wall-kid-title', href: itemHref({ id: k.id, machine: leader.machine }), title: k.title }, k.title);
    nest.spot('child', itemKey({ id: k.id, machine: leader.machine }), kidLink);
    const row = el(
      'div',
      { class: `wall-kid wall-depth-${Math.min(depth, 6)}${k.parked ? ' wall-kid-parked' : ''}`, role: 'listitem', 'data-child': k.id },
      hasKids ? el('button', { type: 'button', class: 'wall-kid-toggle', 'data-toggle': k.id, 'aria-expanded': opened ? 'true' : 'false', 'aria-label': opened ? 'Recolher' : 'Abrir as filhas', onClick: () => nest.toggle(k.id) }, icon(opened ? 'chevron-down' : 'chevron-right')) : el('span', { class: 'wall-kid-toggle' }),
      kidLink,
      pill,
      k.parked ? el('span', { class: 'wall-muted' }, 'parada') : null,
      el('span', { class: 'wall-muted wall-kid-age' }, k.since),
    );
    return [row, ...(opened ? kidRows(k.children, depth + 1, leader, nest) : [])];
  });
}

/** ADR-0028: nothing needs the person; what the empty "Precisam de você" says instead of an empty list. Not a live region: the sentence of the header says it. */
function calmBlock() {
  return el(
    'div',
    { class: 'wall-calm' },
    el('span', { class: 'wall-calm-tile', 'aria-hidden': 'true' }, icon('done')),
    el('span', { class: 'wall-calm-text' }, el('b', {}, 'Nada precisa de você agora'), el('span', {}, 'Quando um agente pedir uma decisão ou uma permissão, ela aparece aqui primeiro.')),
  );
}

/** The "Paradas" band (C85, C86): recolhida with the counter; opened, the most recent rows and "Mostrar mais". */
function parkedBand(parked, opened, { toggle, more, spot }) {
  const p = parkedContent(parked);
  if (!p) return null;
  const head = el(
    'button',
    { type: 'button', class: 'wall-parked-head', 'data-parked': 'toggle', 'aria-expanded': opened ? 'true' : 'false', onClick: toggle },
    icon(opened ? 'chevron-down' : 'chevron-right'),
    el('b', { id: 'wall-h-parked' }, p.title),
    el('span', { class: 'wall-muted wall-trunc' }, 'sem atividade há mais de 180 min e sem pedir nada a você'),
    el('span', { class: 'wall-muted wall-parked-r' }, opened ? `Mostrando ${p.shown} de ${p.total} · as mais recentes` : 'Recolhida'),
  );
  const titleId = 'wall-h-parked';
  const rows = !opened
    ? []
    : parked.items.map((c) => {
        const href = itemHref(c);
        const link = el('a', { class: 'wall-trunc wall-kid-title', href, title: titled(c.title) }, titled(c.title));
        const key = itemKey(c);
        const openLink = el('a', { class: 'btn outline', href }, 'Abrir');
        spot('parked', key, link);
        spot('parked-open', key, openLink);
        return el(
          'div',
          { class: 'wall-kid', role: 'listitem', 'data-parked-row': c.id },
          link,
          el('span', { class: 'wall-origin wall-trunc' }, [c.project, c.branch].filter(Boolean).join(' · ') || '—'),
          el('span', { class: 'wall-chip' }, clean(c.activity?.text) || (attentionOf(c.attention) ? 'Sua vez' : '—')),
          el('span', { class: 'wall-muted wall-kid-age' }, sinceText(c.since)),
          openLink,
        );
      });
  const moreButton = opened && p.more > 0 ? el('button', { type: 'button', class: 'btn outline', 'data-parked': 'more', onClick: more }, `Mostrar mais ${p.more}`) : null;
  return el(
    'section',
    { class: 'card wall-parked', 'aria-labelledby': titleId },
    el('h2', { class: 'wall-parked-h', 'aria-label': p.title }, head),
    ...(opened ? [el('div', { class: 'wall-parked-list', role: 'list', 'aria-labelledby': titleId }, ...rows), moreButton] : []),
  );
}

function foot(v, machine) {
  const failed = v.state.kind === 'error';
  const step = v.plan && !failed ? v.plan : null;
  const parts = [
    step ? el('span', { class: 'wall-num', 'data-foot': 'step' }, step.label) : null,
    step ? bar({ tipo: 'plan', valor: step.step, max: step.total, rotulo: step.label }) : null,
    v.usage ? el('span', { class: `wall-num${v.usage.high ? ' wall-over' : ''}`, 'data-foot': 'usage' }, v.usage.label) : null,
    v.usage && !step ? bar({ tipo: 'context', valor: v.usage.pct, max: 100, alto: v.usage.high, rotulo: v.usage.label }) : null,
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
  // ADR-0028: the parked keys on screen when "Mostrar mais" was pressed; the first row beyond them gets the focus.
  let moreFrom = null;

  // ADR-0028: the state filter, persistent buttons (label and number) so a redraw never replaces the one with the focus.
  const buttons = new Map();
  const numbers = new Map();
  const selector = el(
    'div',
    { class: 'wall-seg', role: 'group', 'aria-label': 'Estado' },
    ...FILTERS.map((f) => {
      const n = el('span', { class: 'wall-seg-n' });
      const b = el('button', { type: 'button', 'data-filter': f.id, 'aria-pressed': f.id === filter ? 'true' : 'false', onClick: () => choose(f.id) }, el('span', {}, `${f.rotulo} `), n);
      buttons.set(f.id, b);
      numbers.set(f.id, n);
      return b;
    }),
  );
  // ADR-0028: one live region, built once; its text is written only when the sentence changes.
  const lead = el('b', {});
  const rest = el('span', {});
  const summary = el('p', { class: 'wall-summary', 'aria-live': 'polite', 'aria-atomic': 'true' }, lead, rest);
  let said = '';
  function say(counts) {
    const parts = summaryOf(counts);
    const text = summaryText(parts);
    if (text === said) return;
    said = text;
    lead.textContent = parts.lead;
    rest.textContent = parts.rest ? ` ${parts.rest}` : '';
  }
  const head = el('div', { class: 'wall-top' }, el('div', { class: 'wall-top-text' }, el('h1', { class: 'wall-title' }, 'Mural ao vivo'), summary), el('div', { class: 'wall-top-act' }, newSessionButton({ read: ctx.read, write: ctx.write })));
  // Issue 243 (C46), ADR-0028: the machine menu sits at the end of the row of the state filter.
  const machines = createMachineFilter(ctx, { onChange: () => ((wall = null), draw(), read()), reread: () => read(), onLayout: () => draw(), menu: { itemsOf: (b) => b.cards ?? [] }, fallbackFocus: () => buttons.get(filter) });
  const segs = el('div', { class: 'wall-segs' }, selector, machines.row);

  function choose(id) {
    filter = id;
    for (const [k, b] of buttons) b.setAttribute('aria-pressed', k === id ? 'true' : 'false');
    draw();
  }

  // ADR-0028: the redraw keeps what the person was on: the focus, the scroll and the nodes that did not change.
  let spots = [];

  function place(nodes) {
    const current = [...area.childNodes];
    let kept = 0;
    while (kept < nodes.length && current[kept] === nodes[kept]) kept++;
    for (const node of current.slice(kept)) node.remove();
    area.append(...nodes.slice(kept));
  }

  // ADR-0028: the retry of the full-screen error and of the band is one spot, so the focus follows it through the redraw.
  const keepRetry = (shown, fresh) => {
    const again = failure ? shown?.querySelector?.('button') : null;
    if (again) fresh.push({ kind: 'retry', id: 'wall', node: again });
  };

  const findSpot = (list, kind, id) => list.find((x) => x.kind === kind && x.id === id)?.node ?? null;

  // ADR-0028: the key of the leader whose tree holds the session, read from the data: the tree may be closed.
  function leaderKeyOf(key) {
    const inside = (nodes, leader) => nodes.some((n) => itemKey({ id: n.id, machine: leader.machine }) === key || inside(n.children ?? [], leader));
    const leader = (wall?.cards ?? []).find((c) => inside(c.children ?? [], c));
    return leader ? itemKey(leader) : null;
  }

  // ADR-0028: the node is gone; its session may be a card, a row, a nested child or a parked row now, else the link of its leader.
  function sameSession(fresh, spot) {
    const now = ['link', 'child', 'parked'].map((kind) => findSpot(fresh, kind, spot.id)).find(Boolean);
    const leader = leaderKeyOf(spot.id);
    return now ?? (leader ? findSpot(fresh, 'link', leader) : null);
  }

  // ADR-0028: where the focus goes when its node is gone, by the kind of control it was on.
  function movedTo(was, held, fresh, spot) {
    if (spot) {
      const lost = spot.kind === 'retry' ? buttons.get(filter) : (sameSession(fresh, spot) ?? (spot.kind === 'child' && held.key ? findSpot(fresh, 'link', held.key) : null));
      return findSpot(fresh, spot.kind, spot.id) ?? lost;
    }
    // ADR-0028: a control of a failure popover goes back to the same control of the same popover, else to the open button, else to the link of the session.
    if (held.popover && held.key) {
      const open = findSpot(fresh, 'open', held.key);
      const same = open?.parentNode?.querySelector?.(`.${held.popover}`) ?? open;
      if (same) return same;
    }
    // ADR-0028: after "Mostrar mais" the focus goes to the first row that was not there before.
    if (held.toggled?.[1] === 'more' && moreFrom) {
      const added = fresh.find((x) => x.kind === 'parked' && !moreFrom.has(x.id));
      if (added) {
        moreFrom = null;
        return added.node;
      }
    }
    if (held.toggled) {
      const again = [...(area.querySelectorAll?.(`[${held.toggled[0]}]`) ?? [])].find((n) => n.getAttribute(held.toggled[0]) === held.toggled[1]);
      if (again) return again;
    }
    return held.key ? findSpot(fresh, 'link', held.key) : null;
  }

  function focusTarget(was, held, fresh) {
    if (!was) return null;
    if (area.contains(was)) return was;
    const spot = spots.find((x) => x.node === was);
    const moved = movedTo(was, held, fresh, spot);
    if (moved) return moved;
    // ADR-0028: a session the state filter hides is still in the answer: the focus goes to the pressed segment, from any control of it.
    const key = spot?.kind === 'child' ? (leaderKeyOf(spot.id) ?? held.key) : (spot?.id ?? held.key);
    const answered = (wall?.cards ?? []).some((c) => itemKey(c) === key);
    return key && answered ? buttons.get(filter) : null;
  }

  function draw() {
    const doc = globalThis.document;
    const was = doc?.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
    const top = area.scrollTop ?? 0;
    // ADR-0028: the toggles of the tree and of the band are buttons inside a card; the focus goes back to the one just used.
    const toggled = was ? ['data-tree', 'data-toggle', 'data-parked'].map((a) => [a, was.getAttribute?.(a)]).find(([, v]) => v) ?? null : null;
    // ADR-0028: by machine + id (`data-key`), since two machines can have the same session id.
    const holder = was?.closest?.('[data-session]') ?? null;
    const popover = ['open-copy', 'open-close'].find((c) => (was?.getAttribute?.('class') ?? '').split(/\s+/).includes(c)) ?? null;
    const held = { toggled, popover, key: holder ? (holder.getAttribute('data-key') ?? holder.getAttribute('data-session')) : null };
    const fresh = [];
    const nodes = build(fresh);
    place(nodes);
    if (area.scrollTop !== top) area.scrollTop = top;
    const target = focusTarget(was, held, fresh);
    spots = fresh;
    if (target && doc.activeElement !== target) target.focus({ preventScroll: true });
  }

  function build(fresh) {
    if (!wall) {
      say(null);
      for (const n of numbers.values()) n.textContent = '';
      const shown = failure ? error({ text: failure.message, retry: () => read() }) : loading({ label: 'Lendo o mural' });
      keepRetry(shown, fresh);
      return [head, segs, ...machines.parts(), shown];
    }
    const all = wall.cards ?? [];
    const counts = countsOf(all);
    const total = all.length;
    // ADR-0028: nothing is known about a chosen machine that is down: no sentence, no numbers.
    const unknown = machines.chosenDown() && total === 0;
    say(unknown ? null : counts);
    numbers.get('all').textContent = unknown ? '' : String(total);
    for (const id of ['blocked', 'active', 'idle']) numbers.get(id).textContent = unknown ? '' : String(counts[id]);
    numbers.get('blocked').setAttribute('class', `wall-seg-n${counts.blocked > 0 ? ' wall-seg-need' : ''}`);
    const f = FILTERS.find((x) => x.id === filter);
    const cards = all.filter(f.passa);
    const band = failure ? errorBand({ title: 'O mural não atualizou.', text: failure.message, action: { label: 'Tentar de novo', onClick: () => read() } }) : null;
    keepRetry(band, fresh);
    const nest = {
      isOpen: (id) => opened.has(id),
      toggle: (id) => (opened.has(id) ? opened.delete(id) : opened.add(id), draw()),
      titleOf: (id) => {
        const parent = all.find((x) => x.id === id);
        return parent ? titled(parent.title) : null;
      },
      spot: (kind, id, node) => fresh.push({ kind, id, node }),
    };
    const known = machines.hasRemotes();
    // ADR-0028, issue 751: the monogram paints an identity, so it shows only when the sessions drawn, in every section, have two or more agents.
    const mono = new Set(cards.map(agentOf)).size > 1;
    const by = sectionsOf(cards);
    const sections = [];
    const section = (id, title, count, ...content) => {
      const h = el('h2', { class: 'wall-h', id: `wall-h-${id}` }, `${title} `, el('span', { class: 'wall-h-n' }, String(count)));
      return el('section', { class: `wall-sec wall-sec-${id}`, 'aria-labelledby': h.id }, h, ...content);
    };
    const list = (id, nodes, extra = '') => el('div', { class: `wall-list${extra}`, role: 'list', 'aria-labelledby': `wall-h-${id}` }, ...nodes);
    const rowsOf = (id) => by[id].map((c) => row(c, ctx.write, nest, known, mono).node);
    const calm = (filter === 'all' || filter === 'blocked') && total > 0 && !machines.chosenDown();
    if (by.blocked.length) {
      sections.push(section('blocked', ATTENTION_PLURAL.blocked, by.blocked.length, el('div', { class: 'wall-grid', role: 'list', 'aria-labelledby': 'wall-h-blocked' }, ...by.blocked.map((c) => card(c, ctx.write, nest, known, mono).node))));
    } else if (calm) {
      sections.push(section('blocked', ATTENTION_PLURAL.blocked, 0, calmBlock()));
    }
    if (by.active.length) {
      const spans = by.active.map((c) => Boolean(treeSummary(c.tree)) && nest.isOpen(c.id));
      const nodes = duoCells(spans).map((cell) => {
        if (cell.i === null) return el('div', { class: `wall-filler${cell.last ? ' wall-last' : ''}${cell.first ? ' wall-first' : ''}`, 'aria-hidden': 'true' });
        return row(by.active[cell.i], ctx.write, nest, known, mono, ` wall-${cell.side}${cell.first ? ' wall-first' : ''}${cell.last ? ' wall-last' : ''}`).node;
      });
      sections.push(section('active', 'Ativas', by.active.length, list('active', nodes, ' wall-duo')));
    }
    const pair = ['idle', 'completed'].filter((id) => by[id].length).map((id) => section(id, id === 'idle' ? 'Ociosas' : 'Concluídas', by[id].length, list(id, rowsOf(id))));
    if (pair.length) sections.push(el('div', { class: 'wall-pair' }, ...pair));
    const body = sections.length
      ? el('div', { class: 'wall-body' }, ...sections)
      : machines.chosenDown()
        ? null
        : empty({ icon: 'wall', title: f.vazio, text: filter === 'all' ? `Abra uma sessão do Claude Code ${machines.hasRemotes() ? whereText(machines.choice, machines.machines(), { form: 'any' }) : 'nesta máquina'} e ela aparece aqui.` : 'Troque o filtro para ver as outras.' });
    // The band is part of "Todas": the other filters are about the cards.
    const parked = filter === 'all' ? parkedBand(wall.parked, parkedOpen, { toggle: () => ((parkedOpen = !parkedOpen), draw()), more: () => ((moreFrom = new Set(spots.filter((x) => x.kind === 'parked').map((x) => x.id))), (parkedLimit = PARKED_MAX), read()), spot: nest.spot }) : null;
    return [head, segs, ...machines.parts(), band, body, parked].filter(Boolean);
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
  // issue 752: one read per burst, THROTTLE_MS after its first change; `needs-you` or `permission` reads at once and cancels the timer.
  ctx.onChange((changes) => {
    if (Array.isArray(changes) && changes.some((c) => c?.type === 'needs-you' || c?.type === 'permission')) {
      clearTimeout(wait);
      wait = null;
      read().catch(reportError);
      return;
    }
    wait ??= setTimeout(() => {
      wait = null;
      read().catch(reportError);
    }, THROTTLE_MS);
  });

  draw();
  await read();
  return () => clearTimeout(wait);
}
