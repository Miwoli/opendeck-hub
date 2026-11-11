// Raster images for tiles (covers, avatars): magic-byte check and data: URI. No decoding - images are embedded
// as-is in the tile SVG, so only formats every webview understands are accepted.

export function sniffMime(buf: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

export function imageDataUri(buf: Uint8Array): string | null {
  const mime = sniffMime(buf);
  return mime ? `data:${mime};base64,${Buffer.from(buf).toString('base64')}` : null;
}
