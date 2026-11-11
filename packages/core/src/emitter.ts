// Tiny typed event emitter (node:events is untyped by event name).

export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(name: K, listener: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  protected emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of [...set]) (listener as (p: Events[K]) => void)(payload);
  }
}
