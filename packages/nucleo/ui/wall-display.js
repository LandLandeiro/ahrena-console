// What the Mural draws from the "Exibir" choice (#754), without DOM: the mono line of a session and whether it names its machine.

const MONEY = (usd) => `~US$ ${usd.toFixed(2).replace('.', ',')}`;

/** The mono line of a session: model, cost, conversation use and branch, the ones that are on and that the payload has; `''` without any. */
export function techLine(card, show) {
  const parts = [];
  if (show.model && typeof card.model === 'string' && card.model) parts.push(card.model);
  if (show.model && Number.isFinite(card.cost?.usd)) parts.push(MONEY(card.cost.usd));
  if (show.usage && Number.isFinite(card.context?.pct)) parts.push(`uso ${Math.min(100, Math.max(0, Math.round(card.context.pct)))}%`);
  if (show.branch && typeof card.branch === 'string' && card.branch) parts.push(card.branch);
  return parts.join(' · ');
}

/**
 * Whether a session names its machine. On a card (#751): a remote one always, this one once the core knows a remote, but not in Projeto (#754, ux-review §4).
 * On a row (M7): only when it is not this one; in the Dev compact on every row, once a remote is known. The field off hides it.
 */
export function machineShown({ place, show, density, mode, remote, known }) {
  if (!show.machine) return false;
  if (remote) return true;
  if (place === 'card') return known && mode !== 'project';
  return mode === 'dev' && density === 'compact' && known;
}
