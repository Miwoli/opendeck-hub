// Games: Steam/Lutris libraries, recently played, game mode toggle, close game.

import { OpenActionClient, createLogger, parsePluginArgs, readString } from '@miwoli/deck-core';
import { closeGameAction } from './actions/closegame.ts';
import { gameModeAction } from './actions/gamemode.ts';
import { launcherAction } from './actions/launcher.ts';
import { recentAction } from './actions/recent.ts';
import { createContext } from './context.ts';
import { DEFAULT_LUTRIS_EXCLUDE } from './library.ts';

const log = createLogger('games');
const client = new OpenActionClient(parsePluginArgs(process.argv.slice(2)), { logger: log });
const ctx = createContext(client, log);
const recent = recentAction(ctx);
const close = closeGameAction(ctx);

client.register(launcherAction(ctx), recent, gameModeAction(ctx), close);
client.on('globalSettings', (g) => {
  const raw = readString(g, 'lutrisExclude', '');
  ctx.setExclude(raw.trim() ? raw.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_LUTRIS_EXCLUDE);
});
client.on('gaveUp', () => process.exit(1));

function shutdown(): void {
  recent.dispose();
  close.dispose();
  client.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

client.connect();
