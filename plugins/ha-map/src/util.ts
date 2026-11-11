// Small helpers shared by the whole plugin: validation of data of unknown
// shape (messages from OpenDeck and Home Assistant), XML escaping for SVG
// and a scheduler for deferred refreshes.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface Scheduler {
  /** Runs the function after `delayMs`; does nothing if an earlier deadline is already scheduled. */
  schedule(delayMs: number): void;
  cancel(): void;
}

export function createScheduler(fn: () => void): Scheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dueAt = Number.POSITIVE_INFINITY;
  return {
    schedule(delayMs: number): void {
      const at = Date.now() + Math.max(0, delayMs);
      if (timer && dueAt <= at) return;
      if (timer) clearTimeout(timer);
      dueAt = at;
      timer = setTimeout(
        () => {
          timer = null;
          dueAt = Number.POSITIVE_INFINITY;
          fn();
        },
        Math.max(0, delayMs),
      );
    },
    cancel(): void {
      if (timer) clearTimeout(timer);
      timer = null;
      dueAt = Number.POSITIVE_INFINITY;
    },
  };
}
