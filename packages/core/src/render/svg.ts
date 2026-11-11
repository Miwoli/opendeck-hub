// Low-level SVG helpers: escaping, approximate text measuring/ellipsis and data: URIs.

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Rough per-character advance widths (in em) for Manrope; good enough to decide when to ellipsize.
const NARROW = new Set([...'il.,:;\'!|ı\u0142ľ ']);
const SEMI = new Set([...'fjrtI()[]-"']);
const WIDE = new Set([...'mwMW\u015a@%']);

export function charWidthEm(ch: string): number {
  if (NARROW.has(ch)) return 0.28;
  if (SEMI.has(ch)) return 0.38;
  if (WIDE.has(ch)) return 0.86;
  if (/\p{Lu}/u.test(ch)) return 0.68;
  if (/[0-9]/.test(ch)) return 0.6;
  return 0.56;
}

export function measureText(text: string, fontSize: number, bold = false): number {
  let em = 0;
  for (const ch of text) em += charWidthEm(ch);
  return em * fontSize * (bold ? 1.05 : 1);
}

/** Truncates with an ellipsis so the text fits `maxWidth` (approximate, see charWidthEm). */
export function fitText(text: string, maxWidth: number, fontSize: number, bold = false): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (measureText(clean, fontSize, bold) <= maxWidth) return clean;
  const chars = [...clean];
  while (chars.length > 0 && measureText(`${chars.join('').trimEnd()}…`, fontSize, bold) > maxWidth) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/** Rounds to 2 decimals and drops trailing zeros, keeping markup short and deterministic. */
export function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}
