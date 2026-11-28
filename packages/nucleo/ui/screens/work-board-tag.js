/* The state of a card of the work board as the one tag of the /ui (issue 763, ADR-0028): the icon of state-icon.js and the label,
no coloured fill. `kind` is a kind of state-icon.js; `label` is the words of the tag (the label of the map when the state has
one, a fact of the card otherwise: "CI ✓", "planejando…"). `className` and `attributes` stay on the wrapper, which tests and
the screens find the tag by. */

import { el } from '../dom.js';
import { stateTag } from '../state-icon.js';

export function boardTag(kind, label, className = '', attributes = {}) {
  return el('span', { class: `wb-state${className ? ` ${className}` : ''}`, ...attributes }, stateTag({ kind, label }));
}
