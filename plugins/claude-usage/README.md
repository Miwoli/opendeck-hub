# Claude Usage - `com.miwoli.claude-usage`

Two keys that show how much of your Claude.ai message limit is used: the 5-hour **session** limit and the **weekly** limit.
Each key shows the percentage, a progress bar and the reset time ("in 2h 10m", "Sun 22:00"; above 90 % the status reads
"limit · in 40m"). The bar is Mint below 70 %, Ember at 70-90 % and Alert above 90 %, when the whole tile turns red.

| Action | UUID |
|---|---|
| Session (5 h) | `com.miwoli.claude-usage.session` |
| Week (7 d) | `com.miwoli.claude-usage.weekly` |

A short press refreshes (20 s cache), a hold of >= 0.5 s forces a refresh. One request serves both keys. Errors show a
red "!" tile: "Expired" (401/403), "No network", "API error", "set key".

## Important caveat
The plugin uses the **unofficial, internal claude.ai API** that the website itself uses for its usage bar. Anthropic does
not publish an official API for Pro/Max limits, so this is reverse engineering: the endpoint can change or stop working
without notice and its use may violate the terms of service. Use it at your own risk.

Authentication is the `sessionKey` cookie from your browser. It is stored in the plugin's global settings, i.e. as plain
JSON in OpenDeck's configuration directory. That is a conscious trade-off, not a bug.

## Setup
```bash
npm install                                    # once, in the repository root
npm test -w plugins/claude-usage               # build + tests + bundle smoke test
npm run pack -w plugins/claude-usage           # -> plugins/claude-usage/dist/com.miwoli.claude-usage.sdPlugin-<version>.streamDeckPlugin
npm run install-plugin -w plugins/claude-usage # copy into OpenDeck's plugin directory (old copy is backed up)
```
Then in OpenDeck use **Plugins -> Install from file** (or `install-plugin`) and restart OpenDeck. Add the two keys
(category "Claude Usage"), open the Property Inspector, paste your `sessionKey` (browser DevTools -> Application ->
Cookies -> claude.ai -> `sessionKey`, starts with `sk-ant-`) and save. Settings are shared by both keys.

## Troubleshooting
Plugin log: `~/.local/share/opendeck/logs/plugins/com.miwoli.claude-usage.sdPlugin.log` (`[claude-usage]` lines).
A key that stays empty usually means a missing or expired `sessionKey`.

## Layout
```
src/                  plugin code (usage client, shared service, formatting, tiles, actions)
pi/global.html        Property Inspector shared by both actions
scripts/              icon generation
com.miwoli.claude-usage.sdPlugin/   manifest (committed); bin/, images/, pi/ are generated
```
