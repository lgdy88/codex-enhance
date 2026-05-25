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
  <img alt="Rust" src="https://img.shields.io/badge/rust-1.85%2B-orange">
  <img alt="Tauri" src="https://img.shields.io/badge/tauri-2.x-24C8DB">
</p>

Codex++ is an external enhancement launcher and desktop manager for the Codex App. It starts Codex through a standalone launcher and injects enhancements through the Chromium DevTools Protocol. It does not modify Codex `app.asar` and does not write DLL files into the Codex installation directory.

Maintainer: `lgdy88`
Repository: [https://github.com/lgdy88/codex-enhance](https://github.com/lgdy88/codex-enhance)

## Table of Contents

- [Use Cases](#use-cases)
- [Install](#install)
- [Usage](#usage)
- [Features](#features)
- [Screenshots](#screenshots)
- [How It Works and Boundaries](#how-it-works-and-boundaries)
- [Provider History Manager](#provider-history-manager)
- [Browser MCP](#browser-mcp)
- [Data and Backups](#data-and-backups)
- [FAQ](#faq)
- [Development](#development)

## Use Cases

- Start Codex externally and add a local enhancement menu to the desktop app.
- Restore plugin-entry visibility in API Key mode.
- Delete, export, or move local sessions.
- Keep historical conversations visible after switching `model_provider`.
- Manage Chrome DevTools MCP / Playwright MCP configuration from the desktop manager.

## Install

### Windows

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

### Source Build

Source builds are intended for development or debugging. This repository has migrated to Rust/Tauri-only and no longer provides a Python package, `setup.bat`, or `pytest` entry point.

```bash
cd apps/codex-plus-manager
npm install
npm run build

cd ../..
cargo build --release
```

After building, run the silent launcher directly:

```bash
target/release/codex-plus-plus
```

Or run the desktop manager:

```bash
cd apps/codex-plus-manager
npm run dev
```

## Usage

For normal use, launch Codex from the installed `Codex++` entry. The silent launcher accepts a small set of debugging options:

```bash
target/release/codex-plus-plus \
  --app-path "C:/Program Files/WindowsApps/OpenAI.Codex_xxx/app" \
  --debug-port 9229 \
  --helper-port 57321 \
  --codex-arg "--some-codex-flag"
```

The manager provides these actions:

- Launch or restart Codex++.
- Inspect and repair the silent launcher and manager entries.
- Configure the Codex App path, launch arguments, enhancement toggle, and Provider auto-sync.
- Manage user scripts.
- Run Provider History path repair and metadata convergence.
- Install, remove, or enable browser MCP configuration.
- View logs, diagnostics, and GitHub Release updates.

## Features

- Top-bar `Codex++` menu for local status and feature management.
- Plugin entry unlock for API Key mode.
- Session delete with confirmation and undo.
- Markdown export from local rollout data.
- Session project move for local conversations.
- Conversation Timeline for user-message navigation.
- Provider History Manager backed by local SQLite visibility repair.
- Browser MCP management for Chrome DevTools MCP and Playwright MCP.
- Windows entry setup/repair, optional watcher, and GitHub Release updates.
- User script management with scanning, toggles, deletion, and startup injection.

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
3. Injects `assets/inject/renderer-inject.js` through CDP.
4. Lets the renderer call local services through a private CDP bridge.

Boundaries:

- It does not modify original Codex App files.
- It does not bypass official account, region, rollout, or backend permissions.
- Browser MCP management only writes local Codex config and does not display tokens, DSNs, or full command arguments.
- Delete, path repair, and provider metadata convergence back up related local data before writing.
- The optional watcher only logs by default; it attempts native-launch takeover only when `CODEX_PLUS_ALLOW_FORCE_TAKEOVER=1` is set.

## Provider History Manager

When enabled, Codex++ queries project history from `~/.codex/state_5.sqlite` without filtering by the current provider. It also handles Windows path variants such as `\\?\`.

Use it when:

- Old conversations disappear in Desktop or `/resume` after switching from OpenAI to another provider.
- You switch back to another provider and want historical conversations to stay visible under the original project.
- Windows paths with a `\\?\` prefix prevent Desktop project matching.

Path repair only normalizes equivalent path formats, such as `\\?\D:\...` / `D:/...` to `D:\...`. It does not switch providers or move conversations between projects.

Compatibility mode's "converge to current provider" action backs up first, then converges historical metadata to the current `model_provider`. This only guarantees list visibility; it does not guarantee that cross-account or cross-provider `encrypted_content` can resume.

## Browser MCP

Browser MCP is managed from the desktop manager. It maintains these entries:

- `chrome-devtools`: uses `chrome-devtools-mcp@latest` for Chrome pages, console, network, DOM, and performance debugging.
- `playwright`: uses `@playwright/mcp@latest --browser=chrome --caps=devtools` for browser automation and page-state capture.

If Chrome does not support default `--autoConnect`, switch to `browser-url` mode in the manager and provide a remote debugging endpoint, for example:

```text
http://127.0.0.1:9222
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

The manager can maintain Chrome DevTools MCP / Playwright MCP configuration, but it does not emulate the official backend and does not bypass account, region, or rollout gating. Restart Codex or open a new session after changing MCP configuration.

### Skills or GitHub resources fail to load

Codex++ inherits existing proxy environment variables. You can also set them manually before launching the silent entry:

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
target/release/codex-plus-plus
```

## Development

Common checks:

```bash
cargo fmt --all -- --check
cargo test --workspace

cd apps/codex-plus-manager
npm install
npm run check
npm run vite:build
```

Project structure:

```text
apps/
  codex-plus-launcher/          Silent launcher
  codex-plus-manager/           Tauri manager
assets/inject/
  renderer-inject.js            Enhancement script injected into Codex
crates/
  codex-plus-core/              Launch, injection, config, update, install, bridge
  codex-plus-data/              Session data, export, Provider Sync
scripts/installer/
  windows/CodexPlusPlus.nsi     Windows NSIS installer
  macos/package-dmg.sh          macOS DMG packager
```

The Windows installer is built by the release workflow and uses this filename pattern:

```text
CodexPlusPlus-<version>-windows-x64-setup.exe
```
