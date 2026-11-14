// Simple logger writing to stderr - the plugin process is started and
// supervised by OpenDeck, which captures the process output into
// its own log files (look there when debugging).

import { redactUrlCredentials } from '@miwoli/deck-core';

const PREFIX = '[ha-map]';

const redact = (a: unknown): unknown => (typeof a === 'string' ? redactUrlCredentials(a) : a);

export function logInfo(...args: unknown[]): void {
  console.error(PREFIX, ...args.map(redact));
}

export function logError(...args: unknown[]): void {
  console.error(PREFIX, '[error]', ...args.map(redact));
}
