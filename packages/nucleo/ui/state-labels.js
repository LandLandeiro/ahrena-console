// The one map of state labels of the /ui, in two columns: Dev and Projeto (issue 760, finding M12 of the UX review,
// decision 0029). Every screen asks this module for the words of a state; none writes its own map, and a test
// (test/api/ui-state-labels.test.ts) refuses a state label written by hand anywhere else in ui/.
//
// - The name is `state-labels.js`, not `states.js`: that one holds the loading, empty and error helpers of every screen.
// - Dev is the vocabulary of today. Projeto is the same ids with the words of the table of section 4 of the review
//   ("Pede sua aprovação", "Parou com erro", "Esperando sua resposta", "Encerrada sem terminar"); what the table calls
//   "igual" is equal here. "Ativa" and "Ociosa" are still the same in both columns: renaming them is issue 753, and it
//   changes this file only.
// - The ids (`active`, `idle`, `blocked`, `permission`...) are the ones of the API and do not change.
// - The mode is `dev` at first and lives in this module only: no button, no storage. Issue 754 sets it and redraws; a
//   screen reads the label while it draws (`stateLabel(id)` reads the mode at the call), so a constant that holds a
//   label would go stale: use `stateLabels(...)`, whose values are read when they are read.
// - Each state carries the kind of state-icon.js (`needs`, `permission`, `working`, `queued`, `paused`, `completed`,
//   `error`, `answered`), so the label, the icon and the colour of a state share one key. This file imports nothing,
//   and state-icon.js imports it.
// - The work board's columns are here too, by column id. The core still sends "Em review" and "Bloqueado" (src/github/
//   work-board.ts); the board draws the names below and ignores the `label` of the payload.
//
// Not here, on purpose: the states of a machine, a container, a terminal, a tool call and a plan step (they are not
// states of a session), the states of a pull request group in a workflow, and the type of a decision.

/** The two columns, in the order they are offered. */
export const STATE_MODES = Object.freeze(['dev', 'project']);

let mode = 'dev';

/** Sets the mode: `true` when it is `dev` or `project`, `false` (and the mode stays) for anything else. Never throws. */
export function setStateLabelMode(value) {
  if (typeof value !== 'string' || !STATE_MODES.includes(value)) return false;
  mode = value;
  return true;
}

/** The current mode, `dev` or `project`. */
export const stateLabelMode = () => mode;

// A state: its kind, then its words in Dev and in Projeto, each `[singular, plural?]` (the plural is for pills, filters and
// columns). Projeto is written out only where it differs: `same` repeats Dev.
const same = null;
const state = (kind, dev, project = same) => Object.freeze({ kind, dev: Object.freeze(dev), project: Object.freeze(project ?? dev) });

const STATES = Object.freeze({
  // The two attention levels (issue 245).
  blocked: state('needs', ['Precisa de você', 'Precisam de você']),
  idle: state('paused', ['Ociosa', 'Ociosas']),
  // Why a session is blocked or idle.
  permission: state('permission', ['Pede permissão'], ['Pede sua aprovação']),
  question: state('needs', ['Pergunta'], ['Esperando sua resposta']),
  plan: state('needs', ['Plano para aprovar']),
  decision: state('needs', ['Decisão pedida']),
  error: state('error', ['Com erro'], ['Parou com erro']),
  turn_ended: state('paused', ['Sua vez'], ['Esperando sua resposta']),
  interrupted: state('paused', ['Interrompida']),
  first_prompt: state('paused', ['No prompt']),
  // The status of a session.
  active: state('working', ['Ativa', 'Ativas']),
  completed: state('completed', ['Concluída', 'Concluídas']),
  abandoned: state('paused', ['Abandonada', 'Abandonadas'], ['Encerrada sem terminar', 'Encerradas sem terminar']),
  queued: state('queued', ['Na fila']),
  answered: state('answered', ['Respondida']),
  // The short "Erro" of a filter pill and of the run of a workflow; the long one is `error`.
  failed: state('error', ['Erro'], ['Parou com erro']),
  // The band of the Mural for what has stopped asking for you.
  parked: state('paused', ['Paradas']),
  // The agents and steps of a workflow run (masculine: they qualify an agent or a step, not a session).
  running: state('working', ['Rodando']),
  reviewing: state('working', ['Revisando']),
  active_item: state('working', ['Ativo']),
  completed_item: state('completed', ['Concluído']),
  agent_waiting: state('paused', ['Esperando']),
});

// The six columns of the work board, equal in both modes. "Em revisão" and "Precisa de você" replace "Em review" and
// "Bloqueado": the same concept as the rest of the /ui. "Concluído" stays: it qualifies an item, not a session.
const BOARD_COLUMNS = Object.freeze({
  planning: 'Planejamento',
  queued: 'Na fila',
  running: 'Em execução',
  review: 'Em revisão',
  blocked: 'Precisa de você',
  done: 'Concluído',
});

// The state a kind draws when only the kind is known (state-icon.js).
const KIND_STATE = Object.freeze({ needs: 'blocked', permission: 'permission', working: 'active', queued: 'queued', paused: 'idle', completed: 'completed', error: 'error', answered: 'answered' });

const textOf = (entry, plural) => (plural && entry[mode][1] ? entry[mode][1] : entry[mode][0]);

/** The label of a state in the current mode, singular or `{ plural: true }`; `null` for an id that is not a state (never the raw id). */
export function stateLabel(id, { plural = false } = {}) {
  return typeof id === 'string' && Object.hasOwn(STATES, id) ? textOf(STATES[id], plural) : null;
}

/** The kind of state-icon.js of a state, or `null`. */
export const stateKind = (id) => (typeof id === 'string' && Object.hasOwn(STATES, id) ? STATES[id].kind : null);

/** What an icon of this kind says when nothing else does: the label of the state that owns the kind, or `null`. */
export function kindLabel(kind, options) {
  return typeof kind === 'string' && Object.hasOwn(KIND_STATE, kind) ? stateLabel(KIND_STATE[kind], options) : null;
}

/** "Precisa de você ou ociosa": the filter that takes both levels, built from the two labels. */
export const needsOrIdleLabel = () => `${stateLabel('blocked')} ou ${stateLabel('idle').toLowerCase()}`;

/**
 * A map from a key to a label that reads the mode when it is read, for an exported constant a screen indexes
 * (`STATUS[status]`): `stateLabels(['active', 'error'])`, or `stateLabels({ working: 'active', waiting: needsOrIdleLabel })`
 * (a key to the id of a state, or to a function that returns the label). It lists, spreads and answers `Object.hasOwn`.
 */
export function stateLabels(spec, options) {
  const pairs = Array.isArray(spec) ? spec.map((id) => [id, id]) : Object.entries(spec);
  const map = {};
  for (const [key, source] of pairs) {
    Object.defineProperty(map, key, { enumerable: true, get: () => (typeof source === 'function' ? source() : stateLabel(source, options)) });
  }
  return map;
}

/** The name of a column of the work board, by its id (the same in both modes), or `null`. */
export const boardColumnLabel = (id) => (typeof id === 'string' && Object.hasOwn(BOARD_COLUMNS, id) ? BOARD_COLUMNS[id] : null);

/** The ids of the board's columns, in order. */
export const boardColumnIds = () => Object.keys(BOARD_COLUMNS);

/** Every state with its kind and both columns, as plain data (a copy), for a test or a legend. */
export function stateEntries() {
  return Object.entries(STATES).map(([id, s]) => ({
    id,
    kind: s.kind,
    dev: { label: s.dev[0], plural: s.dev[1] ?? null },
    project: { label: s.project[0], plural: s.project[1] ?? null },
  }));
}
