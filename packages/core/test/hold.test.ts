import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { HoldToConfirm, type HoldView } from '../src/hold.ts';

describe('HoldToConfirm', () => {
  let now = 0;
  let views: HoldView[];
  let confirmed: number;
  let hold: HoldToConfirm;

  beforeEach(() => {
    mock.timers.reset();
    mock.timers.enable({ apis: ['setTimeout'] });
    now = 0;
    views = [];
    confirmed = 0;
    hold = new HoldToConfirm({
      now: () => now,
      onChange: (v) => views.push(v),
      onConfirm: () => {
        confirmed += 1;
      },
    });
  });

  const advance = (ms: number): void => {
    now += ms;
    mock.timers.tick(ms);
  };

  it('short press cancels without confirming', () => {
    hold.keyDown();
    advance(400);
    hold.keyUp();
    assert.deepEqual(hold.state, { phase: 'idle' });
    assert.equal(confirmed, 0);
    assert.deepEqual(views[0], { phase: 'holding', progress: 0 });
    assert.deepEqual(views.at(-1), { phase: 'idle' });
  });

  it('animates progress in tickMs steps up to 1', () => {
    hold.keyDown();
    for (let i = 0; i < 5; i++) advance(200);
    const progress = views.filter((v) => v.phase === 'holding').map((v) => (v.phase === 'holding' ? v.progress : -1));
    assert.deepEqual(progress, [0, 0.2, 0.4, 0.6, 0.8, 1]);
    advance(2000);
    assert.equal(views.length, 6, 'no frames after reaching 1');
  });

  it('hold >= 1 s then release -> confirm countdown 3,2,1 -> idle', () => {
    hold.keyDown();
    advance(1000);
    hold.keyUp();
    assert.deepEqual(hold.state, { phase: 'confirm', secondsLeft: 3 });
    advance(1000);
    assert.deepEqual(hold.state, { phase: 'confirm', secondsLeft: 2 });
    advance(1000);
    assert.deepEqual(hold.state, { phase: 'confirm', secondsLeft: 1 });
    advance(1000);
    assert.deepEqual(hold.state, { phase: 'idle' });
    assert.equal(confirmed, 0);
  });

  it('press during confirm runs onConfirm once and swallows its keyUp', async () => {
    hold.keyDown();
    advance(1200);
    hold.keyUp();
    advance(500);
    hold.keyDown();
    assert.deepEqual(hold.state, { phase: 'idle' });
    hold.keyUp();
    assert.deepEqual(hold.state, { phase: 'idle' });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(confirmed, 1);
  });

  it('measures keyDown->keyUp, not timer ticks', () => {
    hold.keyDown();
    now += 1100; // time passes without timers firing (e.g. event loop stall)
    hold.keyUp();
    assert.equal(hold.state.phase, 'confirm');
  });

  it('cancel() (willDisappear) stops everything', () => {
    hold.keyDown();
    advance(1000);
    hold.keyUp();
    hold.cancel();
    assert.deepEqual(hold.state, { phase: 'idle' });
    const count = views.length;
    advance(5000);
    assert.equal(views.length, count, 'no timers left');
  });

  it('reports onConfirm errors through onError', async () => {
    const errors: unknown[] = [];
    const h = new HoldToConfirm({
      now: () => now,
      onChange: () => undefined,
      onConfirm: () => Promise.reject(new Error('boom')),
      onError: (e) => errors.push(e),
    });
    h.keyDown();
    now += 1000;
    h.keyUp();
    h.keyDown();
    await new Promise<void>((r) => setImmediate(r));
    assert.equal(errors.length, 1);
  });
});
