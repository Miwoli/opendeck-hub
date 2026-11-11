// Shared plugin state: one bridge connection for all three actions (state is common to both deck pages).
// The bridge runs only while at least one Discord tile is visible.

import type { OpenActionClient } from '@miwoli/deck-core';
import type { BridgeClient } from './bridge.ts';

export const ACTIONS = {
  mic: 'com.miwoli.discord.mic',
  headphones: 'com.miwoli.discord.headphones',
  ptt: 'com.miwoli.discord.ptt',
} as const;

const STOP_DELAY_MS = 3000;

export interface PluginContext {
  client: OpenActionClient;
  bridge: BridgeClient;
  /** Redraws every visible tile of one action. */
  render(action: string): void;
  /** Starts the bridge when something becomes visible; stops it shortly after the last tile disappears. */
  updateBridge(): void;
}

export function createContext(client: OpenActionClient, bridge: BridgeClient, renderers: Record<string, (context: string) => void>): PluginContext {
  let stopTimer: NodeJS.Timeout | null = null;
  const anyVisible = (): boolean => Object.values(ACTIONS).some((a) => client.visibleInstances(a).length > 0);

  return {
    client,
    bridge,
    render(action) {
      const draw = renderers[action];
      if (!draw) return;
      for (const v of client.visibleInstances(action)) draw(v.context);
    },
    updateBridge() {
      if (anyVisible()) {
        if (stopTimer) clearTimeout(stopTimer);
        stopTimer = null;
        bridge.start();
      } else if (bridge.active && !stopTimer) {
        // profile switches send willDisappear before willAppear; don't drop the socket in between
        stopTimer = setTimeout(() => {
          stopTimer = null;
          if (!anyVisible()) bridge.stop();
        }, STOP_DELAY_MS);
      }
    },
  };
}
