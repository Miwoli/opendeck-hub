# Home Assistant - `com.miwoli.homeassistant`

The **Temperature (+ light)** action (`com.miwoli.homeassistant.temperature`) shows a Home Assistant temperature sensor in
a colour taken from a scale, with a bar over a range set in the Property Inspector (default 10-30 °C), a room label
(default "Office") and the light state ("light on" in Ember / "light off"). Pressing calls `homeassistant.toggle` on the
selected entity (light / switch / input_boolean).

- Connection: Home Assistant WebSocket API (long-lived token), `get_states` + `subscribe_events state_changed`; only while
  the tile is visible, reconnecting with backoff. States: "Offline" (dashed outline), "no data", "set in PI", "bad token" (Alert).
- Property Inspector: sensor and toggle entity (suggestions from Home Assistant), label and bar range; Home Assistant URL
  and token (shared). The **"Use the URL and token from HA Map"** button copies them from the `com.miwoli.ha-map` settings
  (`~/.config/opendeck/settings/com.miwoli.ha-map.sdPlugin.json`); the token never goes back to the PI.
- The token is stored in OpenDeck's plugin settings (plain JSON on disk).
- Pickers are `<select>` elements rather than a `<datalist>`: a large, periodically rebuilt datalist froze OpenDeck (see
  `docs/notes/opendeck-profile-switching-notes.md`).
- A person's location tile lives in `com.miwoli.ha-map` (`.person`).

```bash
npm test -w plugins/homeassistant      # build + tests (tile, settings, e2e against a fake Home Assistant) + bundle smoke test
npm run pack -w plugins/homeassistant
npm run install-plugin -w plugins/homeassistant
```
Select a temperature sensor and the entity to toggle in the Property Inspector.
Log: `~/.local/share/opendeck/logs/plugins/com.miwoli.homeassistant.sdPlugin.log` (`Home Assistant: connected`, `toggle …`).
