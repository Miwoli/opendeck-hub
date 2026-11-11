// Person avatars from Home Assistant (the entity_picture attribute of person.* entities).
// The picture is fetched from the Home Assistant server with an Authorization header and kept
// in memory as a data: URI. Security: the token is sent ONLY to an address
// with the same origin as the configured Home Assistant URL - external
// URLs (e.g. gravatar) are ignored and the key shows an initial.

import { logError } from '../logger.js';
import type { AvatarImage } from '../render.js';
import { sniffMime } from '../tiles.js';
import type { HaConnectionSettings } from './haClient.js';

const MAX_BYTES = 2_000_000;
const MAX_ENTRIES = 16;
const NEGATIVE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8000;

/** Returns candidate URLs: the smaller variant (256x256) before the original; null when the address is outside the Home Assistant server. */
export function avatarCandidates(picture: string, haUrl: string): string[] | null {
  try {
    const base = new URL(`${haUrl}/`);
    const url = new URL(picture, base);
    if (url.origin !== base.origin) return null;
    const original = url.toString();
    const small = new URL(original);
    small.pathname = small.pathname.replace(/\/\d+x\d+$/, '/256x256');
    const smaller = small.toString();
    return smaller === original ? [original] : [smaller, original];
  } catch {
    return null;
  }
}

export class AvatarCache {
  private readonly cache = new Map<string, AvatarImage>();
  private readonly failedUntil = new Map<string, number>();
  private readonly pending = new Set<string>();

  constructor(
    private readonly getSettings: () => HaConnectionSettings,
    private readonly onLoaded: () => void,
  ) {}

  /** Returns the avatar from the cache or null (a background download then starts and onLoaded is called after it). */
  get(picture: string | null): AvatarImage | null {
    const { haUrl, token } = this.getSettings();
    if (!picture || !haUrl || !token) return null;
    const key = `${haUrl}|${picture}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (this.pending.has(key) || (this.failedUntil.get(key) ?? 0) > Date.now()) return null;

    this.pending.add(key);
    void this.load(key, picture, haUrl, token).finally(() => this.pending.delete(key));
    return null;
  }

  private async load(key: string, picture: string, haUrl: string, token: string): Promise<void> {
    const candidates = avatarCandidates(picture, haUrl);
    if (!candidates) {
      this.failedUntil.set(key, Number.MAX_SAFE_INTEGER);
      return;
    }
    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const mime = buf.length <= MAX_BYTES ? sniffMime(buf) : null;
        if (!mime) continue;
        this.cache.set(key, { mime, b64: buf.toString('base64') });
        while (this.cache.size > MAX_ENTRIES) {
          const oldest = this.cache.keys().next().value;
          if (oldest === undefined) break;
          this.cache.delete(oldest);
        }
        this.onLoaded();
        return;
      } catch (err) {
        logError('Avatar:', err instanceof Error ? err.message : String(err));
      }
    }
    this.failedUntil.set(key, Date.now() + NEGATIVE_TTL_MS);
  }
}
