/* #759: what the Início says about the day. Pure functions of what the screen already reads (the page of
   `GET /api/sessions` and the figures of the dashboard); no DOM, no read of their own. A figure the data does not
   give is `null`, and the sentence leaves that part out instead of making a number up. */
import { stateOfSession } from './state-icon.js';

const HOUR = 3_600_000;
const HOURS_SHOWN = 9;
const BARS_PER_HOUR = 6;
const MIN_SHARE = 0.25;

/** The bar kinds, in the order they stand in an hour and in the legend: the one that needs the person first. */
export const BAR_KINDS = ['blocked', 'active', 'paused', 'completed'];
const BAR_OF_KIND = { needs: 'blocked', permission: 'blocked', error: 'blocked', working: 'active', queued: 'active', paused: 'paused', answered: 'paused', completed: 'completed' };
/** The id of state-labels.js that says each bar kind in words. */
export const BAR_STATE = { blocked: 'blocked', active: 'active', paused: 'idle', completed: 'completed' };

const dollar = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Bom dia" until noon, "Boa tarde" until 18 h, "Boa noite" after. */
export function greeting(now = Date.now()) {
  const hour = new Date(now).getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** "US$ 14,88". */
export const usd = (value) => `US$ ${dollar.format(value)}`;

const dayStart = (now, offset = 0) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime();
};

const EMPTY = Object.freeze({ today: null, yesterday: null, completed: null, hours: [] });

/** #759: The rows of the page that carry a start and a last activity, with them as numbers (`GET /api/sessions` answers its rows as `items`). */
function rowsOf(page) {
  if (!Array.isArray(page?.items)) return null;
  return page.items
    .map((s) => ({ session: s, start: Date.parse(s?.start), last: Date.parse(s?.lastActivity) }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.last));
}

/**
 * The day of the sessions of one page of `/api/sessions` (newest activity first): how many started today and yesterday,
 * how many ended today, and the bars of the last hours. A day the page does not reach back to (more sessions exist and
 * the oldest one on the page is newer than the day) is `null`: a short number would be a wrong one.
 */
export function todayFigures(page, now = Date.now()) {
  const rows = rowsOf(page);
  if (!rows) return EMPTY;
  const total = Number.isFinite(page.total) ? page.total : rows.length;
  const oldest = rows.length ? Math.min(...rows.map((r) => r.last)) : Infinity;
  const reaches = (t) => rows.length >= total || oldest < t;
  const midnight = dayStart(now);
  const before = dayStart(now, -1);
  const startedBetween = (from, to) => rows.filter((r) => r.start >= from && r.start < to).length;
  const knowsToday = reaches(midnight);
  return {
    today: knowsToday ? startedBetween(midnight, Infinity) : null,
    yesterday: reaches(before) ? startedBetween(before, midnight) : null,
    completed: knowsToday ? rows.filter((r) => r.session.status === 'completed' && r.last >= midnight).length : null,
    hours: knowsToday ? hoursOf(rows, now, midnight) : [],
  };
}

function barKind(session) {
  const { kind } = stateOfSession({ attention: session.attention ?? null, status: session.status ?? null });
  return BAR_OF_KIND[kind] ?? 'paused';
}

/** #759: The last hours up to now: per hour one bar per session open in it, with the height as the share of the hour it was open. */
function hoursOf(rows, now, midnight) {
  const current = new Date(now).getHours();
  const first = Math.max(0, current - (HOURS_SHOWN - 1));
  const open = rows
    .filter((r) => r.session.status !== 'abandoned')
    .map((r) => ({ id: String(r.session.id ?? ''), kind: barKind(r.session), from: Math.max(r.start, midnight), to: r.session.running === true ? now : r.last }))
    .filter((r) => r.to >= midnight);
  const hours = [];
  for (let hour = first; hour <= current; hour++) {
    const from = midnight + hour * HOUR;
    const to = from + HOUR;
    const bars = open
      .map((r) => ({ ...r, overlap: Math.min(r.to, to) - Math.max(r.from, from), instant: r.from >= from && r.from < to && r.to <= r.from }))
      .filter((r) => r.overlap > 0 || r.instant)
      .sort((a, b) => BAR_KINDS.indexOf(a.kind) - BAR_KINDS.indexOf(b.kind) || a.id.localeCompare(b.id))
      .slice(0, BARS_PER_HOUR)
      .map((r) => ({ id: r.id, kind: r.kind, share: Math.min(1, Math.max(MIN_SHARE, r.overlap / HOUR)) }));
    hours.push({ hour, bars });
  }
  return hours;
}

const sessionsOf = (n) => `${n} ${n === 1 ? 'sessão' : 'sessões'}`;

/**
 * "Hoje foram 10 sessões nas máquinas, 3 a mais que ontem. 3 esperam por você, e o gasto do dia está em US$ 14,88."
 * Each part is written only when its figure is known; `null` when none is.
 */
export function summarySentence({ today = null, yesterday = null, waiting = null, spend = null } = {}) {
  const known = (n) => Number.isFinite(n);
  const sentences = [];
  if (known(today)) {
    const delta = known(yesterday) ? today - yesterday : null;
    const against = delta === null ? '' : delta > 0 ? `, ${delta} a mais que ontem` : delta < 0 ? `, ${-delta} a menos que ontem` : ', o mesmo que ontem';
    sentences.push(`Hoje ${today === 1 ? 'foi' : 'foram'} ${sessionsOf(today)} nas máquinas${against}.`);
  }
  const spent = known(spend) ? `o gasto do dia está em ${usd(spend)}` : null;
  if (known(waiting)) {
    const who = waiting > 0 ? `${waiting} ${waiting === 1 ? 'espera' : 'esperam'} por você` : 'Ninguém espera por você';
    sentences.push(`${who}${spent ? `, e ${spent}` : ''}.`);
  } else if (spent) {
    sentences.push(`${spent[0].toUpperCase()}${spent.slice(1)}.`);
  }
  return sentences.length ? sentences.join(' ') : null;
}

export const plural = sessionsOf;
