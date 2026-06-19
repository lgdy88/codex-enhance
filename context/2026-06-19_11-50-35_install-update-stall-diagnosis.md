# Dex vs Meta Desktop install/update stall diagnosis

## User Intent

Strictly diagnose why `D:\Skye\Meta` Meta Desktop appears to install/update more smoothly than Dex in `D:\Skye\codex-enhance`, especially whether Meta Desktop automatically pauses/exits the old app while Dex gets stuck because it lacks tray behavior.

## Scope

- Compare desktop packaging/update configuration.
- Compare app lifecycle, single-instance, tray, and shutdown/update hooks.
- Avoid code edits, packaging, commit, push, or destructive install/uninstall operations in this pass.

## Candidate Hypotheses

1. Meta Desktop installer/updater closes or pauses the running app through explicit updater lifecycle handling.
2. Meta Desktop uses tray/window lifecycle behavior that keeps shutdown controllable.
3. Dex keeps the old process alive during MSI/update because no shutdown/update hook exists.
4. The difference is packaging/installer configuration rather than tray behavior.

## Evidence Plan

- Inspect `AGENTS.md`/`Project.meta-ruli.md` and relevant desktop source/config in both repositories.
- Search for updater, tray, close-request, single-instance, NSIS/Wix/MSI, and process lifecycle code.
- Compare build configuration and generated installer metadata where available.
- Report findings with file/line evidence and accepted-risk for anything requiring live installer reproduction.

## Findings

- Dex's UI first tries the signed Tauri updater, but falls back to a custom GitHub MSI path when the signed updater check/install fails.
- The Dex fallback downloads the MSI and starts `msiexec.exe /i <path>` without first exiting `codex-plus-plus-manager.exe`.
- Dex Manager has no tray, no manager-level single-instance plugin, and no close/update lifecycle hook in `apps/codex-plus-manager/src-tauri/src/lib.rs`.
- Meta Desktop uses the Tauri updater directly in the UI, configures Windows updater `installMode: "passive"`, ships MSI and NSIS targets, and includes tray plus single-instance support.
- The tray is not the direct root cause. It helps Meta expose an explicit Quit/restore control, but the smoother update path is mainly from the Tauri updater/passive installer flow and release artifact setup. Dex's risky path is the fallback MSI installer launched while the old Dex binaries are still running.

## Accepted Risk

No destructive install/uninstall reproduction was run. The conclusion is based on source/config evidence plus current process inventory showing `codex-plus-plus-manager.exe` and `codex-plus-plus.exe` running from the installed Dex directory.
