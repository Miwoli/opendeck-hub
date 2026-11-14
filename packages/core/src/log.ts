// OpenDeck redirects plugin stdout/stderr to ~/.local/share/opendeck/logs/plugins/<UUID>.sdPlugin.log,
// so plain console output is the log. Prefix with a tag to make grepping easy.

export interface Logger {
  info(message: string, ...details: unknown[]): void;
  warn(message: string, ...details: unknown[]): void;
  error(message: string, ...details: unknown[]): void;
}

/** Masks `user:password@` in URLs: error messages (e.g. fetch's "URL includes credentials") can echo the full URL. */
export function redactUrlCredentials(text: string): string {
  return text.replace(/(\/\/)[^/\s@]+@/g, '$1***@');
}

function describe(detail: unknown): string {
  if (detail instanceof Error) return detail.stack ?? detail.message;
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export function createLogger(tag: string): Logger {
  const line = (level: string, message: string, details: unknown[]): string =>
    redactUrlCredentials([`${new Date().toISOString()} [${tag}] [${level}] ${message}`, ...details.map(describe)].join(' '));
  return {
    info: (m, ...d) => console.log(line('info', m, d)),
    warn: (m, ...d) => console.warn(line('warn', m, d)),
    error: (m, ...d) => console.error(line('error', m, d)),
  };
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
