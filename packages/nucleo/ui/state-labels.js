/* The one map of state labels of the /ui (#760), in two columns, Dev and Projeto: a screen asks this module for the words of a
   state and never writes its own (test/api/ui-state-labels.test.ts refuses one written by hand). The mode lives here only, so
   a screen reads `stateLabel(id)` while it draws and holds no label in a constant (use `stateLabels(...)`). This file imports nothing. */

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

/* #760: a state is its kind (the one of state-icon.js, so label, icon and colour share a key), then its words in Dev and in
   Projeto, each `[singular, plural?]` (the plural is for pills, filters and columns). Projeto is written out only where it
   differs. `failed` is the short "Erro" of a filter pill and of a workflow run, `parked` the band of the Wall, and the
   masculine ones (`running`, `reviewing`, `*_item`, `agent_waiting`) qualify an agent or a step, not a session. */
const same = null;
const state = (kind, dev, project = same) => Object.freeze({ kind, dev: Object.freeze(dev), project: Object.freeze(project ?? dev) });

const STATES = Object.freeze({
  // #245: the two attention levels.
  blocked: state('needs', ['Precisa de você', 'Precisam de você']),
  idle: state('paused', ['Ociosa', 'Ociosas']),
  // #245: why a session is blocked or idle.
  permission: state('permission', ['Pede permissão'], ['Pede sua aprovação']),
  question: state('needs', ['Pergunta'], ['Esperando sua resposta']),
  plan: state('needs', ['Plano para aprovar']),
  decision: state('needs', ['Decisão pedida']),
  error: state('error', ['Com erro'], ['Parou com erro']),
  turn_ended: state('paused', ['Sua vez'], ['Esperando sua resposta']),
  interrupted: state('paused', ['Interrompida']),
  first_prompt: state('paused', ['No prompt']),
  active: state('working', ['Ativa', 'Ativas']),
  completed: state('completed', ['Concluída', 'Concluídas']),
  abandoned: state('paused', ['Abandonada', 'Abandonadas'], ['Encerrada sem terminar', 'Encerradas sem terminar']),
  queued: state('queued', ['Na fila']),
  answered: state('answered', ['Respondida']),
  failed: state('error', ['Erro'], ['Parou com erro']),
  parked: state('paused', ['Paradas']),
  running: state('working', ['Rodando']),
  reviewing: state('working', ['Revisando']),
  active_item: state('working', ['Ativo']),
  completed_item: state('completed', ['Concluído']),
  agent_waiting: state('paused', ['Esperando']),
});

/* #760: the six columns of the work board, equal in both modes. "Em revisão" and "Precisa de você" replace "Em review" and
   "Bloqueado": the same concept as the rest of the /ui. "Concluído" stays: it qualifies an item, not a session. */
const BOARD_COLUMNS = Object.freeze({
  planning: 'Planejamento',
  queued: 'Na fila',
  running: 'Em execução',
  review: 'Em revisão',
  blocked: 'Precisa de você',
  done: 'Concluído',
});

// #760: the state a kind draws when only the kind is known (state-icon.js).
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
