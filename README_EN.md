# Codex++

<p align="center">
  <img src="docs/images/codex-plus-plus.png" alt="Codex++ icon" width="160">
</p>

<p align="center">
  [中文](README.md) | English
</p>

<p align="center">
  <img alt="Release" src="https://img.shields.io/github/v/release/lgdy88/codex-enhance">
  <img alt="License" src="https://img.shields.io/github/license/lgdy88/codex-enhance">
  <img alt="Python" src="https://img.shields.io/badge/python-3.11%2B-blue">
</p>

Codex++ is an external enhancement launcher for the Codex App. It starts Codex through an external launcher and injects enhancement scripts through the Chromium DevTools Protocol. It does not modify Codex `app.asar` and does not write DLL files into the Codex installation directory.

Maintainer: `lgdy88`
Repository: [https://github.com/lgdy88/codex-enhance](https://github.com/lgdy88/codex-enhance)

## Table of Contents

- [Use Cases](#use-cases)
- [Install](#install)
- [Usage](#usage)
- [Features](#features)
- [Screenshots](#screenshots)
- [How It Works and Boundaries](#how-it-works-and-boundaries)
- [Data and Backups](#data-and-backups)
- [FAQ](#faq)
- [Development](#development)

## Use Cases

- Start Codex externally and add a local enhancement menu to the desktop app.
- Restore plugin-entry visibility in API Key mode.
- Delete, export, or move local sessions.
- Keep historical conversations visible after switching `model_provider`.
- Manage Chrome DevTools MCP / Playwright MCP config from the CLI.

## Install

### Recommended Windows Install

Download the Windows installer from [Releases](https://github.com/lgdy88/codex-enhance/releases):

```text
CodexPlusPlus-<version>-windows-x64-setup.exe
```

After installation, two entries are created:

```text
Codex++.lnk
Codex++ 管理工具.lnk
```

Use `Codex++.lnk` to launch Codex with Codex++ enhancements. Use `Codex++ 管理工具.lnk` to inspect status, repair entry points, manage settings, and run updates.

### macOS

Download from [Releases](https://github.com/lgdy88/codex-enhance/releases):

```text
CodexPlusPlus-<version>-macos-universal.dmg
```

The package provides two app entries: `Codex++` and `Codex++ 管理工具`.

### Source Install

Source install is mainly for development and debugging:

```bash
python -m pip install -e .
python -m codex_session_delete setup
```

On Windows, `setup.bat` in the project root can create the virtual environment and install the source version. Public users should prefer the Release installer.

## Usage

Launch directly:

```bash
python -m codex_session_delete launch
```

Launch with an explicit Codex app path:

```bash
python -m codex_session_delete launch \
  --app-dir "C:/Program Files/WindowsApps/OpenAI.Codex_xxx/app" \
  --debug-port 9229 \
  --helper-port 57321
```

Check and update:

```bash
python -m codex_session_delete check-update
python -m codex_session_delete update
```

Remove source-installed entry points:

```bash
python -m codex_session_delete remove
```

Remove Codex++ logs and backup data as well:

```bash
python -m codex_session_delete remove --remove-data
```

## Features

- Top-bar `Codex++` menu for local status and feature management.
- Plugin entry unlock for API Key mode.
- Session delete with confirmation and undo.
- Markdown export from local rollout data.
- Session project move for local conversations.
- Conversation Timeline for user-message navigation.
- Provider History Manager backed by local SQLite visibility repair.
- Browser MCP CLI setup for Chrome DevTools MCP and Playwright MCP; the desktop manager does not expose MCP selection controls.
- Windows entry setup/repair, optional watcher, and GitHub Release updates.

## Screenshots

In API Key mode, the native Codex plugin entry may require ChatGPT login:

![Plugin entry unavailable in API Key mode](docs/images/pain-plugin-disabled.png)

The native Codex session list has archive actions, but no real delete button:

![Native session list lacks delete action](docs/images/pain-no-delete-button.png)

After launching through Codex++, the plugin entry is unlocked and a delete button appears on session hover:

![Codex++ unlocks plugin entry and adds delete button](docs/images/solution-plugin-and-delete.png)

The management tool checks entry points, launch state, Provider History, and logs:

![Codex++ settings panel](docs/images/settings-panel.png)

## How It Works and Boundaries

Codex++ launches Codex externally:

1. Starts the Codex App with `--remote-debugging-port=9229`.
2. Starts a local helper service for health checks and local operations.
3. Injects `renderer-inject.js` through CDP.
4. Lets the renderer call local services through a private CDP bridge.

Boundaries:

- It does not modify original Codex App files.
- It does not bypass official account, region, rollout, or backend permissions.
- Browser MCP CLI only writes local Codex config and does not display tokens, DSNs, or full command arguments.
- Delete, path repair, and provider metadata convergence back up related local data before writing.
- The optional watcher only logs by default; it attempts native-launch takeover only when `CODEX_PLUS_ALLOW_FORCE_TAKEOVER=1` is set.

## Provider History Manager

When enabled, Codex++ queries project history from `~/.codex/state_5.sqlite` without filtering by the current provider. It also handles Windows path variants such as `\\?\`.

Use it when:

- Old conversations disappear in Desktop or `/resume` after switching from OpenAI to another provider.
- You switch back to another provider and want historical conversations to stay visible under the original project.
- Windows paths with a `\\?\` prefix prevent Desktop project matching.

Path repair only normalizes equivalent path formats, such as `\\?\D:\...` / `D:/...` to `D:\...`. It does not switch providers or move conversations between projects.

Run path-only repair manually:

```bash
python -m codex_session_delete provider-repair-paths
```

Compatibility mode's "Converge to current provider" action backs up first, then converges historical metadata to the current `model_provider`. This only guarantees list visibility; it does not guarantee that cross-account or cross-provider `encrypted_content` can resume.

## Browser MCP

Browser MCP remains available from the command line; the desktop manager no longer exposes current-project MCP selection controls.

Install, inspect, and remove browser MCP entries:

```bash
python -m codex_session_delete mcp-install all
python -m codex_session_delete mcp-status
python -m codex_session_delete mcp-remove all
```

Managed entries:

- `chrome-devtools`: uses `chrome-devtools-mcp@latest` for Chrome pages, console, network, DOM, and performance debugging.
- `playwright`: uses `@playwright/mcp@latest --browser=chrome --caps=devtools` for browser automation and page-state capture.

If Chrome does not support default `--autoConnect`, use a remote debugging endpoint:

```bash
python -m codex_session_delete mcp-install chrome-devtools --chrome-mode browser-url --browser-url http://127.0.0.1:9222
```

This does not bypass official Computer Use account, region, rollout, or backend restrictions.

## Data and Backups

Codex++ reads:

```text
~/.codex/state_5.sqlite
```

Deletion backup directory:

```text
~/.codex-session-delete/backups
```

Provider History Manager path repair and metadata convergence backup directory:

```text
~/.codex/backups_state/provider-sync
```

Hidden launch failure log:

```text
~/.codex-session-delete/launcher.log
```

## FAQ

### Double-clicking Codex++ does nothing

Check the log first:

```text
%USERPROFILE%\.codex-session-delete\launcher.log
```

Common causes:

- Codex App is not installed or its path changed.
- Port 9229 is already in use.
- The shortcut points to a missing `codex-plus-plus.exe`.

### The Codex++ menu does not appear

Make sure Codex was launched from the `Codex++` shortcut instead of the original Codex entry.

You can also check whether Codex has the CDP flag:

```text
--remote-debugging-port=9229
```

### Chrome Computer Use connection is broken

Repair the local Chrome extension and Codex Native Host connection:

```bash
python -m codex_session_delete chrome-repair
```

This command does not emulate the official backend and does not bypass account, region, or rollout gating. Restart Chrome and Codex after running it.

### Skills or GitHub resources fail to load

Codex++ inherits existing proxy environment variables. You can also set them manually:

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
python -m codex_session_delete launch
```

## Development

Install test dependencies:

```bash
python -m pip install -e .[test]
```

Common checks:

```bash
python -m pytest -q
node --check codex_session_delete/inject/renderer-inject.js
python scripts/disposable_cdp_smoke.py
```

When editing the injected renderer, change `codex_session_delete/inject_src/*.js` first, then rebuild the generated single-file artifact:

```bash
python scripts/build_renderer_inject.py
```

Desktop manager commands:

```bash
cd apps/codex-plus-manager
npm install
npm run check
npm run build
```

The Windows installer is built by the release workflow and uses this filename pattern:

```text
CodexPlusPlus-<version>-windows-x64-setup.exe
```
