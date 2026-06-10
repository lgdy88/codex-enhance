use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use codex_plus_core::remote::{
    RemoteControlCheck, RemoteControlConfig, RemoteControlStatus, RemoteControlStore,
};
use codex_plus_core::remote_bot::{
    RemoteBotInventory, RemoteBotResponse, RemoteProject, RemoteThread,
};
use codex_plus_core::remote_bridge::{RemoteBridgeController, RemoteBridgeStatus};
use codex_plus_core::settings::{BackendSettings, SettingsStore};
use codex_plus_core::status::{LaunchStatus, StatusStore};
use codex_plus_core::user_scripts::UserScriptManager;
use serde::Serialize;
use serde_json::{Value, json};

use crate::install::{self, InstallActionResult};

pub mod image;
pub mod maintenance;
pub mod remote;
pub mod settings;
pub mod update;
pub use update::{check_update, perform_update};

#[derive(Debug, Clone, Serialize)]
pub struct CommandResult<T>
where
    T: Serialize,
{
    pub status: String,
    pub message: String,
    #[serde(flatten)]
    pub payload: T,
}

#[derive(Debug, Clone, Serialize)]
pub struct VersionPayload {
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PathState {
    pub status: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OverviewPayload {
    pub codex_app: PathState,
    pub codex_version: Option<String>,
    pub silent_shortcut: PathState,
    pub management_shortcut: PathState,
    pub latest_launch: Option<LaunchStatus>,
    pub current_version: String,
    pub update_status: String,
    pub settings_path: String,
    pub logs_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SettingsPayload {
    pub settings: BackendSettings,
    pub settings_path: String,
    pub user_scripts: Value,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    #[serde(default)]
    pub app_path: String,
    #[serde(default)]
    pub extra_args: Vec<String>,
    #[serde(default = "default_debug_port")]
    pub debug_port: u16,
    #[serde(default = "default_helper_port")]
    pub helper_port: u16,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogRequest {
    #[serde(default = "default_log_lines")]
    pub lines: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogsPayload {
    pub path: String,
    pub text: String,
    pub lines: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticsPayload {
    pub report: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WatcherPayload {
    pub enabled: bool,
    pub disabled_flag: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialPluginHealthPayload {
    pub health: codex_plus_core::official_plugin_doctor::OfficialPluginHealthReport,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupPayload {
    pub show_update: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlPayload {
    pub config: RemoteControlConfig,
    pub status: RemoteControlStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDependencyPayload {
    pub checks: Vec<RemoteControlCheck>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInventoryPayload {
    pub inventory: codex_plus_data::CodexRemoteInventory,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBotMessageRequest {
    #[serde(default)]
    pub chat_id: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBotMessagePayload {
    pub response: RemoteBotResponse,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBridgePayload {
    pub bridge: RemoteBridgeStatus,
    pub log: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationPayload {
    pub config: codex_plus_core::image::ImageGenerationPublicConfig,
    pub config_path: String,
    pub output_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGeneratedPayload {
    pub path: String,
    pub preview_data_url: String,
    pub model: String,
    pub size: String,
    pub output_format: String,
    pub created_at_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageFileActionPayload {
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptAgentPayload {
    pub config: codex_plus_core::prompt_agent::PromptAgentPublicConfig,
    pub config_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptEnhancedPayload {
    pub prompt: String,
    pub model: String,
    pub created_at_ms: u64,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveGeneratedImageRequest {
    pub source_path: String,
    pub target_path: String,
}

#[tauri::command]
pub fn backend_version() -> CommandResult<VersionPayload> {
    ok(
        "后端版本已读取。",
        VersionPayload {
            version: codex_plus_core::version::VERSION.to_string(),
        },
    )
}

#[tauri::command]
pub fn startup_options() -> CommandResult<StartupPayload> {
    ok(
        "启动参数已读取。",
        StartupPayload {
            show_update: startup_should_show_update(),
        },
    )
}

pub fn startup_should_show_update() -> bool {
    should_show_update(
        std::env::args(),
        std::env::var("CODEX_PLUS_SHOW_UPDATE").ok().as_deref(),
    )
}

fn should_show_update<I, S>(args: I, env_value: Option<&str>) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().any(|arg| arg.as_ref() == "--show-update") || env_value == Some("1")
}

#[tauri::command]
pub async fn load_overview() -> CommandResult<OverviewPayload> {
    let payload = tauri::async_runtime::spawn_blocking(load_overview_payload).await;
    let Ok((codex_app_path, entrypoints, latest_launch)) = payload else {
        return failed(
            "概览后台任务失败。",
            OverviewPayload {
                codex_app: path_state(None),
                codex_version: None,
                silent_shortcut: path_state(None),
                management_shortcut: path_state(None),
                latest_launch: None,
                current_version: codex_plus_core::version::VERSION.to_string(),
                update_status: "not_checked".to_string(),
                settings_path: codex_plus_core::paths::default_settings_path()
                    .to_string_lossy()
                    .to_string(),
                logs_path: codex_plus_core::paths::default_diagnostic_log_path()
                    .to_string_lossy()
                    .to_string(),
            },
        );
    };
    ok(
        "概览已加载。",
        OverviewPayload {
            codex_version: codex_app_path
                .as_deref()
                .and_then(codex_plus_core::app_paths::codex_app_version),
            codex_app: path_state(codex_app_path),
            silent_shortcut: shortcut_state(entrypoints.silent_shortcut),
            management_shortcut: shortcut_state(entrypoints.management_shortcut),
            latest_launch,
            current_version: codex_plus_core::version::VERSION.to_string(),
            update_status: "not_checked".to_string(),
            settings_path: codex_plus_core::paths::default_settings_path()
                .to_string_lossy()
                .to_string(),
            logs_path: codex_plus_core::paths::default_diagnostic_log_path()
                .to_string_lossy()
                .to_string(),
        },
    )
}

#[tauri::command]
pub fn launch_codex_plus(request: LaunchRequest) -> CommandResult<Value> {
    spawn_codex_plus_launch(request, "启动任务已在后台开始，可稍后查看概览状态。")
}

#[tauri::command]
pub fn restart_codex_plus(request: LaunchRequest) -> CommandResult<Value> {
    codex_plus_core::watcher::stop_launcher_processes();
    codex_plus_core::watcher::stop_codex_processes();
    spawn_codex_plus_launch(request, "Codex 已请求重启，启动任务正在后台运行。")
}

fn spawn_codex_plus_launch(request: LaunchRequest, accepted_message: &str) -> CommandResult<Value> {
    let debug_port = request.debug_port;
    let helper_port = request.helper_port;
    let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
        "manager.launch_requested",
        json!({
            "debug_port": debug_port,
            "helper_port": helper_port,
            "app_path": request.app_path.trim(),
            "extra_args": request.extra_args
        }),
    );
    match spawn_silent_launcher(&request) {
        Ok(()) => CommandResult {
            status: "accepted".to_string(),
            message: accepted_message.to_string(),
            payload: json!({
                "debugPort": debug_port,
                "helperPort": helper_port
            }),
        },
        Err(error) => failed(
            &format!("启动静默入口失败：{error}"),
            json!({
                "debugPort": debug_port,
                "helperPort": helper_port
            }),
        ),
    }
}

fn spawn_silent_launcher(request: &LaunchRequest) -> anyhow::Result<()> {
    let launcher = codex_plus_core::install::resolve_silent_launcher();
    let mut command = std::process::Command::new(&launcher);
    if !request.app_path.trim().is_empty() {
        command.arg("--app-path").arg(request.app_path.trim());
    }
    for arg in codex_plus_core::settings::normalize_codex_extra_args(&request.extra_args) {
        command.arg("--codex-arg").arg(arg);
    }
    command
        .arg("--debug-port")
        .arg(request.debug_port.to_string())
        .arg("--helper-port")
        .arg(request.helper_port.to_string());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| anyhow::anyhow!("无法启动 {}：{error}", launcher.to_string_lossy()))
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserScriptKeyRequest {
    pub key: String,
}

#[tauri::command]
pub async fn sync_providers_now() -> CommandResult<Value> {
    let result = tauri::async_runtime::spawn_blocking(|| codex_plus_data::run_provider_sync(None))
        .await
        .map_err(|error| anyhow::anyhow!("provider sync task failed: {error}"));
    match result {
        Ok(sync) => ok(
            &format!(
                "供应商已同步一次：{} 个会话文件，{} 行索引。",
                sync.changed_session_files, sync.sqlite_rows_updated
            ),
            json!({
                "syncStatus": sync.status,
                "targetProvider": sync.target_provider,
                "changedSessionFiles": sync.changed_session_files,
                "sqliteRowsUpdated": sync.sqlite_rows_updated,
                "backupDir": sync.backup_dir,
                "syncMessage": sync.message,
            }),
        ),
        Err(error) => failed(&format!("供应商同步失败：{error}"), json!({})),
    }
}

#[tauri::command]
pub async fn repair_provider_paths() -> CommandResult<Value> {
    let result =
        tauri::async_runtime::spawn_blocking(|| codex_plus_data::run_provider_path_repair(None))
            .await
            .map_err(|error| anyhow::anyhow!("provider path repair task failed: {error}"));
    match result {
        Ok(sync) => ok(
            &format!(
                "供应商路径已修复：{} 个会话文件，{} 行索引。",
                sync.changed_session_files, sync.sqlite_rows_updated
            ),
            json!({
                "syncStatus": sync.status,
                "targetProvider": sync.target_provider,
                "changedSessionFiles": sync.changed_session_files,
                "sqliteRowsUpdated": sync.sqlite_rows_updated,
                "backupDir": sync.backup_dir,
                "syncMessage": sync.message,
            }),
        ),
        Err(error) => failed(&format!("供应商路径修复失败：{error}"), json!({})),
    }
}

pub(crate) fn settings_payload(
    message: &str,
    failure_context: &str,
) -> CommandResult<SettingsPayload> {
    let store = SettingsStore::default();
    let settings_path = codex_plus_core::paths::default_settings_path()
        .to_string_lossy()
        .to_string();
    match store.load() {
        Ok(settings) => ok(
            message,
            SettingsPayload {
                settings,
                settings_path,
                user_scripts: user_script_inventory(),
            },
        ),
        Err(error) => failed(
            &format!("{failure_context}：{error}"),
            SettingsPayload {
                settings: BackendSettings::default(),
                settings_path,
                user_scripts: user_script_inventory(),
            },
        ),
    }
}

pub(crate) fn user_script_inventory() -> Value {
    default_user_script_manager()
        .inventory()
        .unwrap_or_else(|error| {
            json!({
                "enabled": true,
                "scripts": [],
                "error": error.to_string()
            })
        })
}

pub(crate) fn default_user_script_manager() -> UserScriptManager {
    let config_dir = user_scripts_config_dir();
    let manager = UserScriptManager::new(
        builtin_user_scripts_dir(),
        config_dir.join("user_scripts"),
        config_dir.join("user_scripts.json"),
    );
    let legacy_config_dir = legacy_user_scripts_config_dir();
    let _ = manager.copy_missing_user_assets_from(
        legacy_config_dir.join("user_scripts"),
        legacy_config_dir.join("user_scripts.json"),
    );
    manager
}

fn user_scripts_config_dir() -> PathBuf {
    if cfg!(windows)
        && let Some(roaming) = std::env::var_os("APPDATA")
    {
        return PathBuf::from(roaming).join("Dex");
    }
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| directories::BaseDirs::new().map(|dirs| dirs.home_dir().join(".config")))
        .unwrap_or_else(|| PathBuf::from(".config"))
        .join("Dex")
}

fn legacy_user_scripts_config_dir() -> PathBuf {
    if cfg!(windows)
        && let Some(roaming) = std::env::var_os("APPDATA")
    {
        return PathBuf::from(roaming).join("Codex++");
    }
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| directories::BaseDirs::new().map(|dirs| dirs.home_dir().join(".config")))
        .unwrap_or_else(|| PathBuf::from(".config"))
        .join("Codex++")
}

fn builtin_user_scripts_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .map(|path| path.join("user_scripts"))
        .unwrap_or_else(|| PathBuf::from("user_scripts"))
}

pub(crate) fn diagnostics_report() -> String {
    let (codex_app_path, entrypoints, latest_launch) = load_overview_payload();
    let overview = ok(
        "概览已加载。",
        OverviewPayload {
            codex_version: codex_app_path
                .as_deref()
                .and_then(codex_plus_core::app_paths::codex_app_version),
            codex_app: path_state(codex_app_path),
            silent_shortcut: shortcut_state(entrypoints.silent_shortcut),
            management_shortcut: shortcut_state(entrypoints.management_shortcut),
            latest_launch,
            current_version: codex_plus_core::version::VERSION.to_string(),
            update_status: "not_checked".to_string(),
            settings_path: codex_plus_core::paths::default_settings_path()
                .to_string_lossy()
                .to_string(),
            logs_path: codex_plus_core::paths::default_diagnostic_log_path()
                .to_string_lossy()
                .to_string(),
        },
    );
    let settings = SettingsStore::default().load().unwrap_or_default();
    let remote_store = RemoteControlStore::default();
    let remote_config = remote_store.load().unwrap_or_default();
    let remote_status = codex_plus_core::remote::build_status(&remote_config, remote_store.path());
    let official_plugin_health = codex_plus_core::official_plugin_doctor::check_official_plugins();
    let generated_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    serde_json::to_string_pretty(&json!({
        "generatedAtMs": generated_at_ms,
        "version": codex_plus_core::version::VERSION,
        "overview": overview.payload,
        "settings": settings,
        "remoteControl": {
            "enabled": remote_config.enabled,
            "channel": remote_config.channel,
            "workspacePathSet": !remote_config.workspace_path.is_empty(),
            "routeKey": remote_status.route_key,
            "status": remote_status.status,
            "warnings": remote_status.warnings
        },
        "officialPluginHealth": official_plugin_health,
        "logs": {
            "diagnosticLogPath": codex_plus_core::paths::default_diagnostic_log_path(),
            "latestStatusPath": codex_plus_core::paths::default_latest_status_path()
        },
        "platform": {
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH
        }
    }))
    .unwrap_or_else(|error| format!("诊断报告序列化失败：{error}"))
}

fn load_overview_payload() -> (
    Option<PathBuf>,
    install::EntryPointState,
    Option<LaunchStatus>,
) {
    let settings = SettingsStore::default().load().unwrap_or_default();
    (
        codex_plus_core::app_paths::resolve_codex_app_dir_with_saved(
            None,
            Some(settings.codex_app_path.as_str()),
        ),
        install::inspect_entrypoints(),
        StatusStore::default().load_latest().unwrap_or(None),
    )
}

pub(crate) fn load_remote_inventory_value() -> codex_plus_data::CodexRemoteInventory {
    let state_db = directories::BaseDirs::new()
        .map(|dirs| dirs.home_dir().join(".codex").join("state_5.sqlite"))
        .unwrap_or_else(|| PathBuf::from(".codex").join("state_5.sqlite"));
    let adapter = codex_plus_data::SQLiteStorageAdapter::new(
        state_db,
        codex_plus_data::BackupStore::new(
            codex_plus_core::paths::default_app_state_dir().join("remote-inventory-backups"),
        ),
    );
    adapter.remote_inventory(300)
}

pub(crate) fn inventory_for_bot(
    inventory: codex_plus_data::CodexRemoteInventory,
) -> RemoteBotInventory {
    RemoteBotInventory {
        projects: inventory
            .projects
            .into_iter()
            .map(|project| RemoteProject {
                name: project.name,
                cwd: project.cwd,
                thread_count: project.thread_count,
                latest_updated_at_ms: project.latest_updated_at_ms,
            })
            .collect(),
        threads: inventory
            .threads
            .into_iter()
            .map(|thread| RemoteThread {
                id: thread.id,
                title: thread.title,
                cwd: thread.cwd,
                archived: thread.archived,
                updated_at_ms: thread.updated_at_ms,
            })
            .collect(),
    }
}

pub(crate) fn write_remote_inventory_snapshot() -> anyhow::Result<()> {
    let inventory = inventory_for_bot(load_remote_inventory_value());
    let path = codex_plus_core::paths::default_remote_inventory_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(&inventory)?;
    write_file_atomic(&path, &bytes)
}

fn write_file_atomic(path: &Path, bytes: &[u8]) -> anyhow::Result<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(tmp, path)?;
    Ok(())
}

pub(crate) fn remote_control_payload(
    success_message: &str,
    failure_prefix: &str,
) -> CommandResult<RemoteControlPayload> {
    let store = RemoteControlStore::default();
    let config = store.load().unwrap_or_default();
    let status = codex_plus_core::remote::build_status(&config, store.path());
    match store.load() {
        Ok(config) => ok(
            success_message,
            RemoteControlPayload {
                status: codex_plus_core::remote::build_status(&config, store.path()),
                config,
            },
        ),
        Err(error) => failed(
            &format!("{failure_prefix}：{error}"),
            RemoteControlPayload { config, status },
        ),
    }
}

pub(crate) fn remote_bridge_payload(success_message: &str) -> CommandResult<RemoteBridgePayload> {
    ok(success_message, remote_bridge_payload_value())
}

pub(crate) fn remote_bridge_payload_value() -> RemoteBridgePayload {
    let controller = RemoteBridgeController::default();
    let bridge = controller.status();
    let log = controller.read_log(160).unwrap_or_default();
    RemoteBridgePayload { bridge, log }
}

pub(crate) fn install_background_failure(
    action: &str,
    error: impl std::fmt::Display,
) -> InstallActionResult {
    let state = install::inspect_entrypoints();
    InstallActionResult {
        status: "failed".to_string(),
        message: format!("{action}后台任务失败：{error}"),
        silent_shortcut: state.silent_shortcut,
        management_shortcut: state.management_shortcut,
    }
}

pub(crate) fn watcher_payload() -> WatcherPayload {
    let flag = codex_plus_core::watcher::default_watcher_disabled_flag();
    WatcherPayload {
        enabled: !flag.exists(),
        disabled_flag: flag.to_string_lossy().to_string(),
    }
}

pub(crate) fn read_tail(path: &Path, max_lines: usize) -> std::io::Result<String> {
    let contents = fs::read_to_string(path)?;
    let mut lines = contents.lines().rev().take(max_lines).collect::<Vec<_>>();
    lines.reverse();
    Ok(lines.join("\n"))
}

fn path_state(path: Option<PathBuf>) -> PathState {
    match path {
        Some(path) => PathState {
            status: "found".to_string(),
            path: Some(path.to_string_lossy().to_string()),
        },
        None => PathState {
            status: "missing".to_string(),
            path: None,
        },
    }
}

fn shortcut_state(shortcut: install::ShortcutState) -> PathState {
    PathState {
        status: if shortcut.installed {
            "installed".to_string()
        } else {
            "missing".to_string()
        },
        path: shortcut.path,
    }
}

pub(crate) fn ok<T: Serialize>(message: &str, payload: T) -> CommandResult<T> {
    CommandResult {
        status: "ok".to_string(),
        message: message.to_string(),
        payload,
    }
}

pub(crate) fn failed<T: Serialize>(message: &str, payload: T) -> CommandResult<T> {
    CommandResult {
        status: "failed".to_string(),
        message: message.to_string(),
        payload,
    }
}

pub(crate) fn default_debug_port() -> u16 {
    9229
}

fn default_helper_port() -> u16 {
    57321
}

fn default_log_lines() -> usize {
    200
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backend_version_returns_structured_payload() {
        let result = backend_version();

        assert_eq!(result.status, "ok");
        assert!(!result.payload.version.is_empty());
    }

    #[test]
    fn startup_options_returns_structured_payload() {
        let result = startup_options();

        assert_eq!(result.status, "ok");
    }

    #[test]
    fn startup_options_honors_show_update_environment() {
        unsafe {
            std::env::set_var("CODEX_PLUS_SHOW_UPDATE", "1");
        }

        let result = startup_options();

        unsafe {
            std::env::remove_var("CODEX_PLUS_SHOW_UPDATE");
        }

        assert_eq!(result.status, "ok");
        assert!(result.payload.show_update);
    }

    #[test]
    fn startup_options_honors_show_update_argument() {
        assert!(should_show_update(
            ["codex-plus-plus-manager.exe", "--show-update"],
            None
        ));
    }

    #[test]
    fn overview_contains_expected_operational_fields() {
        let result = tauri::async_runtime::block_on(load_overview());

        assert_eq!(result.status, "ok");
        assert!(!result.payload.current_version.is_empty());
        assert!(
            result.payload.codex_version.is_none()
                || result
                    .payload
                    .codex_version
                    .as_deref()
                    .is_some_and(|version| !version.is_empty())
        );
        assert!(matches!(
            result.payload.codex_app.status.as_str(),
            "found" | "missing"
        ));
        assert!(matches!(
            result.payload.silent_shortcut.status.as_str(),
            "installed" | "missing"
        ));
    }

    #[test]
    fn update_install_requires_release_payload() {
        let result = tauri::async_runtime::block_on(perform_update(None));

        assert_eq!(result.status, "failed");
        assert!(result.message.contains("请先检查更新"));
    }

    #[test]
    fn watcher_state_returns_disabled_flag_path() {
        let result = maintenance::load_watcher_state();

        assert_eq!(result.status, "ok");
        assert!(result.payload.disabled_flag.contains("watcher.disabled"));
    }

    #[test]
    fn missing_logs_return_failed_status() {
        let result = maintenance::read_latest_logs(LogRequest { lines: 25 });

        if result.payload.text.is_empty() {
            assert_eq!(result.status, "failed");
        }
    }

    #[test]
    fn open_external_url_rejects_non_http_urls() {
        let result = maintenance::open_external_url("file:///C:/Windows/win.ini".to_string());

        assert_eq!(result.status, "failed");
        assert!(result.message.contains("只允许打开 http 或 https 链接"));
    }
}
