# Discord (Vesktop) - `com.miwoli.discord`

Mic, Headphones and Push-to-talk for Discord in **Vesktop**. Muting happens inside Discord itself (other people see the
icon), not in PipeWire. The link is the **DeckBridge** Vencord userplugin (`vencord-userplugin/`, GPL) over a local Unix
socket - no network and no accounts.

| Action | UUID | Behaviour | Tile |
|---|---|---|---|
| Mic | `com.miwoli.discord.mic` | press = toggle mute | On (Mint) / Muted, Server (Alert) |
| Headphones | `com.miwoli.discord.headphones` | press = toggle deafen | On / Muted, Server (Alert) |
| Push to talk | `com.miwoli.discord.ptt` | hold = microphone open | Hold / Talking (Ember) / "set VAD" |

Without Vesktop, or with DeckBridge disabled, the tiles show "offline" (dashed outline) and a press raises an OpenDeck
warning. State is shared by all tiles on all pages.

## Install (one time: Vencord with DeckBridge)

```bash
npm run vencord -w plugins/discord
```
Clones Vencord to `~/.local/share/opendeck-hub/vencord` (override with `VENCORD_DIR=...`), copies DeckBridge into
`src/userplugins/`, then runs `corepack pnpm install` and `pnpm build`. Then:
1. Vesktop -> Settings -> Vesktop Settings -> **Developer Options** -> **Vencord Location** -> pick `…/vencord/dist`.
2. Restart Vesktop and enable **DeckBridge** under Vencord -> Plugins.
3. Discord -> Voice settings: use **Voice Activity** as the input mode. Discord's own push-to-talk only works while the
   window is focused in Vesktop, so the PTT tile unmutes the microphone for as long as it is held. The mute sounds can be
   turned off in Discord -> Notifications -> Sounds.

**DeckBridge missing from the plugin list?** Check that `dist/` was not overwritten with the official Vencord:
```bash
npm run vencord -w plugins/discord -- --check
```
Vesktop replaces the files with the official release when it considers the directory incomplete (`ensureVencordFiles`,
which leaves `dist/package.json` as `{}`) or after "Repair Vencord" in the tray menu. Run
`npm run vencord -w plugins/discord`, quit Vesktop from the tray and start it again. The build uses `--disable-updater`,
so Vencord's updater will not overwrite it by itself.

To go back to the regular Vencord: Developer Options -> Vencord Location -> reset. Updating Vencord means running
`npm run vencord` again (a custom location disables Vesktop's automatic updates).

## OpenDeck plugin

```bash
npm run pack -w plugins/discord   # -> plugins/discord/dist/com.miwoli.discord.sdPlugin-<version>.streamDeckPlugin
npm test -w plugins/discord       # build + tests (tiles, socket client, e2e against fakes) + bundle smoke test
```
OpenDeck -> Plugins -> "Install from file", restart OpenDeck, and use the actions from the "Discord" category.

## Logs
- Plugin: `~/.local/share/opendeck/logs/plugins/com.miwoli.discord.sdPlugin.log` - `bridge connected`, `discord state {...}`,
  `discord offline`, `bridge unavailable: ENOENT` (Vesktop is not running or DeckBridge is disabled).
- Vesktop: DevTools console (Ctrl+Shift+I), prefix `[DeckBridge]` (`listening on …`).
- Socket: `ls -l $XDG_RUNTIME_DIR/opendeck-discord.sock` (exists only while Vesktop and DeckBridge run).
