# DeckBridge - Vencord userplugin (GPL-3.0-or-later)

This directory is derived from Vencord code (GPL-3.0) and is licensed GPL-3.0-or-later, independently of the rest of
`opendeck-hub`. It is not bundled into the OpenDeck plugin; `npm run vencord -w plugins/discord` copies it into
`src/userplugins/` of a Vencord checkout and builds it.

- `index.ts` (Discord renderer): reads `MediaEngineStore` / `VoiceStateStore`, calls `toggleSelfMute` / `toggleSelfDeaf`
  (the same actions as Discord's UI) and publishes the state after every flux event.
- `native.ts` (Vesktop main process): Unix socket `$XDG_RUNTIME_DIR/opendeck-discord.sock` (0600), line-delimited JSON.
  Commands: `toggleMute`, `toggleDeafen`, `pttDown`, `pttUp`, `getState`; reply / event:
  `{"state":{inVoice, selfMute, selfDeaf, serverMute, serverDeaf, mode, ptt}}`.
