// Formatting of the text shown on the keys.

/** The state of a Home Assistant person entity is a zone name ("home", "not_home" or a custom zone name). */
export function placeLabel(state: string): string {
  const s = state.trim();
  if (s === 'home') return 'Home';
  if (s === 'not_home') return 'Away';
  if (s === '' || s === 'unknown' || s === 'unavailable') return '—';
  return s;
}

export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '?';
}
