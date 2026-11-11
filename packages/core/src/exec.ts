// Safe child-process wrapper: execFile only (never a shell), argument arrays, mandatory timeout,
// and a ProcessGroup that kills everything still running when an action disappears or the plugin exits.

import { type ChildProcess, execFile, spawn } from 'node:child_process';

export interface RunOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  signal?: AbortSignal;
  /** Resolve instead of reject on non-zero exit code. */
  allowFailure?: boolean;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class ExecError extends Error {
  readonly result: RunResult;
  readonly reason: 'exit' | 'timeout' | 'spawn' | 'aborted';

  constructor(message: string, result: RunResult, reason: ExecError['reason']) {
    super(message);
    this.name = 'ExecError';
    this.result = result;
    this.reason = reason;
  }
}

export const DEFAULT_TIMEOUT_MS = 10_000;

function assertArgs(file: string, args: readonly string[]): void {
  if (typeof file !== 'string' || file.length === 0) throw new TypeError('run(): file must be a non-empty string');
  if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
    throw new TypeError('run(): args must be an array of strings');
  }
}

/** Starts `file` with `args` and returns the child plus a promise of its result. */
export function spawnRun(file: string, args: readonly string[], options: RunOptions = {}): { child: ChildProcess; result: Promise<RunResult> } {
  assertArgs(file, args);
  let child: ChildProcess | undefined;
  const result = new Promise<RunResult>((resolve, reject) => {
    child = execFile(
      file,
      [...args],
      {
        shell: false,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        killSignal: 'SIGTERM',
        maxBuffer: options.maxBuffer ?? 4 * 1024 * 1024,
        encoding: 'utf8',
        windowsHide: true,
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.env !== undefined ? { env: options.env } : {}),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      },
      (error, stdout, stderr) => {
        const exitCode = typeof child?.exitCode === 'number' ? child.exitCode : -1;
        const res: RunResult = { stdout, stderr, code: error ? exitCode : 0 };
        if (!error) return resolve(res);
        const err = error as NodeJS.ErrnoException & { killed?: boolean; code?: string | number };
        if (err.name === 'AbortError') return reject(new ExecError(`${file}: aborted`, res, 'aborted'));
        if (err.killed && child?.signalCode === 'SIGTERM') {
          return reject(new ExecError(`${file}: timed out`, res, 'timeout'));
        }
        if (typeof err.code === 'string') return reject(new ExecError(`${file}: ${err.message}`, res, 'spawn'));
        if (options.allowFailure) return resolve(res);
        reject(new ExecError(`${file} exited with code ${res.code}: ${stderr.trim()}`, res, 'exit'));
      },
    );
  });
  if (!child) throw new Error('execFile did not return a child process');
  return { child, result };
}

export function run(file: string, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
  return spawnRun(file, args, options).result;
}

/** Tracks running children so they can be killed together (willDisappear / plugin shutdown). */
export class ProcessGroup {
  private readonly children = new Set<ChildProcess>();

  run(file: string, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
    const { child, result } = spawnRun(file, args, options);
    this.children.add(child);
    const forget = (): void => {
      this.children.delete(child);
    };
    result.then(forget, forget);
    return result;
  }

  get size(): number {
    return this.children.size;
  }

  killAll(signal: NodeJS.Signals = 'SIGTERM'): void {
    for (const child of this.children) if (child.exitCode === null) child.kill(signal);
    this.children.clear();
  }
}

/**
 * Starts a GUI application/game and does not wait for it (Steam, Lutris, games must outlive any timeout and the
 * plugin). Argument array, no shell; resolves once the process has spawned, rejects if the binary is missing.
 */
export function launchDetached(file: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<number> {
  assertArgs(file, args);
  return new Promise((resolve, reject) => {
    const child = spawn(file, [...args], {
      shell: false,
      detached: true,
      stdio: 'ignore',
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options.env !== undefined ? { env: options.env } : {}),
    });
    child.once('error', (err) => reject(new ExecError(`${file}: ${err.message}`, { stdout: '', stderr: '', code: -1 }, 'spawn')));
    child.once('spawn', () => {
      child.unref();
      resolve(child.pid ?? -1);
    });
  });
}
