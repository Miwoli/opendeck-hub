// Badge glyphs of the Nocturne design. Coordinates are local to the badge centre
// (the template wraps them in translate(36 22)); stroke colour/width come from the template.

export interface Glyph {
  /** SVG elements without stroke/fill attributes. */
  body: string;
  /** Extra transform inside the badge (power icon uses a 24px Lucide path scaled to .75). */
  transform?: string;
  /** Stroke width before `transform` (2.4 * .75 = 1.8 effective). */
  strokeWidth?: number;
}

const POWER: Glyph = {
  body: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/>',
  transform: 'scale(.75) translate(-12 -12)',
  strokeWidth: 2.4,
};

const glyphDefs = {
  mic: { body: '<rect x="-3" y="-8" width="6" height="10" rx="3"/><path d="M-6 -1a6 6 0 0 0 12 0M0 5v3M-3 8h6"/>' },
  micOff: {
    body: '<rect x="-3" y="-8" width="6" height="10" rx="3"/><path d="M-6 -1a6 6 0 0 0 12 0M0 5v3M-3 8h6M-8 -8L8 8"/>',
  },
  headphones: {
    body: '<path d="M-7 3v-3a7 7 0 0 1 14 0v3"/><rect x="-8.5" y="2" width="4" height="6.5" rx="2"/><rect x="4.5" y="2" width="4" height="6.5" rx="2"/>',
  },
  headphonesOff: {
    body: '<path d="M-7 3v-3a7 7 0 0 1 14 0v3"/><rect x="-8.5" y="2" width="4" height="6.5" rx="2"/><rect x="4.5" y="2" width="4" height="6.5" rx="2"/><path d="M-8 -8L8 8"/>',
  },
  ptt: { body: '<rect x="-2.5" y="-7" width="5" height="9" rx="2.5"/><path d="M-5.5 -1a5.5 5.5 0 0 0 11 0M0 4.5v3M-3 7.5h6"/>' },
  pttActive: {
    body: '<rect x="-2.5" y="-7" width="5" height="9" rx="2.5"/><path d="M-5.5 -1a5.5 5.5 0 0 0 11 0M0 4.5v3M-3 7.5h6M-9.5 -4a6 6 0 0 0 0 8M9.5 -4a6 6 0 0 1 0 8"/>',
  },
  gamepad: {
    body: '<path d="M-6 -4h12a4 4 0 0 1 4 4v3a3 3 0 0 1-5 2l-2-2h-6l-2 2a3 3 0 0 1-5-2v-3a4 4 0 0 1 4-4z"/><path d="M-5.5 -1v3M-7 0.5h3"/><path d="M4 -0.5h.01M6 1.5h.01"/>',
  },
  monitor: { body: '<rect x="-8" y="-6" width="16" height="10" rx="1.5"/><path d="M0 4v3M-4 7h8"/>' },
  monitorsExtend: {
    body: '<rect x="-9.5" y="-5" width="9" height="7" rx="1"/><rect x=".5" y="-5" width="9" height="7" rx="1"/><path d="M-5 2v3M-7.5 5h5M5 2v3M2.5 5h5"/>',
  },
  power: POWER,
  map: { body: '<path d="M-8 -5l5-2 6 2 5-2v12l-5 2-6-2-5 2z"/><path d="M-3 -7v12M3 -5v12"/>' },
  back: { body: '<path d="M8 0H-8M-3 -5l-5 5 5 5"/>' },
  steam: { body: '<path d="M-7 -7v14M-3 -7v14M1.5 -6.5l3.5 -.8 3 13.5-3.5.8z"/>' },
  lutris: {
    body: '<rect x="-7" y="-7" width="6" height="6" rx="1.5"/><rect x="1" y="-7" width="6" height="6" rx="1.5"/><rect x="-7" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="1" width="6" height="6" rx="1.5"/>',
  },
  close: { body: '<path d="M-6 -6l12 12M6 -6l-12 12"/>' },
  check: { body: '<path d="M-6 0l4 4 8-8"/>' },
  bolt: { body: '<path d="M2 -8l-8 10h6l-2 8 8-10h-6z"/>' },
  /** equaliser from the Media cover badge (M32 26v-4M36 26v-9M40 26v-6 around 36,22) */
  equalizer: { body: '<path d="M-4 4v-4M0 4v-9M4 4v-6"/>' },
  screenshot: { body: '<path d="M-8 -3v-5h5M3 -8h5v5M8 3v5h-5M-3 8h-5v-5"/><circle r="2"/>' },
} satisfies Record<string, Glyph>;

export type GlyphName = keyof typeof glyphDefs;
export const glyphs: Readonly<Record<GlyphName, Glyph>> = glyphDefs;

/** Glyphs used inside the cover badge (r=10), drawn in absolute tile coordinates. */
export const coverGlyphs = {
  /** equaliser bars = playing */
  bars: '<path d="M32 26v-4M36 26v-9M40 26v-6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
  /** play triangle = paused (press to play) */
  play: '<path d="M33.5 17.5l8 4.5-8 4.5z" fill="#fff"/>',
} as const;

export type CoverGlyphName = keyof typeof coverGlyphs;
