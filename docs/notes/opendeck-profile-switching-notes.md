# Profile switching, visibility and Property Inspector pitfalls in OpenDeck

Verified in the `nekename/OpenDeck` sources (`src-tauri/src/events/inbound/mod.rs`, `inbound/misc.rs`,
`frontend/profiles.rs`, `outbound/mod.rs`, `outbound/keypad.rs`, `inbound/states.rs`, `store/profiles.rs`,
`src/components/Key.svelte`, `plugins/com.amansprojects.starterpack.sdPlugin/src/switch_profile.rs`).

**Checked against:** [`nekename/OpenDeck@3ddecc1`](https://github.com/nekename/OpenDeck/tree/3ddecc1) (v2.14.2),
re-checked 2026-11-14. Behaviour seen live (the Property Inspector freeze, context reuse) was on OpenDeck 2.14.0 (native).

## Can a custom plugin switch the profile? No
- The `switchProfile` event (`{event, device, profile}`) is silently dropped for every plugin except
  `com.amansprojects.starterpack.sdPlugin` and `opendeck_alternative_elgato_implementation`.
- The user switches profiles with the built-in Starter Pack action (`com.amansprojects.starterpack.switchprofile`; the
  device and profile name are chosen in its Property Inspector).
- Going back also needs such an action on one of the keys.

## A profile-switch key cannot show plugin data
- `setImage` / `setTitle` are accepted only for contexts that belong to the plugin that sent them. The Starter Pack key
  is static.
- Multi Action (`opendeck.multiaction`) does not help (conclusion from the code, not tested live).
- Workaround: separate neighbouring keys - an informational action next to the static Starter Pack key.
- The image of a static key can be replaced by the user in OpenDeck's instance editor (any image, rasterised on upload).

## What a plugin receives when the profile changes
- `set_selected_profile` sends `willDisappear` for ALL instances of the old profile, then `willAppear` for the new one.
- A plugin should track the set of visible contexts and run background work only while that set is not empty.
- `willAppear` / `keyDown` carry `payload.coordinates` `{row, column}` (for a 5x3 deck: column 0-4, row 0-2).
- `titleParametersDidChange` has a hard-coded `position / 3` (an upstream bug) - do not use it for coordinates.

## Property Inspector in WebKitGTK can freeze the whole OpenDeck window
- A PI with an `<input list>` + `<datalist>` of ~450 Home Assistant entities, rebuilt every 5 s with `setInterval`, froze
  the ENTIRE OpenDeck window while an entry was being picked. Nothing appears in the OpenDeck or plugin logs because the
  webview itself hangs.
- Rule for every PI: use short, pre-filtered `<select>` elements instead of `<datalist>`; never refresh lists on an
  interval - fetch on demand (opening the PI, a "Refresh" button) and rebuild the DOM only when the data changed.

## A context is a key position, not an instance
- `context` is `device.profile.Keypad.<position>.<index>`. Removing a tile and adding a new one on the same key yields the
  SAME context, and the new instance starts with the default image from the manifest. De-duplicating `setImage` by hash
  must therefore forget the hash on every `willAppear` / `willDisappear`; otherwise the new tile stays on the default image.

## setImage
- Accepts a `data:` URI; any other value is treated as a path relative to the plugin directory.
- After `setImage` OpenDeck marks the profile as changed (written to disk) - limit the frequency and skip unchanged images.
- [TO VERIFY] whether `setImage` on an instance of an inactive profile is only stored or also drawn.
