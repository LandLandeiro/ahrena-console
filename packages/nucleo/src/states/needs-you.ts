// The one rule behind "precisa de você" (issue #761). A pure function: no IO, no import from src/api.
//
// A session needs the person when its attention reason is one of these six: a permission, a question,
// a plan to approve, a decision asked, an error, or the turn that ended and awaits the answer ("Sua vez").
// Esc (`interrupted`) and a new session at the prompt (`first_prompt`) await nobody, and a session with no
// attention is not waiting. Every count and every list (the bar, the wall, the sessions filter, the
// dashboard) reads this rule; none keeps its own list of reasons.

/** The reasons that need the person, in the order of the MCP attention enum. */
export const NEEDS_YOU_REASONS = ['permission', 'question', 'plan', 'decision', 'error', 'turn_ended'] as const;
export type NeedsYouReason = (typeof NEEDS_YOU_REASONS)[number];

const NEEDS_YOU: ReadonlySet<string> = new Set(NEEDS_YOU_REASONS);

/** Whether a session with this attention reason needs the person; `null`, `undefined` and an unknown reason do not. */
export function needsYou(reason: string | null | undefined): reason is NeedsYouReason {
  return typeof reason === 'string' && NEEDS_YOU.has(reason);
}

/** The "Sua vez" row the screen draws below the cards: the turn ended and the person is awaited. */
export function isYourTurn(reason: string | null | undefined): reason is 'turn_ended' {
  return reason === 'turn_ended';
}
