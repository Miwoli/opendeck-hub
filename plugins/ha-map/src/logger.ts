// Simple logger writing to stderr - the plugin process is started and
// supervised by OpenDeck, which captures the process output into
// its own log files (look there when debugging).

const PREFIX = '[ha-map]';

export function logInfo(...args: unknown[]): void {
  console.error(PREFIX, ...args);
}

export function logError(...args: unknown[]): void {
  console.error(PREFIX, '[error]', ...args);
}
