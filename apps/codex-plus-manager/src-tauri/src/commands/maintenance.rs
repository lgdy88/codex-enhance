use serde_json::{Value, json};

use crate::install::{self, InstallActionResult, InstallOptions};

use super::{
    CommandResult, DiagnosticsPayload, LogRequest, LogsPayload, OfficialPluginCacheRefreshPayload,
    OfficialPluginCacheRefreshRequest, OfficialPluginHealthPayload, WatcherPayload,
    default_debug_port, diagnostics_report, failed, install_background_failure, ok, read_tail,
    watcher_payload,
};

#[tauri::command]
pub async fn check_official_plugins() -> CommandResult<OfficialPluginHealthPayload> {
    let report = tauri::async_runtime::spawn_blocking(
        codex_plus_core::official_plugin_doctor::check_official_plugins,
    )
    .await;
    match report {
        Ok(report) => CommandResult {
            status: report.status.clone(),
            message: report.message.clone(),
            payload: OfficialPluginHealthPayload { health: report },
        },
        Err(error) => {
            let report = codex_plus_core::official_plugin_doctor::OfficialPluginHealthReport {
                status: "failed".to_string(),
                message: format!("官方插件检查后台任务失败：{error}"),
                codex_home: String::new(),
                bundled_cache_root: String::new(),
                checks: Vec::new(),
                repair_notes: Vec::new(),
            };
            let message = report.message.clone();
            failed(&message, OfficialPluginHealthPayload { health: report })
        }
    }
}

#[tauri::command]
pub async fn refresh_official_plugin_cache(
    request: OfficialPluginCacheRefreshRequest,
) -> CommandResult<OfficialPluginCacheRefreshPayload> {
    if !request.confirm {
        return failed(
            "修复官方插件需要显式确认。",
            OfficialPluginCacheRefreshPayload {
                refresh: failed_refresh_result("confirm=false"),
            },
        );
    }
    let result = tauri::async_runtime::spawn_blocking(
        codex_plus_core::plugin_cache::refresh_official_plugin_cache,
    )
    .await;
    match result {
        Ok(Ok(refresh)) => CommandResult {
            status: refresh.status.clone(),
            message: refresh.message.clone(),
            payload: OfficialPluginCacheRefreshPayload { refresh },
        },
        Ok(Err(error)) => failed(
            &format!("修复官方插件失败：{error}"),
            OfficialPluginCacheRefreshPayload {
                refresh: failed_refresh_result(&format!("{error}")),
            },
        ),
        Err(error) => failed(
            &format!("修复官方插件后台任务失败：{error}"),
            OfficialPluginCacheRefreshPayload {
                refresh: failed_refresh_result(&format!("{error}")),
            },
        ),
    }
}

fn failed_refresh_result(
    message: &str,
) -> codex_plus_core::plugin_cache::OfficialPluginCacheRefreshResult {
    codex_plus_core::plugin_cache::OfficialPluginCacheRefreshResult {
        status: "failed".to_string(),
        message: message.to_string(),
        codex_home: String::new(),
        cache_root: String::new(),
        backup_root: String::new(),
        config_path: String::new(),
        config_backup_path: String::new(),
        global_state_path: String::new(),
        global_state_backup_path: String::new(),
        global_state_updated: false,
        global_state_entries: Vec::new(),
        plugins: Vec::new(),
    }
}

#[tauri::command]
pub fn open_external_url(url: String) -> CommandResult<Value> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return failed("只允许打开 http 或 https 链接。", json!({}));
    }
    match open_url(trimmed) {
        Ok(()) => ok("已在系统浏览器打开链接。", json!({ "url": trimmed })),
        Err(error) => failed(&format!("打开链接失败：{error}"), json!({ "url": trimmed })),
    }
}

#[tauri::command]
pub async fn install_entrypoints() -> InstallActionResult {
    tauri::async_runtime::spawn_blocking(install::install_entrypoints)
        .await
        .unwrap_or_else(|error| install_background_failure("安装入口", error))
}

#[tauri::command]
pub async fn uninstall_entrypoints(options: InstallOptions) -> InstallActionResult {
    tauri::async_runtime::spawn_blocking(move || install::uninstall_entrypoints(options))
        .await
        .unwrap_or_else(|error| install_background_failure("卸载入口", error))
}

#[tauri::command]
pub async fn repair_shortcuts() -> InstallActionResult {
    tauri::async_runtime::spawn_blocking(install::repair_shortcuts)
        .await
        .unwrap_or_else(|error| install_background_failure("修复快捷方式", error))
}

#[tauri::command]
pub fn load_watcher_state() -> CommandResult<WatcherPayload> {
    ok("watcher 状态已加载。", watcher_payload())
}

#[tauri::command]
pub fn install_watcher() -> CommandResult<WatcherPayload> {
    let launcher_path = codex_plus_core::install::resolve_silent_launcher();
    match codex_plus_core::watcher::install_watcher(&launcher_path, default_debug_port()) {
        Ok(()) => ok("watcher 已安装。", watcher_payload()),
        Err(error) => failed(&format!("安装 watcher 失败：{error}"), watcher_payload()),
    }
}

#[tauri::command]
pub fn uninstall_watcher() -> CommandResult<WatcherPayload> {
    match codex_plus_core::watcher::uninstall_watcher() {
        Ok(()) => ok("watcher 已移除。", watcher_payload()),
        Err(error) => failed(&format!("移除 watcher 失败：{error}"), watcher_payload()),
    }
}

#[tauri::command]
pub fn enable_watcher() -> CommandResult<WatcherPayload> {
    match codex_plus_core::watcher::enable_watcher() {
        Ok(()) => ok("watcher 已启用。", watcher_payload()),
        Err(error) => failed(&format!("启用 watcher 失败：{error}"), watcher_payload()),
    }
}

#[tauri::command]
pub fn disable_watcher() -> CommandResult<WatcherPayload> {
    match codex_plus_core::watcher::disable_watcher() {
        Ok(()) => ok("watcher 已禁用。", watcher_payload()),
        Err(error) => failed(&format!("禁用 watcher 失败：{error}"), watcher_payload()),
    }
}

#[tauri::command]
pub fn read_latest_logs(request: LogRequest) -> CommandResult<LogsPayload> {
    let path = codex_plus_core::paths::default_diagnostic_log_path();
    match read_tail(&path, request.lines) {
        Ok(text) => ok(
            "日志已读取。",
            LogsPayload {
                path: path.to_string_lossy().to_string(),
                lines: request.lines,
                text,
            },
        ),
        Err(error) => failed(
            &format!("读取日志失败：{error}"),
            LogsPayload {
                path: path.to_string_lossy().to_string(),
                lines: request.lines,
                text: String::new(),
            },
        ),
    }
}

#[tauri::command]
pub fn copy_diagnostics() -> CommandResult<DiagnosticsPayload> {
    ok(
        "诊断报告已生成。",
        DiagnosticsPayload {
            report: diagnostics_report(),
        },
    )
}

fn open_url(url: &str) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        codex_plus_core::windows_open_url(url)
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(Into::into)
    }
}
