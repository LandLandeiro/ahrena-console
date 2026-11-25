// ADR-0028: one Escape closes one layer, the first open one in the order given.

export function createEscape(doc, layers) {
  function onKey(ev) {
    if (ev.key !== 'Escape') return;
    const layer = layers.find((l) => l.isOpen());
    if (!layer) return;
    ev.preventDefault?.();
    layer.close();
  }
  doc.addEventListener('keydown', onKey);
  return { stop: () => doc.removeEventListener('keydown', onKey) };
}
