// Home Assistant: temperature tile that toggles a light.

import { OpenActionClient, createLogger, parsePluginArgs } from '@miwoli/deck-core';
import { temperatureAction } from './actions/temperature.ts';
import { HaClient } from './haClient.ts';

const log = createLogger('homeassistant');
const client = new OpenActionClient(parsePluginArgs(process.argv.slice(2)), { logger: log });
const temperature = temperatureAction({ client, log, ha: new HaClient(log) });

client.register(temperature);
client.on('gaveUp', () => process.exit(1));

function shutdown(): void {
  temperature.dispose();
  client.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

client.connect();
