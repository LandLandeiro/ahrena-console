// #755: the search of the sidebar (Cmd+K). This is the shape of the module before its behaviour (the tests are red against it).

export const SESSIONS_ROUTE = '/api/sessions?order=activity&direction=desc&perPage=100';
export const normalize = (text) => String(text ?? '');
export const isMacPlatform = () => false;
export const shortcutLabel = () => '';
export const isSearchChord = () => false;
export const searchResults = () => ({ sessions: [], screens: [] });
export function createCommandSearch() {
  return { open() {}, close() {}, isOpen: () => false, button: null, stop() {} };
}
