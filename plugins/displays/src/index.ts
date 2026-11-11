// Displays (KDE): display layouts through kscreen-doctor (Wayland/KWin).
// Launched by OpenDeck: node bin/plugin.cjs -port <p> -pluginUUID com.miwoli.displays.sdPlugin -registerEvent ... -info ...

import { OpenActionClient, createLogger, parsePluginArgs } from '@miwoli/deck-core';
import { layoutAction } from './actions/layout.ts';

const log = createLogger('displays');
const client = new OpenActionClient(parsePluginArgs(process.argv.slice(2)), { logger: log });
const layout = layoutAction({ client, log });

client.register(layout);
client.on('gaveUp', () => process.exit(1));

function shutdown(): void {
  layout.dispose();
  client.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

client.connect();
