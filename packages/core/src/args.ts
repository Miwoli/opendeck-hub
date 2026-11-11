// Launch arguments: OpenDeck runs `node bin/plugin.cjs -port <p> -pluginUUID <uuid>
// -registerEvent registerPlugin -info <json>` (src-tauri/src/plugins/mod.rs).
// Note: pluginUUID is the plugin directory name, e.g. "com.miwoli.ha-map.sdPlugin".

import { isObject } from './protocol.ts';

export interface PluginArgs {
  port: number;
  pluginUUID: string;
  registerEvent: string;
  info: Record<string, unknown>;
}

export function parsePluginArgs(argv: readonly string[]): PluginArgs {
  const get = (flag: string): string => {
    const i = argv.indexOf(flag);
    const value = i === -1 ? undefined : argv[i + 1];
    if (value === undefined) throw new Error(`Missing launch argument ${flag}`);
    return value;
  };
  const port = Number(get('-port'));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`Invalid -port: ${get('-port')}`);

  let info: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(get('-info'));
    if (isObject(parsed)) info = parsed;
  } catch {
    // -info is informational only; keep an empty object
  }
  return { port, pluginUUID: get('-pluginUUID'), registerEvent: get('-registerEvent'), info };
}
