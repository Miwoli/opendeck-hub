import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ExecError, ProcessGroup, launchDetached, run } from '../src/exec.ts';

const node = process.execPath;

describe('run (execFile wrapper)', () => {
  it('passes arguments verbatim, without a shell', async () => {
    const tricky = '$(echo pwned); `id` && echo "x" | cat';
    const res = await run(node, ['-e', 'process.stdout.write(process.argv[1])', tricky]);
    assert.equal(res.stdout, tricky);
    assert.equal(res.code, 0);
  });

  it('rejects non-zero exit with ExecError(reason=exit)', async () => {
    await assert.rejects(run(node, ['-e', 'process.stderr.write("bad"); process.exit(3)']), (err: unknown) => {
      assert.ok(err instanceof ExecError);
      assert.equal(err.reason, 'exit');
      assert.equal(err.result.code, 3);
      assert.equal(err.result.stderr, 'bad');
      return true;
    });
  });

  it('allowFailure resolves with the exit code', async () => {
    const res = await run(node, ['-e', 'process.exit(2)'], { allowFailure: true });
    assert.equal(res.code, 2);
  });

  it('kills on timeout', async () => {
    await assert.rejects(run(node, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 150 }), (err: unknown) => {
      assert.ok(err instanceof ExecError);
      assert.equal(err.reason, 'timeout');
      return true;
    });
  });

  it('reports a missing binary as spawn error', async () => {
    await assert.rejects(run('definitely-not-a-binary-xyz', []), (err: unknown) => {
      assert.ok(err instanceof ExecError);
      assert.equal(err.reason, 'spawn');
      return true;
    });
  });

  it('validates arguments', () => {
    assert.throws(() => run('', []), TypeError);
    assert.throws(() => run(node, 'a b' as unknown as string[]), TypeError);
  });

  it('supports AbortSignal', async () => {
    const ac = new AbortController();
    const p = run(node, ['-e', 'setTimeout(() => {}, 10000)'], { signal: ac.signal });
    ac.abort();
    await assert.rejects(p, (err: unknown) => err instanceof ExecError && err.reason === 'aborted');
  });
});

describe('ProcessGroup', () => {
  it('tracks running children and kills them all', async () => {
    const group = new ProcessGroup();
    const a = group.run(node, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 20000 });
    const b = group.run(node, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 20000 });
    assert.equal(group.size, 2);
    group.killAll();
    const results = await Promise.allSettled([a, b]);
    assert.ok(results.every((r) => r.status === 'rejected'));
    assert.equal(group.size, 0);
  });

  it('forgets finished children', async () => {
    const group = new ProcessGroup();
    await group.run(node, ['-e', '0']);
    assert.equal(group.size, 0);
  });
});

describe('launchDetached', () => {
  it('returns as soon as the process spawned, without waiting for it', async () => {
    const started = Date.now();
    const pid = await launchDetached(node, ['-e', 'setTimeout(() => {}, 3000)']);
    assert.ok(pid > 0);
    assert.ok(Date.now() - started < 1000);
    process.kill(pid, 'SIGTERM');
  });
  it('rejects for a missing binary and validates arguments', async () => {
    await assert.rejects(launchDetached('definitely-not-a-binary-xyz', []), (err: unknown) => err instanceof ExecError && err.reason === 'spawn');
    assert.throws(() => launchDetached(node, 'x' as unknown as string[]), TypeError);
  });
});
