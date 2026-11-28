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
 * M7: the machine of a session shows only when it is not this one; in the Dev compact it shows on every one (once a remote is
 * known: with a single machine there is nothing to tell apart). The field off hides it.
 */
export function machineShown({ show, density, mode, remote, known }) {
  if (!show.machine) return false;
  return remote || (mode === 'dev' && density === 'compact' && known);
}
