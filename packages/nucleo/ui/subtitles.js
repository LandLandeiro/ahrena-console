// #766: the sentences under a screen's title. A subtitle says something about the state now (how many, who, what changed,
// #766: what waits for the person); a screen with nothing to say has only its title. Pure functions of what the screen already
// #766: read: no DOM, no read of their own, no route (the screen writes the result with `setHeaderSub` of dom.js).
import { summaryOf, summaryText } from './wall-sections.js';

const total = (column) => (Number.isFinite(column?.total) ? column.total : 0);
const running = (card) => card?.planning?.state === 'running';
const held = (column) => (Number.isFinite(column?.count) ? column.count : Array.isArray(column?.cards) ? column.cards.length : 0);
const byId = (columns, id) => (Array.isArray(columns) ? columns.find((c) => c?.id === id) : undefined);

/** The sessions board (Kanban): the sentence of the Mural, over the totals of its columns. `null` when no session is on it. */
export function sessionBoardSub(columns) {
  const counts = { blocked: total(byId(columns, 'blocked')), active: total(byId(columns, 'active')), idle: total(byId(columns, 'idle')), completed: total(byId(columns, 'completed')) };
  if (!Object.values(counts).some((n) => n > 0)) return null;
  return summaryText(summaryOf(counts));
}

/** The items of Planejamento that wait for a plan: the ones whose plan session is already running do not (prototype of #766). */
const waitingForPlan = (column) => held(column) - (Array.isArray(column?.cards) ? column.cards.filter(running).length : 0);

/** The work board: what waits for a plan and what waits for a review, over the columns `planning` and `review`. `null` when nothing waits. */
export function workBoardSub(columns) {
  const plan = waitingForPlan(byId(columns, 'planning'));
  const review = held(byId(columns, 'review'));
  const item = (n) => (n === 1 ? '1 item' : `${n} itens`);
  const waits = (n) => (n === 1 ? 'espera' : 'esperam');
  const parts = [plan > 0 ? { n: plan, text: 'um plano' } : null, review > 0 ? { n: review, text: 'revisão' } : null].filter(Boolean);
  if (!parts.length) return null;
  const [first, second] = parts;
  const lead = `${item(first.n)} ${waits(first.n)} ${first.text}`;
  return second ? `${lead} e ${second.n} ${waits(second.n)} ${second.text}.` : `${lead}.`;
}

/** The cost tab: today's spend against the daily average of the period the screen reads. `null` without a price, an average or a spend today. */
export function costSub({ today, average, days } = {}) {
  if (!Number.isFinite(today) || !Number.isFinite(average) || today <= 0 || average <= 0) return null;
  const percent = Math.round((today / average - 1) * 100);
  if (percent === 0) return `O gasto de hoje está na média diária de ${days} dias.`;
  return `O gasto de hoje está ${Math.abs(percent)}% ${percent > 0 ? 'acima' : 'abaixo'} da média diária de ${days} dias.`;
}
