// Media: now playing (MPRIS) with cover art. Launched by OpenDeck with the standard -port/-pluginUUID/... arguments.

import { OpenActionClient, createLogger, parsePluginArgs } from '@miwoli/deck-core';
import { playerAction } from './actions/player.ts';

const log = createLogger('media');
const client = new OpenActionClient(parsePluginArgs(process.argv.slice(2)), { logger: log });
const player = playerAction({ client, log });

client.register(player);
client.on('gaveUp', () => process.exit(1));

function shutdown(): void {
  player.dispose();
  client.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

client.connect();
