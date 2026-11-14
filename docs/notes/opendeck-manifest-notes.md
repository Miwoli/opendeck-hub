# OpenDeck manifest.json schema

Verified directly in the `nekename/OpenDeck` sources (`src-tauri/src/plugins/manifest.rs`, `src-tauri/src/shared.rs`) while
debugging a "Failed to parse manifest" error on install.

**Checked against:** [`nekename/OpenDeck@3ddecc1`](https://github.com/nekename/OpenDeck/blob/3ddecc1/src-tauri/src/plugins/manifest.rs)
(v2.14.2), re-checked 2026-11-14. Live installs on OpenDeck 2.14.0 (native).

## `PluginManifest` (top-level fields)

Deserialised by serde with PascalCase aliases (each field has its own `#[serde(alias = "...")]`) and **without**
`deny_unknown_fields`, so unknown fields are ignored.

Required (no `Option`, no default):
- `Name`, `Author`, `Version`, `Icon` (strings)
- `Actions` (array of actions)
- **`OS`** (array of `{"Platform": "..."}` objects) - easy to forget; a missing `OS` fails parsing of the whole manifest.
  Use `[{"Platform": "linux"}]` (whether the case matters has not been verified).

Optional / defaulted:
- `Category` (default `"Custom"`), `CategoryIcon`
- `CodePath` / `CodePathWin` / `CodePathMac` / `CodePathLin` (we use `CodePathLin`) / `CodePaths`
- `PropertyInspectorPath` (can be overridden per action)
- `DeviceNamespace`, `ApplicationsToMonitor`, `HasSettingsInterface`

**Fields that do not exist in the OpenDeck schema** (ignored, better not to write them): `Description`, `SDKVersion`,
`Software`, `UserTitleEnabled`.

## `Action` (objects in `Actions`)
Required: `Name`, `UUID`, `States`.
Optional: `Tooltip` (`""`), `Icon` (`""`), `DisableAutomaticStates` (false), `VisibleInActionsList` (true),
`SupportedInMultiActions` (true), `PropertyInspectorPath` (`""`), `Controllers` (default `["Keypad"]`), `Encoder` (dials only).

## `ActionState` (objects in `States`)
`#[serde(default)]` on the container, so every field is effectively optional. Aliases: `Image`, `ImageScale`,
`BackgroundColour`, `Name`, `Title` (-> `text`), `ShowTitle` (-> `show: bool`), `TitleColor`, `TitleStroke`,
`TitleAlignment`, `FontFamily`, `FontStyle`, `FontSize`, `StrokeSize`, `FontUnderline`.

## Takeaway
Always add `"OS": [{"Platform": "linux"}]` to the manifest of every new plugin.
