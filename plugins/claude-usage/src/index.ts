// Claude Usage: session (5 h) and weekly limits of a Claude.ai account on two keys.
// Uses an unofficial claude.ai endpoint (see the plugin README).

import { type JsonObject, OpenActionClient, createLogger, parsePluginArgs } from '@miwoli/deck-core';
import { settingsLoader, usageAction } from './actions/usage.ts';
import { UsageService } from './usageService.ts';

const log = createLogger('claude-usage');
const client = new OpenActionClient(parsePluginArgs(process.argv.slice(2)), { logger: log });
const service = new UsageService();
const settings = settingsLoader(client);

const session = usageAction({ uuid: 'com.miwoli.claude-usage.session', limit: 'five_hour', name: 'Session' }, { client, log, service, settings });
const weekly = usageAction({ uuid: 'com.miwoli.claude-usage.weekly', limit: 'seven_day', name: 'Week' }, { client, log, service, settings });
const actions = [session, weekly];

// one fetch serves both keys
service.onUpdate(() => {
  for (const a of actions) void a.refreshAll(false);
});

service.onOrgIdResolved(async (orgId) => {
  const current = await client.getGlobalSettings().catch((): JsonObject => ({}));
  if (current['orgId'] === orgId) return;
  client.setGlobalSettings({ ...current, orgId });
  log.info('orgId resolved and saved');
});

client.register(...actions);
client.on('globalSettings', () => {
  service.invalidate();
  for (const a of actions) void a.refreshAll(true);
});
client.on('gaveUp', () => process.exit(1));

function shutdown(): void {
  for (const a of actions) a.dispose();
  client.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

client.connect();
