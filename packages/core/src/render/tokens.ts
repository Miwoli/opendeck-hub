// Nocturne design tokens.

export const color = {
  ink: '#090A0F',
  surface: '#12141B',
  raised: '#1B1E28',
  text: '#ECEDF2',
  text2: '#A6ACBD',
  label: '#8A90A2',
  icon: '#B7BCCB',
  ember: '#FFB547',
  emberInk: '#241606',
  mint: '#5BE3A5',
  iris: '#7B6CFF',
  irisIcon: '#B7AEFF',
  glacier: '#6CB8FF',
  alert: '#FF5C5C',
  alertSoft: '#FF8A8A',
  alertText: '#FFC2C2',
  alertBg: '#331E24',
} as const;

/** Ember pill gradient (135deg). */
export const emberStops = [
  { offset: 0, color: '#FFD08A' },
  { offset: 0.45, color: '#FFB547' },
  { offset: 1, color: '#FF9340' },
] as const;

/** Placeholder cover gradient used when no artwork is available. */
export const coverFallback: readonly [string, string] = ['#5B4BFF', '#139C9A'];

export const font = {
  ui: 'Manrope, sans-serif',
  num: "'Space Grotesk', sans-serif",
} as const;

/** Tile geometry (72x72 viewBox; OpenDeck renders at 144x144). */
export const geo = {
  size: 72,
  radius: 12,
  badge: { cx: 36, cy: 22, r: 12, coverR: 10 },
  nameY: 51,
  statusY: 62,
  coverNameY: 55,
  coverStatusY: 65,
  valueY: 30,
  bar: { x: 8, y: 36, w: 56, h: 4 },
  nameSize: 8.5,
  statusSize: 7.5,
  valueSize: 22,
  textMaxWidth: 64,
} as const;

/**
 * Typography/positions. `design` = the original design layout (reference only). `deck` = the default: the
 * first-gen Stream Deck keys are physically 72x72 px (OpenDeck draws 144 px, the device library downsizes to 72
 * with a bilinear filter), so the design's 7.5 px status text is unreadable there (tested on a real deck).
 */
export interface Layout {
  id: 'design' | 'deck';
  badgeCy: number;
  badgeR: number;
  coverBadgeR: number;
  nameSize: number;
  statusSize: number;
  statusWeight: number;
  nameY: number;
  statusY: number;
  coverNameY: number;
  coverStatusY: number;
  valueSize: number;
  valueY: number;
  barY: number;
  textMaxWidth: number;
}

export const layouts: Readonly<Record<Layout['id'], Layout>> = {
  design: {
    id: 'design',
    badgeCy: 22,
    badgeR: 12,
    coverBadgeR: 10,
    nameSize: 8.5,
    statusSize: 7.5,
    statusWeight: 500,
    nameY: 51,
    statusY: 62,
    coverNameY: 55,
    coverStatusY: 65,
    valueSize: 22,
    valueY: 30,
    barY: 36,
    textMaxWidth: 64,
  },
  deck: {
    id: 'deck',
    badgeCy: 20,
    badgeR: 12,
    coverBadgeR: 10,
    nameSize: 11,
    statusSize: 9.5,
    statusWeight: 600,
    nameY: 48,
    statusY: 62,
    coverNameY: 53,
    coverStatusY: 65,
    valueSize: 26,
    valueY: 28,
    barY: 33,
    textMaxWidth: 68,
  },
};

/**
 * Default tile background on the deck: pure black instead of Nocturne Surface (#12141B), which the first-gen
 * LCD shows as a blue glow (chosen after testing on a real deck).
 */
export const deckSurface = '#000000';

export type UsageLevel = 'ok' | 'warn' | 'alert';

/** Bars: Mint < 70 %, Ember 70–90 %, Alert > 90 %. */
export function usageLevel(percent: number): UsageLevel {
  if (percent > 90) return 'alert';
  if (percent >= 70) return 'warn';
  return 'ok';
}

export function usageColor(percent: number): string {
  const level = usageLevel(percent);
  return level === 'alert' ? color.alert : level === 'warn' ? color.ember : color.mint;
}

// Temperature scale; the anchors are chosen so that 18.9 °C gives
// the design's #A9C7F5 (cool, Glacier family) and warm values go through Ember to Alert.
// The anchors are a design choice and can be tuned.
const tempScale: ReadonlyArray<readonly [number, string]> = [
  [14, color.glacier],
  [19, '#A9C7F5'],
  [22, color.text],
  [26, color.ember],
  [30, color.alert],
];

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + ((cb[i] ?? v) - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function temperatureColor(celsius: number): string {
  const first = tempScale[0];
  const last = tempScale[tempScale.length - 1];
  if (!first || !last) return color.text;
  if (celsius <= first[0]) return first[1];
  if (celsius >= last[0]) return last[1];
  for (let i = 1; i < tempScale.length; i++) {
    const lo = tempScale[i - 1];
    const hi = tempScale[i];
    if (lo && hi && celsius <= hi[0]) {
      return mix(lo[1], hi[1], (celsius - lo[0]) / (hi[0] - lo[0]));
    }
  }
  return last[1];
}
