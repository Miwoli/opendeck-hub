# Security policy

## Supported versions

Every plugin is released on its own as `<plugin>-v<version>`. Only the **latest release of each plugin** receives
security fixes; please update before reporting.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting instead:
[Report a vulnerability](https://github.com/Miwoli/opendeck-hub/security/advisories/new) (Security tab → **Report a vulnerability**).

Include the plugin and its version, what an attacker can do, and steps to reproduce. Never paste real tokens, cookies or
logs that contain them. This is a hobby project run by one person: expect an answer within about a week, and a coordinated
fix and disclosure once the problem is confirmed.

## Where plugins keep secrets

Each plugin's README has a **Security and secrets** section with what it stores, where, and what access it needs. In short,
only `claude-usage` (a claude.ai `sessionKey`), `homeassistant` and `ha-map` (Home Assistant long-lived tokens) keep
secrets, in OpenDeck's plain-JSON plugin settings.
