// System: power off (hold to confirm), screenshot (spectacle) and clock.

import { OpenActionClient, createLogger, parsePluginArgs } from '@miwoli/deck-core';
import { clockAction } from './actions/clock.ts';
import { poweroffAction } from './actions/poweroff.ts';
import { screenshotAction } from './actions/screenshot.ts';

const log = createLogger('system');
const client = new OpenActionClient(parsePluginArgs(process.argv.slice(2)), { logger: log });
const actions = [poweroffAction({ client, log }), screenshotAction({ client, log }), clockAction({ client })];

client.register(...actions);
client.on('gaveUp', () => process.exit(1));

function shutdown(): void {
  for (const a of actions) a.dispose();
  client.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

client.connect();
