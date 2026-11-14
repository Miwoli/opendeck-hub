# __TITLE__

<a href="https://github.com/Miwoli/opendeck-hub/releases?q=__NAME__&expanded=true"><img alt="release" src="https://img.shields.io/github/v/release/Miwoli/opendeck-hub?filter=__NAME__-v*&label=release&color=FFB547"></a>
<a href="https://github.com/Miwoli/opendeck-hub/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Miwoli/opendeck-hub/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white"></a>
<img alt="Platform: Linux" src="https://img.shields.io/badge/platform-Linux-FCC624?logo=linux&logoColor=black">
<a href="../../LICENSE"><img alt="License" src="https://img.shields.io/github/license/Miwoli/opendeck-hub"></a>

TODO: one or two sentences on what the plugin does.

`com.miwoli.__NAME__` · part of [opendeck-hub](../../README.md)

## Actions

| Action | UUID | What it does |
|---|---|---|
| Hello | `com.miwoli.__NAME__.hello` | Sample key: shows how many times it was pressed (replace it) |

## Install

Download `com.miwoli.__NAME__.sdPlugin-<version>.streamDeckPlugin` from the
[latest __TITLE__ release](https://github.com/Miwoli/opendeck-hub/releases?q=__NAME__&expanded=true) and follow the
[install steps](../../README.md#install). The actions are in the "__TITLE__" category.

## How it works

TODO: describe the behaviour that is not obvious from the actions table.

## Troubleshooting

- **Logs:** `~/.local/share/opendeck/logs/plugins/com.miwoli.__NAME__.sdPlugin.log`.

## Development

```bash
npm test -w plugins/__NAME__             # build + unit tests + bundle smoke test
npm run install-plugin -w plugins/__NAME__
npm run pack -w plugins/__NAME__
```
