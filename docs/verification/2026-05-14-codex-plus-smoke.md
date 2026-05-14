# Codex++ Smoke Verification - 2026-05-14

## Scope

This record verifies the current repository state after the automatic-update test fixes and a non-destructive Codex Desktop smoke check.

Covered features:

- Codex++ top menu and settings panel
- Plugin entry unlock
- Forced plugin install front-end unblock
- Session row actions: delete, Markdown export, project move
- Conversation Timeline settings entry
- Provider Sync settings entry
- Windows launcher / CDP injection path
- GitHub Release update tests

Not executed destructively:

- Real session deletion
- Real undo after deletion
- Real project move
- Real Markdown file download from a live session
- Real plugin installation

## Environment

- Date: 2026-05-14
- OS: Windows
- Codex App path: `C:\Program Files\WindowsApps\OpenAI.Codex_26.506.3741.0_x64__2p2nqsd0c76g0\app`
- Codex App URL observed through CDP: `app://-/index.html?hostId=local`
- CDP port: `9229`
- Helper base observed in renderer: `http://127.0.0.1:57321`
- Repository package version: `1.0.7`

## Automated Tests

Command:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Result:

```text
193 passed in 17.31s
```

The previously failing GitHub Release update tests now pass:

- `tests/test_launcher_cli.py::test_cli_check_update_prints_latest_release`
- `tests/test_updater.py::test_release_from_github_payload_selects_matching_sha256`
- `tests/test_updater.py::test_perform_update_installs_downloaded_wheel_and_reruns_setup`

Additional upstream-header regression coverage was run after selectively applying:

- `369bc89` - Fix floating Codex++ menu overlapping long thread titles
- `00507f5` - Tighten floating Codex++ header anchor detection

Excluded upstream updates:

- `64aa02b` - discussion QR image update
- `dd65c39` - sponsor QR modal resize

Targeted command:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_renderer_script.py tests\test_launcher_cli.py::test_cli_check_update_prints_latest_release tests\test_updater.py::test_release_from_github_payload_selects_matching_sha256 tests\test_updater.py::test_perform_update_installs_downloaded_wheel_and_reruns_setup -q
```

Result:

```text
30 passed in 0.33s
```

## Live Codex Observation

The running Codex process already had CDP enabled:

```text
Codex.exe --remote-debugging-port=9229 --remote-allow-origins=http://127.0.0.1:9229
```

The active launcher process was:

```text
pythonw.exe -m codex_session_delete launch
```

Initial live renderer observation showed Codex++ was injected, but the active renderer script version was `1.0.5`, not the repository version `1.0.6`.

Observed live state:

- Codex++ menu present: yes
- Menu text: `Codex++ 1.0.5`
- Sidebar rows: `3`
- Enhanced session rows: `3`
- Delete buttons: `3`
- Export buttons: `3`
- Move buttons: `3`
- Plugin entry present: yes
- Plugin entry disabled: no
- Plugin entry dataset flag: `codexPluginEnabled=true`
- Backend status after opening settings: `ok`

Because the running app had an older injected script, this live observation is useful for launcher health but not sufficient for the repository `1.0.6` UI surface.

## Repository Script Smoke

To verify the current repository script without killing or restarting the user's live Codex session, the repository copy of `codex_session_delete/inject/renderer-inject.js` was injected through CDP with a guarded smoke bridge.

The smoke bridge returned fake success for read/status/settings endpoints and blocked mutation endpoints. No real delete, export, move, or plugin install was executed.

Observed repository-script state:

- Menu text: `Codex++ 1.0.7`
- Settings modal present: yes
- Backend status: `ok`
- Backend label: `后端已连接（smoke）`
- Plugin entry present: yes
- Plugin entry disabled: no
- Plugin entry dataset flag: `codexPluginEnabled=true`
- Sidebar rows: `3`
- Enhanced session rows: `3`
- Delete buttons: `3`
- Export buttons: `3`
- Move buttons: `3`
- Disabled install candidates: `0`

Settings rows observed:

- `后端连接`
- `插件选项解锁`
- `特殊插件强制安装`
- `会话删除`
- `Markdown 导出`
- `会话项目移动`
- `对话 Timeline`
- `Provider 同步`
- `原生菜单栏位置`
- `打开 DevTools`
- `关于 Codex++`
- `提出问题`
- `用户脚本`

Settings toggles observed:

- `pluginEntryUnlock=true`
- `forcePluginInstall=true`
- `sessionDelete=true`
- `markdownExport=true`
- `projectMove=true`
- `conversationTimeline=true`
- `nativeMenuPlacement=true`
- `providerSyncEnabled=false`

## Timeline Limitation

The current page did not expose any recognizable user-message candidates at the time of smoke verification:

```text
userQuestionCandidates=0
timelinePresent=false
timelineMarkers=0
```

This does not prove Timeline failure. It means the current page state was not a suitable conversation view for marker generation. A stronger Timeline check should open a conversation with visible user turns and then verify non-zero `.codex-conversation-timeline-marker` elements plus pointer jump behavior.

## Accepted Risks

- The smoke check did not execute destructive mutations against real user data.
- Plugin installation was not executed; only plugin entry unlock and disabled install candidate state were observed.
- Timeline marker rendering was not fully verified because the observed page had no visible user-message candidates.
- The running installed injection was `1.0.5`; repository `1.0.7` should be verified by guarded CDP injection or the disposable smoke harness rather than by restarting a live user session.

## Follow-Up

For release confidence, run a manual end-to-end pass in a disposable Codex profile or test account:

1. Start Codex++ from the repository or installed `1.0.7` shortcut.
2. Open a conversation with at least two visible user turns and verify Timeline markers and jump behavior.
3. Create a disposable conversation and verify delete, undo, export, and project move against that disposable data.
4. Visit a plugin detail page with an unavailable install button and verify the forced-install button state before installing any plugin.
