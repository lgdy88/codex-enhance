# Codex++

<p align="center">
  <img src="docs/images/codex-plus-plus.png" alt="Codex++ icon" width="160">
</p>

<p align="center">
  [中文](README.md) | English
</p>

<p align="center">
  <img alt="Release" src="https://img.shields.io/github/v/release/lgdy88/codex-enhance">
  <img alt="Stars" src="https://img.shields.io/github/stars/lgdy88/codex-enhance">
  <img alt="License" src="https://img.shields.io/github/license/lgdy88/codex-enhance">
  <img alt="Python" src="https://img.shields.io/badge/python-3.11%2B-blue">
</p>

Codex++ is an external enhancement launcher for the Codex App. It does not modify the original Codex App installation. Instead, it launches Codex externally and injects enhancement scripts through the Chromium DevTools Protocol.

## Table of Contents

- [Community](#community)
- [Support](#support)
- [Quick Start](#quick-start)
- [Highlights](#highlights)
- [Screenshots](#screenshots)
- [Provider History Manager](#provider-history-manager)
- [Browser MCP](#browser-mcp)
- [Friendly Links](#friendly-links)
- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [Windows Usage](#windows-usage)
- [Auto Update](#auto-update)
- [macOS Usage](#macos-usage)
- [Direct Launch](#direct-launch)
- [Data and Backups](#data-and-backups)
- [FAQ](#faq)
- [Contributors and Stars](#contributors-and-stars)
- [Development](#development)

## Community

Scan the QR code to join the Codex++ discussion group, report issues, share usage notes, or suggest features:

<img src="docs/images/discussion-group-qr.jpg" alt="Codex++ discussion group QR code" width="260">

## Support

If Codex++ has helped you, you can buy me a coffee or send a small tip to support continued maintenance.

<p align="center">
  <img src="docs/images/sponsor-alipay.jpg" alt="Alipay sponsor QR code" width="220">
  <img src="docs/images/sponsor-wechat.jpg" alt="WeChat sponsor QR code" width="220">
</p>

## Quick Start

Windows users can double-click this file in the project root:

```text
setup.bat
```

Then choose:

```text
[1] Install Codex++
```

After setup, a `Codex++.lnk` shortcut is created on the desktop. Double-click it to launch Codex with Codex++ enhancements.

You can also install and launch from the command line:

```bash
python -m pip install -e .
python -m codex_session_delete setup
python -m codex_session_delete launch
```

macOS users can run:

```bash
python -m codex_session_delete setup
```

This creates `/Applications/Codex++.app`.

## Highlights

- Adds a `Codex++` menu to the top bar for managing enhancement features.
- Plugin entry unlock: shows and enables the plugin entry in API Key mode.
- Forced plugin install: removes frontend install blocking caused by App unavailable states.
- Session delete: shows a delete button on session row hover, with confirmation and undo.
- Markdown export: exports local rollout conversations to timestamped Markdown files.
- Project move: moves sessions into normal conversations or other local projects.
- Conversation Timeline: shows user-question markers on the right side of a conversation, with hover summaries and quick jump.
- Provider History Manager: local SQLite bridge first for cross-provider history queries, project pagination, runtime `model_provider` watching, and explicit compatibility-mode metadata convergence.
- Browser MCP: writes Chrome DevTools MCP and Playwright MCP entries for Chrome console, network, page state, and browser automation.
- Windows shortcut setup/removal, optional watcher takeover, and checksum-verified GitHub Release updates.
- macOS `/Applications/Codex++.app` bundle generation.

## Screenshots

In API Key mode, the native Codex plugin entry may require ChatGPT login and remain unavailable:

![Plugin entry unavailable in API Key mode](docs/images/pain-plugin-disabled.png)

The native Codex session list only has archive actions and no real delete button:

![Native session list lacks delete action](docs/images/pain-no-delete-button.png)

After launching through Codex++, the plugin entry is unlocked and a delete button appears when hovering a session:

![Codex++ unlocks plugin entry and adds delete button](docs/images/solution-plugin-and-delete.png)

The top bar shows `Codex++`, backend status, and the settings panel:

![Codex++ backend status indicator](docs/images/backend-status-indicator.png)

![Codex++ settings panel](docs/images/settings-panel.png)

## Provider History Manager

When `Provider History Manager` is enabled, Codex++ does not rewrite provider metadata by default. Project history first uses the local SQLite bridge against `~/.codex/state_5.sqlite`: it does not filter by the current provider, uses current project path variants including `\\?\`, and supports `limit + cursor` pagination. Codex app-server `thread/list` is only an optional fallback when the local bridge is unavailable; if the current Desktop build does not expose that signal, Codex++ skips it and keeps using local storage. The project sidebar shows 5 conversations first and adds a "Show more" action for more pages.

Use it when:

- Old conversations disappear in Desktop or `/resume` after switching from OpenAI to another provider.
- You switch back to another provider and want historical conversations to stay visible under the original project.
- Windows paths with a `\\?\` prefix prevent Desktop project matching.

Codex++ watches `~/.codex/config.toml` for `model_provider` changes while running and refreshes the history index and UI after a change. The Provider panel shows the active history query channel, rollout provider distribution, SQLite provider distribution, `\\?\` path counts, recent-50 matches, and project-visible counts.

Low-risk path repair runs by default. It only converts equivalent Windows path formats such as `\\?\D:\...` / `D:/...` into Desktop-friendly `D:\...`; it does not switch providers or move conversations between projects.

Compatibility mode provides a "Converge to current provider" button. It backs up first, then converges historical metadata to the current `model_provider`. This only guarantees list visibility; it does not guarantee that cross-account or cross-provider `encrypted_content` can resume.

If a project already shows `No conversations` while the sessions still exist, run the path-only repair command:

```bash
python -m codex_session_delete provider-repair-paths
```

This command matches the default path repair behavior. It does not switch providers or move conversations between projects.

## Browser MCP and MCP Toggles

Codex++ can detect all MCP servers in `~/.codex/config.toml` and write `enabled = true/false` from the settings panel. To avoid leaking secrets, the panel and `mcp-status` only show server names, types, and enabled state; they do not show `env`, tokens, DSNs, or full command arguments.

The toggle writes the config immediately, but the already-running Codex session usually does not hot-unload or hot-load MCP servers. Restart Codex++ or start a new session to confirm tool-list changes.

Codex++ can also write browser-debugging MCP entries into your Codex config:

```bash
python -m codex_session_delete mcp-install all
python -m codex_session_delete mcp-status
python -m codex_session_delete mcp-remove all
```

It manages two entries in `~/.codex/config.toml`:

- `chrome-devtools`: uses `chrome-devtools-mcp@latest` for Chrome pages, console, network, DOM, and performance debugging.
- `playwright`: uses `@playwright/mcp@latest --browser=chrome --caps=devtools` for browser automation, E2E flows, and page-state capture.

Codex++ backs up the config before writing and preserves unrelated providers, MCP servers, plugins, and token settings. Restart Codex after writing the config so the MCP servers are loaded.

By default Chrome DevTools MCP uses `--autoConnect`. It can connect to your current Chrome session when supported by your Chrome version and after Chrome asks you to approve the connection. If your Chrome does not support it, use a remote debugging endpoint instead:

```bash
python -m codex_session_delete mcp-install chrome-devtools --chrome-mode browser-url --browser-url http://127.0.0.1:9222
```

This only configures MCP debugging and automation. It does not bypass official Computer Use account, region, rollout, or backend restrictions.

## Friendly Links

- [LINUX DO](https://linux.do)

## How It Works

Codex++ launches Codex externally:

1. Starts the Codex App with:
   - `--remote-debugging-port=9229`
   - `--remote-allow-origins=http://127.0.0.1:9229`
2. Runs low-risk path repair before launch; Provider History Manager handles cross-provider history queries and runtime `model_provider` watching.
3. Starts a local helper service for health checks and runtime operations.
4. Injects `renderer-inject.js` through CDP.
5. The renderer talks to local services through a private CDP bridge. HTTP state-changing routes reject requests without a token by default, preventing unrelated local pages from triggering delete, export, or move actions.
6. Codex inherits existing `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`; if none are set, Codex++ auto-detects common local proxy ports such as `127.0.0.1:7897` to help Codex load GitHub-hosted skill resources.

This approach does not modify Codex `app.asar` and does not write DLL files into the Codex installation directory.

## Requirements

- Python 3.11+
- Windows or macOS
- Codex App installed

Install dependencies:

```bash
python -m pip install -e .
```

Run tests:

```bash
python -m pip install -e .[test]
python -m pytest -q
```

## Windows Usage

### GUI setup/removal

Double-click this file in the project root:

```text
setup.bat
```

Then choose from the menu:

```text
[1] Install Codex++
[2] Uninstall Codex++
[3] Update Codex++
[4] Install Browser MCP
[5] Browser MCP Status
[6] Exit
```

### Command-line setup

Run in the project directory:

```bash
python -m codex_session_delete setup
```

After setup, a desktop shortcut is created:

```text
Codex++.lnk
```

Double-click it to launch Codex++.

`setup` also repairs the Codex Chrome extension Native Messaging Host. It copies the bundled `extension-host.exe` into a user-executable directory and rewrites the Chrome manifest, avoiding `Access is denied` failures when Chrome tries to run the host directly from WindowsApps.

### Repair Chrome Computer Use connection

If Codex shows `Computer Use plugin unavailable`, run:

```bash
python -m codex_session_delete chrome-repair
```

This command only repairs the local Chrome extension and Codex Native Host connection. It does not emulate the official backend or bypass account, region, or rollout gating. Restart Chrome and Codex after running it.

### Command-line removal

You can remove `Codex++` from Windows Settings → Apps → Installed apps.

Or run in the project directory:

```bash
python -m codex_session_delete remove
```

To also delete Codex++ logs and backup data:

```bash
python -m codex_session_delete remove --remove-data
```

### Optional Windows watcher takeover

By default, Codex++ only takes effect when you launch Codex from the `Codex++` shortcut. If you start the original Codex entry from the Start menu or taskbar, that run will not include injection.

The optional Windows watcher helps detect this by checking the local CDP port every 3 seconds. If it finds the Codex Desktop App running without CDP, it logs the state and does not force-kill Codex by default. Set `CODEX_PLUS_ALLOW_FORCE_TAKEOVER=1` before starting the watcher only if you explicitly accept the restart risk and want it to relaunch the Desktop App through the Codex++ launcher.

Install:

```bash
python -m codex_session_delete watch-install
```

Remove:

```bash
python -m codex_session_delete watch-remove
```

Temporarily disable or enable takeover while keeping startup entries:

```bash
python -m codex_session_delete watch-disable
python -m codex_session_delete watch-enable
```

Logs:

```text
%USERPROFILE%\.codex-session-delete\watcher.log
```

## Auto Update

Codex++ checks GitHub Releases on startup. If a newer Release is available, it prints the version, Release URL, and update command. A failed update check does not block Codex++ startup.

Check manually:

```bash
python -m codex_session_delete check-update
```

Update from the latest GitHub Release:

```bash
python -m codex_session_delete update
```

Update flow:

1. Requests `https://api.github.com/repos/lgdy88/codex-enhance/releases/latest`.
2. Compares the latest Release tag with the local version.
3. Prefers a `.whl` asset from the Release.
4. Downloads a matching `.sha256` / `SHA256SUMS` file and verifies the asset.
5. Runs `python -m pip install --upgrade <wheel>` after verification succeeds.
6. Runs `python -m codex_session_delete setup` again to refresh shortcuts, Windows uninstall entries, or the macOS app bundle.

When publishing a new version, attach a wheel to the GitHub Release:

```bash
python -m build
```

Then upload `dist/codex_session_delete-<version>-py3-none-any.whl` and its matching `.sha256` file to the Release.

## macOS Usage

### Setup

```bash
python -m codex_session_delete setup
```

The setup command searches `/Applications/Codex.app`, `/Applications/OpenAI Codex.app`, and the user's Applications directory, then creates:

```text
/Applications/Codex++.app
```

### Removal

```bash
python -m codex_session_delete remove
```

## Direct Launch

You can launch without installing shortcuts:

```bash
python -m codex_session_delete launch
```

Common arguments:

```bash
python -m codex_session_delete launch \
  --app-dir "/Applications/OpenAI Codex.app" \
  --debug-port 9229 \
  --helper-port 57321
```

On Windows, you can also specify the Codex installation directory manually:

```bash
python -m codex_session_delete launch \
  --app-dir "C:/Program Files/WindowsApps/OpenAI.Codex_xxx/app" \
  --debug-port 9229 \
  --helper-port 57321
```

## Data and Backups

Codex++ reads the local Codex database by default:

```text
~/.codex/state_5.sqlite
```

Before deletion, related records are backed up to:

```text
~/.codex-session-delete/backups
```

Provider History Manager path repair and compatibility-mode convergence back up pre-change state to:

```text
~/.codex/backups_state/provider-sync
```

`provider-repair-paths` uses the same backup directory.

Hidden launch failure logs are stored at:

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

- Codex App is not installed or its path changed
- Port 9229 is already in use
- Python environment is unavailable

### Skill recommendations fail to load

If the skills page reports `git fetch failed`, `unable to access 'https://github.com/openai/skills.git/'`, or cannot connect to GitHub, your machine likely cannot reach GitHub directly. Codex++ inherits existing proxy environment variables first; if none are set, it tries common local proxy ports. You can also specify one manually:

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
python -m codex_session_delete launch
```

### The Codex++ menu does not appear

Make sure you launched from the `Codex++` shortcut instead of the original Codex entry.

You can also check whether Codex has the CDP flag:

```text
--remote-debugging-port=9229
```

### Old conversations disappear after switching providers

Open the Provider tab in the `Codex++` settings panel and check the history query channel, provider distribution, recent-50 matches, and project-visible counts. The default local SQLite bridge should recover the list first. If an older Desktop UI still filters it, click "Converge to current provider" manually. That compatibility mode backs up and changes metadata, but it does not guarantee that cross-account or cross-provider `encrypted_content` can resume.

### Windows uninstall fails

Update to the current version and run setup again:

```bash
python -m codex_session_delete setup
```

Newer versions write a stable uninstall entry and use an absolute Python path for removal.

## Contributors and Stars

<a href="https://github.com/lgdy88/codex-enhance/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=lgdy88/codex-enhance" alt="Codex++ contributors">
</a>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=lgdy88/codex-enhance&type=Date&theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=lgdy88/codex-enhance&type=Date">
  <img alt="Codex++ Star History" src="https://api.star-history.com/svg?repos=lgdy88/codex-enhance&type=Date">
</picture>

## Development

Run tests:

```bash
python -m pytest -q
```

Project structure:

```text
codex_session_delete/
  cli.py                 CLI entry point
  launcher.py            Launches Codex and injects scripts
  cdp.py                 CDP communication and bridge
  helper_server.py       Local helper service
  storage_adapter.py     Local SQLite delete/undo
  provider_sync.py       provider metadata convergence and path repair
  settings_store.py      Codex++ backend settings
  windows_installer.py   Windows shortcuts and uninstall entries
  macos_installer.py     macOS app bundle setup
  watcher.py             Optional Windows watcher takeover
  inject/renderer-inject.js

tests/                   Automated tests
```

## Notes

Codex++ is an external enhancement tool and does not modify original Codex App files. If a future Codex App update changes page structure, the injection script may need updates.
