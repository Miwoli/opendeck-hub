# System - `com.miwoli.system`

| Action | UUID | Behaviour |
|---|---|---|
| Power | `com.miwoli.system.poweroff` | hold 1 s (progress bar), release -> "Shut down? press · 3" -> press within 3 s -> `systemctl poweroff` |
| Screenshot | `com.miwoli.system.screenshot` | `spectacle -b -n -f/-m/-a -o <file>` in the background -> "Saved" (Mint, 2 s) |
| Clock | `com.miwoli.system.clock` | "16:22", weekday, date; redrawn once a minute, only while visible |

- Power: the hold is measured keyDown -> keyUp (`HoldToConfirm`); a short press does nothing, no confirmation within 3 s
  cancels, and the tile disappearing (profile change) cancels too.
- Screenshot: the Property Inspector chooses full desktop / current monitor / active window and the folder (default
  `<Pictures>/Screenshots`, where `<Pictures>` comes from `~/.config/user-dirs.dirs`). Files are named
  `Screenshot_YYYYMMDD_HHMMSS.png`. An error shows an "error" tile and an OpenDeck warning.
- All commands use `execFile` with an argument array and a timeout. Tests use fakes (`OPENDECK_SYSTEMCTL`,
  `OPENDECK_SPECTACLE`) and never power anything off.

```bash
npm test -w plugins/system             # build + unit and e2e tests + bundle smoke test
npm run pack -w plugins/system
npm run install-plugin -w plugins/system
```
Restart OpenDeck; the actions are in the "System" category.
Log: `~/.local/share/opendeck/logs/plugins/com.miwoli.system.sdPlugin.log` (`power off confirmed`, `screenshot saved: …`).
