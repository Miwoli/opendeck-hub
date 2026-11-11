# @miwoli/deck-core

Shared library of the hub plugins. No runtime dependency except `ws`; it is bundled into each plugin with esbuild (`cjs`).
Sources are TypeScript with `.ts` imports, so Node >= 22.18 runs the tests and the preview without a compile step.

| Module | Provides |
|---|---|
| `protocol.ts` | OpenAction event types verified against `nekename/OpenDeck`, plus `parseInboundEvent()` (validation of untrusted JSON) |
| `args.ts` | `parsePluginArgs()` for `-port -pluginUUID -registerEvent -info` |
| `client.ts` | `OpenActionClient`: registration, reconnect with backoff, routing by action UUID, visible contexts (`visibleInstances()`), `setImage` with hash de-duplication and per-context throttling, global settings |
| `settings.ts` | Validators (`readString/Number/Boolean/Enum`) and a per-context `SettingsStore<T>` |
| `render/` | Nocturne tile renderer (default `layouts.deck` on black; `layouts.design` is the original): Icon / Value / Cover templates, tones, bar thresholds, temperature scale, `usageTile`, `errorTile`, `offlineValueTile`, `holdTile`, `tileImage()` -> `data:` URI |
| `hold.ts` | `HoldToConfirm`: hold 1 s (keyDown -> keyUp), then a 3 s confirmation countdown |
| `exec.ts` | `run()` / `ProcessGroup`: `execFile` only, with an argument array, a timeout and `killAll()` for `willDisappear` |
| `log.ts` | stdout logger (OpenDeck writes it to `logs/plugins/<UUID>.sdPlugin.log`) |

## Usage sketch

```ts
import { OpenActionClient, parsePluginArgs, tileImage, usageTile, createLogger } from '@miwoli/deck-core';

const log = createLogger('claude-usage');
const client = new OpenActionClient(parsePluginArgs(process.argv.slice(2)), { logger: log });
client.register({
  uuid: 'com.miwoli.claude-usage.session',
  willAppear: (ev) => client.setImage(ev.context, tileImage(usageTile({ percent: 34, name: 'Session', status: 'in 2h 10m' }))),
});
client.on('gaveUp', () => process.exit(1));
client.connect();
```

## Commands

```bash
npm test -w packages/core        # node --test (renderer, hold, exec, client against a fake OpenDeck, settings)
npm run typecheck -w packages/core
npm run preview                  # dist/preview/index.html + dist/preview/png/*.png
```

The state gallery (`render/gallery.ts`) lists every tile state; add new states there so they appear in the preview and in
the structural tests.
