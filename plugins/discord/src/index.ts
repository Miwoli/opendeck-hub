// Discord (Vesktop) plugin: mic / headphones / push-to-talk through the DeckBridge Vencord userplugin.
// Launched by OpenDeck: node bin/plugin.cjs -port <p> -pluginUUID com.miwoli.discord.sdPlugin -registerEvent ... -info ...

import { OpenActionClient, createLogger, parsePluginArgs } from '@miwoli/deck-core';
import { drawHeadphones, headphonesAction } from './actions/headphones.ts';
import { drawMic, micAction } from './actions/mic.ts';
import { drawPtt, pttAction } from './actions/ptt.ts';
import { BridgeClient } from './bridge.ts';
import { ACTIONS, type PluginContext, createContext } from './context.ts';

const log = createLogger('discord');
const client = new OpenActionClient(parsePluginArgs(process.argv.slice(2)), { logger: log });
const bridge = new BridgeClient({ logger: log });

const ctx: PluginContext = createContext(client, bridge, {
  [ACTIONS.mic]: (context) => drawMic(ctx, context),
  [ACTIONS.headphones]: (context) => drawHeadphones(ctx, context),
  [ACTIONS.ptt]: (context) => drawPtt(ctx, context),
});

client.register(micAction(ctx), headphonesAction(ctx), pttAction(ctx));

bridge.on('state', (state) => {
  log.info(state ? `discord state ${JSON.stringify(state)}` : 'discord offline');
  for (const action of Object.values(ACTIONS)) ctx.render(action);
});

client.on('connected', () => {
  for (const action of Object.values(ACTIONS)) ctx.render(action);
});
client.on('gaveUp', () => process.exit(1));

function shutdown(): void {
  bridge.send('pttUp');
  bridge.stop();
  client.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

client.connect();
