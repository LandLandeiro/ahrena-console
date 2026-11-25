// One Escape for the shell (issue 750): the layers close one at a time, the first open one in the order given
// (the version panel, the account menu, the drawer), so a key press never closes two things.

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
