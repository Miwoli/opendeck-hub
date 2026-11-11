// Nocturne tile templates: Icon, Value, Cover.
// CSS is inlined into the markup because OpenDeck draws the SVG as an image.
// Everything is centred on x=36. Output is deterministic (same spec -> same string -> same hash).

import { type CoverGlyphName, coverGlyphs, type GlyphName, glyphs } from './glyphs.ts';
import { escapeXml, fitText, n } from './svg.ts';
import { color, coverFallback, deckSurface, emberStops, font, geo, type Layout, layouts } from './tokens.ts';

/** Icon tile colour roles. Colour is used only with meaning. */
export type IconTone =
  | 'neutral' // default
  | 'idle' // waiting for input, dimmer glyph (PTT ready)
  | 'nav' // Iris: navigation (Gry, Mapa, Back, Steam, Lutris)
  | 'on' // Ember: enabled / selected / transmitting
  | 'alert' // muted / error / power hold
  | 'danger' // destructive action at rest (Close game)
  | 'success' // Mint confirmation (Screenshot zapisany)
  | 'confirm' // waiting for the confirming press
  | 'offline';

export type StatusTone = 'default' | 'ok' | 'warn' | 'alert' | 'dim';

export interface Avatar {
  initial: string;
  /** data: URI of a picture, clipped to the badge circle */
  image?: string;
  presence?: 'home' | 'away';
}

export interface IconTileSpec {
  template: 'icon';
  name: string;
  status?: string;
  statusTone?: StatusTone;
  tone?: IconTone;
  glyph?: GlyphName;
  /** Text mark instead of a glyph, e.g. "!" for errors. */
  mark?: string;
  avatar?: Avatar;
  /** Dashed outline = new/proposal or offline. */
  dashed?: boolean;
  /** 0..1 hold-to-confirm progress overlay. */
  holdProgress?: number;
}

export interface ValueTileSpec {
  template: 'value';
  name: string;
  status?: string;
  statusTone?: StatusTone;
  tone?: 'neutral' | 'alert' | 'offline';
  value: string;
  unit?: string;
  valueColor?: string;
  /** null/undefined = no bar; fraction is clamped to 0..1. */
  bar?: { fraction: number; color: string } | null;
  valueSize?: number;
  valueY?: number;
  dashed?: boolean;
}

export interface CoverTileSpec {
  template: 'cover';
  name: string;
  status?: string;
  /** data: URI of artwork (png/jpeg). Without it a gradient placeholder is drawn. */
  image?: string;
  gradient?: readonly [string, string];
  glyph?: CoverGlyphName;
  /** Dims the artwork (media paused). */
  paused?: boolean;
  /** Page pips along the top edge (media: one per active player, `current` = the one shown). Hidden for < 2. */
  pips?: CoverPips;
}

export interface CoverPips {
  /** one entry per pip; true = lit (media: that player is playing) */
  lit: readonly boolean[];
  current: number;
}

export type TileSpec = IconTileSpec | ValueTileSpec | CoverTileSpec;

export interface RenderOptions {
  /** Typography preset, default `deck`; `layouts.design` is the original design layout. */
  layout?: Layout;
  /** Tile background, default `deckSurface` (black); `color.surface` for the design original. */
  surface?: string;
}

interface Ctx {
  L: Layout;
  surface: string;
}

const S = geo.size;
const R = geo.radius;
const FRAME = `x=".5" y=".5" width="71" height="71" rx="11.5" fill="none"`;

interface Frame {
  bg: string;
  defs: string;
  stroke: string | null;
  strokeOpacity: number;
  dashed: boolean;
}

function emberDefs(): string {
  const stops = emberStops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
  return `<linearGradient id="em" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>`;
}

function statusColor(tone: StatusTone | undefined): string {
  switch (tone) {
    case 'ok':
      return color.mint;
    case 'warn':
      return color.ember;
    case 'alert':
      return color.alertSoft;
    case 'dim':
      return color.label;
    default:
      return color.text2;
  }
}

function textLines(L: Layout, name: string, status: string | undefined, nameFill: string, statusFill: string, nameY: number, statusY: number, statusOpacity?: number): string {
  const nm = escapeXml(fitText(name, L.textMaxWidth, L.nameSize, true));
  let out = `<text x="36" y="${nameY}" text-anchor="middle" font-family="${font.ui}" font-weight="700" font-size="${L.nameSize}" fill="${nameFill}">${nm}</text>`;
  if (status !== undefined && status !== '') {
    const sv = escapeXml(fitText(status, L.textMaxWidth, L.statusSize, L.statusWeight >= 600));
    const op = statusOpacity !== undefined ? ` fill-opacity="${statusOpacity}"` : '';
    out += `<text x="36" y="${statusY}" text-anchor="middle" font-family="${font.ui}" font-weight="${L.statusWeight}" font-size="${L.statusSize}" fill="${statusFill}"${op}>${sv}</text>`;
  }
  return out;
}

function wrap(defs: string, body: string): string {
  const d = defs ? `<defs>${defs}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 72 72">${d}${body}</svg>`;
}

function background(frame: Frame): string {
  let out = `<rect width="${S}" height="${S}" rx="${R}" fill="${frame.bg}"/>`;
  if (frame.bg === 'url(#em)') out += `<path d="M12 .8H60" stroke="#fff" stroke-opacity=".5"/>`;
  return out;
}

function outline(frame: Frame): string {
  if (frame.stroke === null) return '';
  const op = frame.strokeOpacity < 1 ? ` stroke-opacity="${frame.strokeOpacity}"` : '';
  const dash = frame.dashed ? ' stroke-dasharray="3 3"' : '';
  return `<rect ${FRAME} stroke="${frame.stroke}"${op}${dash}/>`;
}

// ---- Icon template ------------------------------------------------------------------------------

interface IconPalette {
  frame: Frame;
  badgeFill: string;
  badgeOpacity: number | null;
  glyph: string;
  name: string;
  status: string;
  statusOpacity?: number;
}

function iconPalette(spec: IconTileSpec, surface: string): IconPalette {
  const tone = spec.tone ?? 'neutral';
  const dashed = spec.dashed ?? false;
  const plain: Frame = { bg: surface, defs: '', stroke: '#fff', strokeOpacity: 0.07, dashed };
  const alertFrame: Frame = { bg: color.alertBg, defs: '', stroke: color.alert, strokeOpacity: 0.4, dashed };
  const st = statusColor(spec.statusTone);
  switch (tone) {
    case 'idle':
      return { frame: plain, badgeFill: color.raised, badgeOpacity: null, glyph: color.label, name: color.text, status: st };
    case 'nav':
      return { frame: plain, badgeFill: color.iris, badgeOpacity: 0.18, glyph: color.irisIcon, name: color.text, status: st };
    case 'on':
      return {
        frame: { bg: 'url(#em)', defs: emberDefs(), stroke: null, strokeOpacity: 1, dashed: false },
        badgeFill: color.emberInk,
        badgeOpacity: 0.14,
        glyph: color.emberInk,
        name: color.emberInk,
        status: color.emberInk,
        statusOpacity: 0.75,
      };
    case 'alert':
      return { frame: alertFrame, badgeFill: color.alert, badgeOpacity: 0.18, glyph: color.alert, name: color.text, status: color.alertText };
    case 'danger':
      return { frame: alertFrame, badgeFill: color.alert, badgeOpacity: 0.16, glyph: color.alertSoft, name: color.text, status: color.alertSoft };
    case 'confirm':
      return {
        frame: { ...alertFrame, strokeOpacity: 1 },
        badgeFill: color.alert,
        badgeOpacity: null,
        glyph: color.surface,
        name: color.text,
        status: color.alertText,
      };
    case 'success':
      return {
        frame: { ...plain, stroke: color.mint, strokeOpacity: 0.4 },
        badgeFill: color.mint,
        badgeOpacity: 0.18,
        glyph: color.mint,
        name: color.text,
        status: color.mint,
      };
    case 'offline':
      return {
        frame: { ...plain, strokeOpacity: 0.18, dashed: true },
        badgeFill: color.raised,
        badgeOpacity: null,
        glyph: color.label,
        name: color.text2,
        status: color.label,
      };
    default:
      return { frame: plain, badgeFill: color.raised, badgeOpacity: null, glyph: color.icon, name: color.text, status: st };
  }
}

function holdOverlay(progress: number): { defs: string; body: string } {
  const p = Math.min(1, Math.max(0, progress));
  const w = S * p;
  return {
    defs: `<clipPath id="cp"><rect width="${S}" height="${S}" rx="${R}"/></clipPath>`,
    body:
      `<g clip-path="url(#cp)"><rect width="${n(w)}" height="${S}" fill="${color.alert}" fill-opacity=".3"/>` +
      `<rect x="${n(Math.max(0, w - 2))}" width="2" height="${S}" fill="${color.alert}"/></g>`,
  };
}

function avatarBadge(avatar: Avatar, L: Layout, surface: string): { defs: string; body: string } {
  const cx = geo.badge.cx;
  const cy = L.badgeCy;
  const r = L.badgeR;
  let defs = '';
  let body: string;
  if (avatar.image) {
    defs += `<clipPath id="ac"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`;
    body =
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color.raised}"/>` +
      `<image xlink:href="${escapeXml(avatar.image)}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ac)"/>`;
  } else {
    defs += `<linearGradient id="av" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color.iris}"/><stop offset="1" stop-color="#4B3BD6"/></linearGradient>`;
    const initial = escapeXml([...avatar.initial.trim()][0]?.toUpperCase() ?? '?');
    body =
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#av)"/>` +
      `<text x="${cx}" y="${cy + 4.5}" text-anchor="middle" font-family="${font.num}" font-weight="600" font-size="12" fill="#fff">${initial}</text>`;
  }
  if (avatar.presence) {
    const dot = avatar.presence === 'home' ? color.mint : color.label;
    body += `<circle cx="44.5" cy="${cy + 8.5}" r="3.6" fill="${dot}" stroke="${surface}" stroke-width="1.6"/>`;
  }
  return { defs, body };
}

function renderIcon(spec: IconTileSpec, { L, surface }: Ctx): string {
  const pal = iconPalette(spec, surface);
  const cx = geo.badge.cx;
  const cy = L.badgeCy;
  const r = L.badgeR;
  let defs = pal.frame.defs;
  let body = background(pal.frame);

  if (spec.holdProgress !== undefined) {
    const o = holdOverlay(spec.holdProgress);
    defs += o.defs;
    body += o.body;
  }
  body += outline(pal.frame);

  if (spec.avatar) {
    const a = avatarBadge(spec.avatar, L, surface);
    defs += a.defs;
    body += a.body;
  } else {
    const op = pal.badgeOpacity !== null ? ` fill-opacity="${pal.badgeOpacity}"` : '';
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${pal.badgeFill}"${op}/>`;
    if (spec.mark !== undefined) {
      body += `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-family="${font.num}" font-weight="600" font-size="16" fill="${pal.glyph}">${escapeXml(spec.mark)}</text>`;
    } else if (spec.glyph) {
      const g = glyphs[spec.glyph];
      const t = g.transform ? ` ${g.transform}` : '';
      const sw = g.strokeWidth ?? 1.8;
      body += `<g transform="translate(${cx} ${cy})${t}" fill="none" stroke="${pal.glyph}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${g.body}</g>`;
    }
  }
  body += textLines(L, spec.name, spec.status, pal.name, pal.status, L.nameY, L.statusY, pal.statusOpacity);
  return wrap(defs, body);
}

// ---- Value template -----------------------------------------------------------------------------

function renderValue(spec: ValueTileSpec, { L, surface }: Ctx): string {
  const tone = spec.tone ?? 'neutral';
  const dashed = spec.dashed ?? false;
  const frame: Frame =
    tone === 'alert'
      ? { bg: color.alertBg, defs: '', stroke: color.alert, strokeOpacity: 0.4, dashed }
      : tone === 'offline'
        ? { bg: surface, defs: '', stroke: '#fff', strokeOpacity: 0.18, dashed: true }
        : { bg: surface, defs: '', stroke: '#fff', strokeOpacity: 0.07, dashed };
  let body = background(frame) + outline(frame);

  const valueFill = tone === 'offline' ? color.label : (spec.valueColor ?? color.text);
  // an explicit size (clock) is already as large as fits in 72 px; only the position follows the layout
  const size = spec.valueSize ?? L.valueSize;
  const y = spec.valueY !== undefined ? spec.valueY + (L.valueY - geo.valueY) : L.valueY;
  const unit = spec.unit ? `<tspan font-size="10" fill="${color.label}">${escapeXml(spec.unit)}</tspan>` : '';
  body += `<text x="36" y="${y}" text-anchor="middle" font-family="${font.num}" font-weight="500" font-size="${size}" letter-spacing="-.02em" fill="${valueFill}">${escapeXml(spec.value)}${unit}</text>`;

  if (spec.bar !== undefined && spec.bar !== null) {
    const { x, w, h } = geo.bar;
    const by = L.barY;
    const track = tone === 'alert' ? `fill="${color.alert}" fill-opacity=".25"` : `fill="#fff" fill-opacity=".08"`;
    body += `<rect x="${x}" y="${by}" width="${w}" height="${h}" rx="2" ${track}/>`;
    const f = Math.min(1, Math.max(0, Number.isFinite(spec.bar.fraction) ? spec.bar.fraction : 0));
    if (f > 0 && tone !== 'offline') {
      // never narrower than the bar height so the rounded end stays round
      const fw = Math.max(h, Math.round(w * f));
      body += `<rect x="${x}" y="${by}" width="${fw}" height="${h}" rx="2" fill="${spec.bar.color}"/>`;
    }
  } else if (tone === 'offline') {
    const { x, w, h } = geo.bar;
    const by = L.barY;
    body += `<rect x="${x}" y="${by}" width="${w}" height="${h}" rx="2" fill="#fff" fill-opacity=".08"/>`;
  }

  const nameFill = tone === 'offline' ? color.text2 : color.text;
  const statusFill = tone === 'offline' ? color.label : tone === 'alert' ? color.alertText : statusColor(spec.statusTone);
  body += textLines(L, spec.name, spec.status, nameFill, statusFill, L.nameY, L.statusY);
  return wrap(frame.defs, body);
}

// ---- Cover template -----------------------------------------------------------------------------

const PIP = { y: 4, h: 4, dot: 4, current: 10, gap: 3, max: 5 } as const;

/** Centered pips on a dark capsule: current = wide pill, lit = ember, others = dim white (readable at 72 px). */
function coverPips({ lit, current }: CoverPips): string {
  const n = Math.min(lit.length, PIP.max);
  if (n < 2) return '';
  const widths = Array.from({ length: n }, (_, i) => (i === current ? PIP.current : PIP.dot));
  const total = widths.reduce((a, w) => a + w, 0) + PIP.gap * (n - 1);
  let x = (S - total) / 2;
  let out = `<rect x="${x - 3}" y="${PIP.y - 2}" width="${total + 6}" height="${PIP.h + 4}" rx="${(PIP.h + 4) / 2}" fill="${color.ink}" fill-opacity=".6"/>`;
  widths.forEach((w, i) => {
    const fill = lit[i] ? `fill="${color.ember}"` : `fill="#fff" fill-opacity="${i === current ? '.9' : '.45'}"`;
    out += `<rect x="${x}" y="${PIP.y}" width="${w}" height="${PIP.h}" rx="${PIP.h / 2}" ${fill}/>`;
    x += w + PIP.gap;
  });
  return out;
}

function renderCover(spec: CoverTileSpec, { L }: Ctx): string {
  const [c1, c2] = spec.gradient ?? coverFallback;
  let defs =
    `<linearGradient id="sc" x1="0" y1="0" x2="0" y2="1"><stop offset=".4" stop-color="${color.ink}" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="${color.ink}" stop-opacity=".93"/></linearGradient>`;
  let body: string;
  if (spec.image) {
    defs += `<clipPath id="cr"><rect width="${S}" height="${S}" rx="${R}"/></clipPath>`;
    body =
      `<rect width="${S}" height="${S}" rx="${R}" fill="${color.raised}"/>` +
      `<image xlink:href="${escapeXml(spec.image)}" width="${S}" height="${S}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cr)"/>`;
  } else {
    defs += `<linearGradient id="cv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
    body =
      `<rect width="${S}" height="${S}" rx="${R}" fill="url(#cv)"/>` +
      `<circle cx="48" cy="20" r="22" fill="#fff" fill-opacity=".10"/>` +
      `<circle cx="16" cy="44" r="16" fill="${color.ink}" fill-opacity=".18"/>`;
  }
  if (spec.paused) body += `<rect width="${S}" height="${S}" rx="${R}" fill="${color.ink}" fill-opacity=".55"/>`;
  body += `<rect width="${S}" height="${S}" rx="${R}" fill="url(#sc)"/>`;
  if (spec.glyph) {
    const dy = L.badgeCy - geo.badge.cy;
    const glyph = dy === 0 ? coverGlyphs[spec.glyph] : `<g transform="translate(0 ${dy})">${coverGlyphs[spec.glyph]}</g>`;
    body += `<circle cx="${geo.badge.cx}" cy="${L.badgeCy}" r="${L.coverBadgeR}" fill="${color.ink}" fill-opacity=".55"/>${glyph}`;
  }
  if (spec.pips) body += coverPips(spec.pips);
  body += `<rect ${FRAME} stroke="#fff" stroke-opacity=".10"/>`;
  body += textLines(L, spec.name, spec.status, color.text, color.text2, L.coverNameY, L.coverStatusY);
  return wrap(defs, body);
}

// ---- public API ---------------------------------------------------------------------------------

export function renderTile(spec: TileSpec, options: RenderOptions = {}): string {
  const ctx: Ctx = { L: options.layout ?? layouts.deck, surface: options.surface ?? deckSurface };
  switch (spec.template) {
    case 'icon':
      return renderIcon(spec, ctx);
    case 'value':
      return renderValue(spec, ctx);
    case 'cover':
      return renderCover(spec, ctx);
  }
}
