// Hold-to-confirm (used by Power and Close game). Hold is measured keyDown -> keyUp:
//   keyDown            -> holding (progress animates 0..1 over holdMs)
//   keyUp < holdMs     -> idle (cancelled)
//   keyUp >= holdMs    -> confirm ("press · 3", counts down once per second)
//   keyDown in confirm -> onConfirm() and back to idle
//   countdown reaches 0 or cancel() (willDisappear) -> idle

export type HoldView =
  | { phase: 'idle' }
  | { phase: 'holding'; progress: number }
  | { phase: 'confirm'; secondsLeft: number };

export interface HoldOptions {
  holdMs?: number;
  confirmSeconds?: number;
  /** Progress redraw interval; each frame is a setImage (= profile write), keep it coarse. */
  tickMs?: number;
  onChange: (view: HoldView) => void;
  onConfirm: () => void | Promise<void>;
  onError?: (err: unknown) => void;
  now?: () => number;
}

export class HoldToConfirm {
  private view: HoldView = { phase: 'idle' };
  private pressedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private swallowKeyUp = false;
  private readonly holdMs: number;
  private readonly confirmSeconds: number;
  private readonly tickMs: number;
  private readonly opts: HoldOptions;
  private readonly now: () => number;

  constructor(opts: HoldOptions) {
    this.opts = opts;
    this.holdMs = opts.holdMs ?? 1000;
    this.confirmSeconds = opts.confirmSeconds ?? 3;
    this.tickMs = opts.tickMs ?? 200;
    this.now = opts.now ?? Date.now;
  }

  get state(): HoldView {
    return this.view;
  }

  keyDown(): void {
    if (this.view.phase === 'confirm') {
      this.swallowKeyUp = true;
      this.set({ phase: 'idle' });
      void Promise.resolve()
        .then(() => this.opts.onConfirm())
        .catch((err: unknown) => this.opts.onError?.(err));
      return;
    }
    if (this.view.phase === 'holding') return;
    this.swallowKeyUp = false;
    this.pressedAt = this.now();
    this.set({ phase: 'holding', progress: 0 });
    this.schedule(this.tickMs, () => this.tickHold());
  }

  keyUp(): void {
    if (this.swallowKeyUp) {
      this.swallowKeyUp = false;
      return;
    }
    if (this.view.phase !== 'holding') return;
    const held = this.now() - this.pressedAt;
    if (held >= this.holdMs) this.startConfirm(this.confirmSeconds);
    else this.set({ phase: 'idle' });
  }

  cancel(): void {
    this.swallowKeyUp = false;
    if (this.view.phase !== 'idle') this.set({ phase: 'idle' });
    else this.clearTimer();
  }

  private tickHold(): void {
    if (this.view.phase !== 'holding') return;
    const progress = Math.min(1, (this.now() - this.pressedAt) / this.holdMs);
    if (progress !== this.view.progress) this.set({ phase: 'holding', progress });
    if (progress < 1) this.schedule(this.tickMs, () => this.tickHold());
  }

  private startConfirm(secondsLeft: number): void {
    if (secondsLeft <= 0) {
      this.set({ phase: 'idle' });
      return;
    }
    this.set({ phase: 'confirm', secondsLeft });
    this.schedule(1000, () => this.startConfirm(secondsLeft - 1));
  }

  private set(view: HoldView): void {
    this.clearTimer();
    this.view = view;
    this.opts.onChange(view);
  }

  private schedule(ms: number, fn: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
