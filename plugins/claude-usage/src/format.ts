// Reset time on the tile status line: session "in 2h 10m", week "Sun 22:00".
// Local time zone of the plugin process (= the user's).

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parse(resetsAt: string | null | undefined): Date | null {
  if (!resetsAt) return null;
  const d = new Date(resetsAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "in 2h 10m", "in 40m", "soon" */
export function formatRelative(resetsAt: string | null | undefined, now = new Date()): string {
  const d = parse(resetsAt);
  if (!d) return '—';
  const minutes = Math.ceil((d.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return 'soon';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h >= 24) return formatWeekday(resetsAt);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

/** "Sun 22:00"; today: "today 22:00" */
export function formatWeekday(resetsAt: string | null | undefined, now = new Date()): string {
  const d = parse(resetsAt);
  if (!d) return '—';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return `${sameDay ? 'today' : WEEKDAYS[d.getDay()]} ${time}`;
}
