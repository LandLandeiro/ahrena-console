// What each session shows on the Mural (#754, the "Exibir" panel): the density and the seven fields. Kept in the
// localStorage like the theme (theme.js), in one value per mode, so the Projeto mode of #754's next layer has its own
// value and never touches the Dev one. Plain JavaScript, no DOM: the panel and the wall read it from here.
//
// The stored value, one JSON per key: `{ "v": 1, "density": "comfortable" | "compact", "show": null | { <field>: boolean } }`.
// `show: null` means "the fields of the density" (the compact turns the technical ones on); a person who ticks a box stores
// the whole map. A value that does not parse, or a field that is not a boolean, is the default, field by field.
//   Dev     `ahrena-console-display`
//   Projeto `ahrena-console-display-project`
// The mode is set by the screen that owns it (`setDisplayMode`); it lives here, in memory, like the labels' (state-labels.js).

import { pageStorage } from './theme.js';

export const DISPLAY_KEY = 'ahrena-console-display';
export const DISPLAY_KEY_PROJECT = 'ahrena-console-display-project';
export const DISPLAY_MODES = Object.freeze(['dev', 'project']);
export const DENSITIES = Object.freeze(['comfortable', 'compact']);
/** The fields of "Mostrar", in the order the panel lists them. */
export const FIELDS = Object.freeze(['agent', 'phrase', 'plan', 'machine', 'model', 'usage', 'branch']);
const TECHNICAL = Object.freeze(['model', 'usage', 'branch']);
const KEYS = Object.freeze({ dev: DISPLAY_KEY, project: DISPLAY_KEY_PROJECT });

let mode = 'dev';
// A storage that is denied or full: the choice lasts in memory, per mode.
const memory = { dev: null, project: null };
const listeners = new Set();

/** Sets the mode: `true` for `dev` or `project`, `false` (and the mode stays) for anything else. */
export function setDisplayMode(value) {
  if (!DISPLAY_MODES.includes(value)) return false;
  mode = value;
  return true;
}

/** The current mode, `dev` or `project`. */
export const displayMode = () => mode;

/**
 * The density and the fields of a mode that nobody chose. Dev: comfortable is today's wall, compact adds the technical fields.
 * Projeto (#754): model and cost, conversation use and branch are off at both densities; what asks for action comes back by itself.
 */
export function displayDefaults(forMode = 'dev', density = 'comfortable') {
  const technical = forMode !== 'project' && density === 'compact';
  return { density, show: Object.fromEntries(FIELDS.map((f) => [f, TECHNICAL.includes(f) ? technical : true])) };
}

/** A stored value read as the panel needs it: `{ density, show }` with the whole map, bad parts replaced by the defaults. */
export function parseDisplay(raw, forMode = 'dev') {
  let data = null;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    data = null;
  }
  const density = data && typeof data === 'object' && DENSITIES.includes(data.density) ? data.density : 'comfortable';
  const defaults = displayDefaults(forMode, density);
  const given = data && typeof data === 'object' && data.show && typeof data.show === 'object' && !Array.isArray(data.show) ? data.show : {};
  return { density, show: Object.fromEntries(FIELDS.map((f) => [f, typeof given[f] === 'boolean' ? given[f] : defaults.show[f]])) };
}

/** The value of `forMode` from the storage (or from memory when the storage is off). */
export function readDisplay(forMode = 'dev', storage = pageStorage()) {
  try {
    return parseDisplay(storage?.getItem(KEYS[forMode]), forMode);
  } catch {
    // A denied storage: what this page chose is in memory.
    return parseDisplay(memory[forMode], forMode);
  }
}

/** Stores `{ density, show }` (`show: null` for the density's own fields) under the key of `forMode`; nothing else is touched. */
export function writeDisplay(forMode, value, storage = pageStorage()) {
  const stored = { v: 1, density: value.density, show: value.show ?? null };
  try {
    storage?.setItem(KEYS[forMode], JSON.stringify(stored));
  } catch {
    // ADR-0028, like the theme: a full or denied storage still changes the page, from memory.
    memory[forMode] = stored;
  }
}

/** The value of the current mode. */
export const getDisplay = () => readDisplay(mode);

/** Tells `listener(value)` after every change; returns the function that stops it. */
export function onDisplayChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commit(value, stored) {
  writeDisplay(mode, { density: value.density, show: stored });
  const now = getDisplay();
  for (const l of [...listeners]) l(now);
  return true;
}

/** The person chose a density: the fields come back to its own. `false` for a density that does not exist. */
export function chooseDensity(density) {
  if (!DENSITIES.includes(density)) return false;
  return commit({ density }, null);
}

/** The person ticked or cleared a field: the whole map is kept from then on. `false` for a field that does not exist. */
export function setField(field, on) {
  if (!FIELDS.includes(field)) return false;
  const now = getDisplay();
  return commit(now, { ...now.show, [field]: Boolean(on) });
}
