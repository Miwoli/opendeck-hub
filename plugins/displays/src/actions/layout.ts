// com.miwoli.displays.layout - one configurable action, three instances on the Main page:
// Screen 1 (single), Extend (extend), Screen 2 (single). Settings come from the PI.
// kscreen-doctor is polled only while at least one tile is visible; a press applies the layout and re-reads.

import {
  type ActionHandler,
  type JsonObject,
  type Logger,
  type OpenActionClient,
  SettingsStore,
  isObject,
  readEnum,
  readString,
  tileImage,
} from '@miwoli/deck-core';
import {
  type ExtendSnapshot,
  type KscreenRunner,
  type Layout,
  type Output,
  applyLayout,
  layoutArgs,
  parseSnapshot,
  readOutputs,
  snapshotIfExtended,
} from '../kscreen.ts';
import { type LayoutSettings, type TilePhase, defaultLabel, layoutTile } from '../tiles.ts';

export const ACTION = 'com.miwoli.displays.layout';
const POLL_MS = 5000;
const SETTLE_MS = 1500;
const ERROR_MS = 3000;

export function parseLayoutSettings(raw: JsonObject): LayoutSettings {
  const kind = readEnum(raw, 'layout', ['single', 'extend', ''] as const, '');
  const output = readString(raw, 'output', '').trim();
  const layout: Layout | null = kind === 'extend' ? { kind: 'extend' } : kind === 'single' && output ? { kind: 'single', output } : null;
  return { layout, label: readString(raw, 'label', '') };
}

export interface LayoutDeps {
  client: OpenActionClient;
  log: Logger;
  runner?: KscreenRunner;
}

export function layoutAction({ client, log, runner }: LayoutDeps): ActionHandler & { dispose(): void } {
  const settings = new SettingsStore(parseLayoutSettings);
  const phases = new Map<string, TilePhase>();
  let outputs: Output[] | null = null;
  let snapshot: ExtendSnapshot | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let busy = false;

  const draw = (context: string): void => {
    client.setImage(context, tileImage(layoutTile(settings.get(context), outputs, phases.get(context) ?? 'idle')));
  };
  const drawAll = (): void => {
    for (const v of client.visibleInstances(ACTION)) draw(v.context);
  };

  async function refresh(): Promise<void> {
    try {
      outputs = await readOutputs(runner);
      const snap = snapshotIfExtended(outputs);
      if (snap && JSON.stringify(snap) !== JSON.stringify(snapshot)) {
        snapshot = snap;
        const global = await client.getGlobalSettings().catch((): JsonObject => ({}));
        const extend: JsonObject = {
          outputs: snap.outputs.map((o) => ({ name: o.name, x: o.x, y: o.y, priority: o.priority, mode: o.mode, scale: o.scale })),
        };
        client.setGlobalSettings({ ...global, extend });
        log.info(`remembered extended layout ${JSON.stringify(snap)}`);
      }
    } catch (err) {
      if (outputs !== null) log.error('kscreen-doctor read failed', err);
      outputs = null;
    }
    drawAll();
  }

  function schedulePoll(): void {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    if (client.visibleInstances(ACTION).length === 0) return;
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void refresh().finally(schedulePoll);
    }, POLL_MS);
  }

  client.on('globalSettings', (g) => {
    snapshot ??= parseSnapshot(g['extend']);
  });

  function sendOutputsToPi(context: string): void {
    const list = (outputs ?? []).map((o) => ({ name: o.name, connected: o.connected, enabled: o.enabled, width: o.width, height: o.height }));
    const s = settings.get(context);
    client.sendToPropertyInspector(context, { event: 'outputs', outputs: list, defaultLabel: defaultLabel(s.layout, outputs ?? []) });
  }

  return {
    uuid: ACTION,
    willAppear: async (ev) => {
      settings.update(ev.context, ev.payload.settings);
      draw(ev.context);
      if (!snapshot) snapshot = parseSnapshot((await client.getGlobalSettings().catch((): JsonObject => ({})))['extend']);
      await refresh();
      schedulePoll();
    },
    willDisappear: (ev) => {
      settings.delete(ev.context);
      phases.delete(ev.context);
      if (client.visibleInstances(ACTION).length === 0 && pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    },
    didReceiveSettings: (ev) => {
      settings.update(ev.context, ev.payload.settings);
      draw(ev.context);
      sendOutputsToPi(ev.context);
    },
    propertyInspectorDidAppear: async (ev) => {
      await refresh();
      sendOutputsToPi(ev.context);
    },
    sendToPlugin: async (ev) => {
      if (isObject(ev.payload) && ev.payload['event'] === 'getOutputs') {
        await refresh();
        sendOutputsToPi(ev.context);
      }
    },
    keyDown: async (ev) => {
      const { layout } = settings.get(ev.context);
      if (!layout || busy) {
        client.showAlert(ev.context);
        return;
      }
      busy = true;
      try {
        const current = await readOutputs(runner);
        const args = layoutArgs(layout, current, snapshot);
        phases.set(ev.context, 'switching');
        draw(ev.context);
        log.info(`apply ${JSON.stringify(layout)}: kscreen-doctor ${args.join(' ')}`);
        await applyLayout(args, runner);
        // KScreen applies asynchronously; read back after it settles
        await new Promise((r) => setTimeout(r, SETTLE_MS));
        phases.delete(ev.context);
        await refresh();
      } catch (err) {
        log.error('switching layout failed', err);
        phases.set(ev.context, 'error');
        draw(ev.context);
        client.showAlert(ev.context);
        setTimeout(() => {
          phases.delete(ev.context);
          void refresh();
        }, ERROR_MS);
      } finally {
        busy = false;
      }
    },
    dispose() {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    },
  };
}
