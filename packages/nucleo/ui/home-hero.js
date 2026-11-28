// issue 759: the card of the Início under the greeting: the three numbers and the bars by hour. The words of a state
// come from state-labels.js; the colour of a bar is in dashboard.css, and every bar also says its state in words
// (its title, the label of its hour and the legend), so no state is told by colour alone.
import { el } from './dom.js';
import { stateLabel } from './state-labels.js';
import { BAR_KINDS, BAR_STATE, plural } from './home-today.js';

const stat = (id, label, value, note = '') => el('div', { class: 'stat', 'data-card': id }, el('span', { class: 'label' }, label), el('span', { class: 'v' }, value), note ? el('span', { class: 's' }, note) : null);

/** The height class of a bar: a quarter, a half, three quarters or the whole hour. */
const heightOf = (share) => `home-bar-h${Math.min(4, Math.max(1, Math.ceil(share * 4)))}`;

const wordsOf = (kind, n) => `${n} ${stateLabel(BAR_STATE[kind], { plural: n > 1 }).toLowerCase()}`;

function hourGroup({ hour, bars }) {
  const counts = BAR_KINDS.map((kind) => [kind, bars.filter((b) => b.kind === kind).length]).filter(([, n]) => n > 0);
  return el(
    'div',
    { class: 'home-hour', role: 'group', 'aria-label': `${hour}h: ${counts.length ? counts.map(([kind, n]) => wordsOf(kind, n)).join(', ') : 'nenhuma sessão'}` },
    el('div', { class: 'home-hour-bars' }, ...bars.map((b) => el('span', { class: `home-bar ${heightOf(b.share)}`, 'data-kind': b.kind, title: stateLabel(BAR_STATE[b.kind]) }))),
    el('span', { class: 'home-hour-name' }, `${hour}h`),
  );
}

function chart(hours) {
  if (!hours.length) return null;
  const present = BAR_KINDS.filter((kind) => hours.some((h) => h.bars.some((b) => b.kind === kind)));
  return el(
    'div',
    { class: 'home-chart' },
    el('div', { class: 'home-bars', role: 'group', 'aria-label': 'Sessões abertas por hora' }, ...hours.map(hourGroup)),
    el(
      'div',
      { class: 'home-legend' },
      ...present.map((kind) => el('span', { class: 'home-legend-item' }, el('span', { class: 'home-swatch', 'data-kind': kind }), stateLabel(BAR_STATE[kind]))),
      el('span', { class: 'home-legend-note' }, 'Uma barra por sessão aberta naquela hora'),
    ),
  );
}

/** The card: `working` is a number (`workingNote` says how many are a remote's), `spend` a text and `completed` a number or `null` (a dash), `hours` the bars of the day. */
export function hero({ working, workingNote = '', spend, completed, hours }) {
  return el(
    'section',
    { class: 'card home-hero', 'aria-label': 'Hoje' },
    el('div', { class: 'home-numbers' }, stat('working-now', 'Trabalhando agora', plural(working), workingNote), stat('spend-today', 'Gasto hoje', spend ?? '—'), stat('completed-today', 'Concluídas hoje', completed === null ? '—' : String(completed))),
    chart(hours),
  );
}
