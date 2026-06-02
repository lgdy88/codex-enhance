use std::path::{Path, PathBuf};

use anyhow::Context;
use serde_json::json;

use crate::settings::atomic_write;

const DEFAULT_APP_SERVER_PORT: u16 = 54322;
const DEFAULT_REMOTE_BIND_HOST: &str = "127.0.0.1";
const DEFAULT_THREAD_NAME: &str = "Feishu - Dex";
const SAFE_APPROVAL_POLICY: &str = "on-request";
const SAFE_SANDBOX: &str = "workspace-write";
const STATUS_ENABLED_READY: &str = "ready";
const STATUS_DISABLED: &str = "disabled";
const STATUS_INCOMPLETE: &str = "incomplete";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_remote_channel")]
    pub channel: String,
    #[serde(default)]
    pub workspace_name: String,
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub lark_app_id: String,
    #[serde(default)]
    pub lark_app_secret: String,
    #[serde(default)]
    pub lark_encrypt_key: String,
    #[serde(default)]
    pub lark_verification_token: String,
    #[serde(default = "default_thread_name")]
    pub thread_name: String,
    #[serde(default)]
    pub thread_id: String,
    #[serde(default)]
    pub feishu_chat_id: String,
    #[serde(default)]
    pub feishu_user_id: String,
    #[serde(default)]
    pub auto_bind_p2p: bool,
    #[serde(default = "default_app_server_port")]
    pub app_server_port: u16,
    #[serde(default = "default_remote_bind_host")]
    pub bind_host: String,
    #[serde(default = "default_approval_policy")]
    pub approval_policy: String,
    #[serde(default = "default_sandbox")]
    pub sandbox: String,
}

impl Default for RemoteControlConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            channel: default_remote_channel(),
            workspace_name: String::new(),
            workspace_path: String::new(),
            lark_app_id: String::new(),
            lark_app_secret: String::new(),
            lark_encrypt_key: String::new(),
            lark_verification_token: String::new(),
            thread_name: DEFAULT_THREAD_NAME.to_string(),
            thread_id: String::new(),
            feishu_chat_id: String::new(),
            feishu_user_id: String::new(),
            auto_bind_p2p: false,
            app_server_port: DEFAULT_APP_SERVER_PORT,
            bind_host: DEFAULT_REMOTE_BIND_HOST.to_string(),
            approval_policy: SAFE_APPROVAL_POLICY.to_string(),
            sandbox: SAFE_SANDBOX.to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlStatus {
    pub status: String,
    pub message: String,
    pub config_path: String,
    pub workspace_ready: bool,
    pub app_server_url: String,
    pub route_key: String,
    pub warnings: Vec<String>,
    pub commands: RemoteControlCommands,
    pub checks: Vec<RemoteControlCheck>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlCommands {
    pub codex_app_server: String,
    pub feishu_bridge_env: Vec<String>,
    pub feishu_bridge_notes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlCheck {
    pub key: String,
    pub label: String,
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Clone)]
pub struct RemoteControlStore {
    path: PathBuf,
}

impl Default for RemoteControlStore {
    fn default() -> Self {
        Self::new(crate::paths::default_remote_config_path())
    }
}

impl RemoteControlStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load(&self) -> anyhow::Result<RemoteControlConfig> {
        let contents = match std::fs::read_to_string(&self.path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(RemoteControlConfig::default());
            }
            Err(error) => {
                return Err(error).with_context(|| {
                    format!("failed to read remote config {}", self.path.display())
                });
            }
        };

        Ok(serde_json::from_str(&contents).unwrap_or_default())
    }

    pub fn save(&self, config: &RemoteControlConfig) -> anyhow::Result<RemoteControlConfig> {
        let normalized = normalize_config(config);
        let bytes = serde_json::to_vec_pretty(&normalized)?;
        atomic_write(&self.path, &bytes)?;
        Ok(normalized)
    }
}

pub fn build_status(config: &RemoteControlConfig, config_path: &Path) -> RemoteControlStatus {
    let normalized = normalize_config(config);
    let warnings = warnings_for(&normalized);
    let workspace_ready = workspace_ready(&normalized.workspace_path);
    let workspace_route_ready = workspace_route_ready(&normalized.workspace_path);
    let has_route = !normalized.feishu_chat_id.is_empty()
        || !normalized.feishu_user_id.is_empty()
        || normalized.auto_bind_p2p;
    let status = if !normalized.enabled {
        STATUS_DISABLED
    } else if workspace_route_ready && has_route && warnings.is_empty() {
        STATUS_ENABLED_READY
    } else {
        STATUS_INCOMPLETE
    };
    let message = status_message(status, workspace_route_ready, has_route, &warnings);

    RemoteControlStatus {
        status: status.to_string(),
        message,
        config_path: config_path.to_string_lossy().to_string(),
        workspace_ready,
        app_server_url: app_server_url(&normalized),
        route_key: route_key(&normalized),
        warnings,
        commands: build_commands(&normalized),
        checks: build_checks(&normalized, workspace_ready, has_route),
    }
}

fn normalize_config(config: &RemoteControlConfig) -> RemoteControlConfig {
    let mut next = config.clone();
    next.channel = normalize_channel(&next.channel);
    next.workspace_name = next.workspace_name.trim().to_string();
    next.workspace_path = next.workspace_path.trim().to_string();
    next.lark_app_id = next.lark_app_id.trim().to_string();
    next.lark_app_secret = next.lark_app_secret.trim().to_string();
    next.lark_encrypt_key = next.lark_encrypt_key.trim().to_string();
    next.lark_verification_token = next.lark_verification_token.trim().to_string();
    next.thread_name = if next.thread_name.trim().is_empty() {
        DEFAULT_THREAD_NAME.to_string()
    } else {
        next.thread_name.trim().to_string()
    };
    next.thread_id = next.thread_id.trim().to_string();
    next.feishu_chat_id = next.feishu_chat_id.trim().to_string();
    next.feishu_user_id = next.feishu_user_id.trim().to_string();
    next.app_server_port = normalize_port(next.app_server_port);
    next.bind_host = normalize_bind_host(&next.bind_host);
    next.approval_policy = normalize_approval_policy(&next.approval_policy);
    next.sandbox = normalize_sandbox(&next.sandbox);
    next
}

fn normalize_channel(value: &str) -> String {
    match value.trim() {
        "feishu" => "feishu".to_string(),
        _ => default_remote_channel(),
    }
}

fn normalize_port(port: u16) -> u16 {
    if port == 0 {
        DEFAULT_APP_SERVER_PORT
    } else {
        port
    }
}

fn normalize_bind_host(value: &str) -> String {
    match value.trim() {
        "" => DEFAULT_REMOTE_BIND_HOST.to_string(),
        "::1" => "::1".to_string(),
        "localhost" => "127.0.0.1".to_string(),
        "127.0.0.1" => "127.0.0.1".to_string(),
        other => other.to_string(),
    }
}

fn normalize_approval_policy(value: &str) -> String {
    match value.trim() {
        "untrusted" => "untrusted".to_string(),
        "on-request" => "on-request".to_string(),
        "on-failure" => "on-failure".to_string(),
        "never" => "never".to_string(),
        _ => SAFE_APPROVAL_POLICY.to_string(),
    }
}

fn normalize_sandbox(value: &str) -> String {
    match value.trim() {
        "read-only" => "read-only".to_string(),
        "workspace-write" => "workspace-write".to_string(),
        "danger-full-access" => "danger-full-access".to_string(),
        _ => SAFE_SANDBOX.to_string(),
    }
}

fn workspace_ready(path: &str) -> bool {
    !path.trim().is_empty() && Path::new(path.trim()).is_dir()
}

fn workspace_route_ready(path: &str) -> bool {
    path.trim().is_empty() || workspace_ready(path)
}

fn app_server_url(config: &RemoteControlConfig) -> String {
    format!("ws://{}:{}", config.bind_host, config.app_server_port)
}

fn route_key(config: &RemoteControlConfig) -> String {
    if !config.feishu_chat_id.is_empty() && !config.feishu_user_id.is_empty() {
        return format!("feishu:{}:{}", config.feishu_chat_id, config.feishu_user_id);
    }
    if !config.feishu_chat_id.is_empty() {
        return format!("feishu:chat:{}", config.feishu_chat_id);
    }
    if !config.feishu_user_id.is_empty() {
        return format!("feishu:user:{}", config.feishu_user_id);
    }
    if config.auto_bind_p2p {
        return "feishu:auto-bind-p2p".to_string();
    }
    "feishu:unbound".to_string()
}

fn warnings_for(config: &RemoteControlConfig) -> Vec<String> {
    let mut warnings = Vec::new();
    if config.bind_host != "127.0.0.1" && config.bind_host != "::1" {
        warnings.push("app-server 必须只绑定 loopback；不要暴露到局域网或公网。".to_string());
    }
    if config.approval_policy == "never" {
        warnings.push("远程入口不建议使用 approvalPolicy=never；危险操作应保留确认。".to_string());
    }
    if config.sandbox == "danger-full-access" {
        warnings
            .push("远程入口不建议使用 danger-full-access；默认使用 workspace-write。".to_string());
    }
    if config.auto_bind_p2p
        && (!config.feishu_chat_id.is_empty() || !config.feishu_user_id.is_empty())
    {
        warnings.push("已配置固定飞书 chat/user 时，不需要开启首次私聊自动绑定。".to_string());
    }
    warnings
}

fn status_message(
    status: &str,
    workspace_ready: bool,
    has_route: bool,
    warnings: &[String],
) -> String {
    if status == STATUS_DISABLED {
        return "飞书远程入口未启用；配置会保留但不会作为默认启动项。".to_string();
    }
    if !workspace_ready {
        return "需要先选择一个存在的本地项目目录。".to_string();
    }
    if !has_route {
        return "需要绑定飞书 chat/user，或开启首次私聊自动绑定。".to_string();
    }
    if let Some(warning) = warnings.first() {
        return warning.clone();
    }
    "飞书远程路由配置就绪；可用生成的命令启动本地桥接。".to_string()
}

fn build_commands(config: &RemoteControlConfig) -> RemoteControlCommands {
    let app_server_url = app_server_url(config);
    let mut env = vec![
        format!("FEISHU_CODEX_WORKDIR={}", config.workspace_path),
        format!("FEISHU_CODEX_THREAD_NAME={}", config.thread_name),
        format!("FEISHU_CODEX_APP_SERVER_URL={app_server_url}"),
        format!("FEISHU_CODEX_APP_SERVER_PORT={}", config.app_server_port),
    ];
    if !config.thread_id.is_empty() {
        env.push(format!("FEISHU_CODEX_THREAD_ID={}", config.thread_id));
    }
    if !config.feishu_chat_id.is_empty() {
        env.push(format!("FEISHU_CODEX_CHAT_ID={}", config.feishu_chat_id));
    }
    if !config.feishu_user_id.is_empty() {
        env.push(format!("FEISHU_CODEX_USER_ID={}", config.feishu_user_id));
    }
    if config.auto_bind_p2p {
        env.push("FEISHU_CODEX_AUTO_BIND=1".to_string());
    }

    RemoteControlCommands {
        codex_app_server: format!("codex app-server --listen {app_server_url}"),
        feishu_bridge_env: env,
        feishu_bridge_notes: vec![
            "飞书 bridge 使用官方 Node SDK 长连接接收 im.message.receive_v1 和 card.action.trigger。".to_string(),
            "bridge 进程应运行在本机；不要把 Codex app-server 直接暴露到公网。".to_string(),
            "approvalPolicy 和 sandbox 使用 Dex 的安全默认值；远程入口会拒绝 never / danger-full-access。".to_string(),
            "App Secret 保存于本地远程配置文件；诊断日志只记录是否已配置，不记录明文。".to_string(),
        ],
    }
}

fn build_checks(
    config: &RemoteControlConfig,
    workspace_ready: bool,
    has_route: bool,
) -> Vec<RemoteControlCheck> {
    vec![
        RemoteControlCheck {
            key: "larkCredentials".to_string(),
            label: "Lark 凭据".to_string(),
            status: if config.lark_app_id.is_empty() || config.lark_app_secret.is_empty() {
                "not_checked"
            } else {
                "ok"
            }
            .to_string(),
            detail: if config.lark_app_id.is_empty() || config.lark_app_secret.is_empty() {
                "尚未配置 App ID / App Secret。".to_string()
            } else {
                format!("App ID: {}", config.lark_app_id)
            },
        },
        RemoteControlCheck {
            key: "workspace".to_string(),
            label: "项目目录".to_string(),
            status: if config.workspace_path.is_empty() {
                "not_checked"
            } else if workspace_ready {
                "ok"
            } else {
                "failed"
            }
            .to_string(),
            detail: if config.workspace_path.is_empty() {
                "未预绑定项目；飞书端可用 /项目 动态选择。".to_string()
            } else {
                config.workspace_path.clone()
            },
        },
        RemoteControlCheck {
            key: "route".to_string(),
            label: "飞书路由".to_string(),
            status: if has_route { "ok" } else { "not_checked" }.to_string(),
            detail: route_key(config),
        },
        RemoteControlCheck {
            key: "loopback".to_string(),
            label: "app-server 绑定".to_string(),
            status: if config.bind_host == "127.0.0.1" || config.bind_host == "::1" {
                "ok"
            } else {
                "failed"
            }
            .to_string(),
            detail: app_server_url(config),
        },
        RemoteControlCheck {
            key: "approval".to_string(),
            label: "审批策略".to_string(),
            status: if config.approval_policy == "never" {
                "failed"
            } else {
                "ok"
            }
            .to_string(),
            detail: config.approval_policy.clone(),
        },
        RemoteControlCheck {
            key: "sandbox".to_string(),
            label: "沙箱".to_string(),
            status: if config.sandbox == "danger-full-access" {
                "failed"
            } else {
                "ok"
            }
            .to_string(),
            detail: config.sandbox.clone(),
        },
    ]
}

pub fn dependency_checks() -> Vec<RemoteControlCheck> {
    vec![
        command_check("codex", &["--version"], "Codex CLI"),
        command_check("node", &["--version"], "Node.js"),
        command_check("lark-cli", &["--version"], "lark-cli fallback"),
    ]
}

fn command_check(command: &str, args: &[&str], label: &str) -> RemoteControlCheck {
    match std::process::Command::new(command).args(args).output() {
        Ok(output) if output.status.success() => RemoteControlCheck {
            key: command.to_string(),
            label: label.to_string(),
            status: "ok".to_string(),
            detail: first_line(&output.stdout).unwrap_or_else(|| "命令可用。".to_string()),
        },
        Ok(output) => RemoteControlCheck {
            key: command.to_string(),
            label: label.to_string(),
            status: "failed".to_string(),
            detail: first_line(&output.stderr).unwrap_or_else(|| {
                format!("命令退出码：{}", output.status.code().unwrap_or_default())
            }),
        },
        Err(error) => RemoteControlCheck {
            key: command.to_string(),
            label: label.to_string(),
            status: "not_checked".to_string(),
            detail: format!("未找到或无法运行：{error}"),
        },
    }
}

fn first_line(bytes: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(bytes);
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToString::to_string)
}

pub fn audit_remote_config_saved(config: &RemoteControlConfig) -> serde_json::Value {
    json!({
        "enabled": config.enabled,
        "channel": config.channel,
        "workspace_path_set": !config.workspace_path.is_empty(),
        "lark_app_id_set": !config.lark_app_id.is_empty(),
        "lark_app_secret_set": !config.lark_app_secret.is_empty(),
        "lark_encrypt_key_set": !config.lark_encrypt_key.is_empty(),
        "lark_verification_token_set": !config.lark_verification_token.is_empty(),
        "thread_id_set": !config.thread_id.is_empty(),
        "feishu_chat_id_set": !config.feishu_chat_id.is_empty(),
        "feishu_user_id_set": !config.feishu_user_id.is_empty(),
        "auto_bind_p2p": config.auto_bind_p2p,
        "bind_host": config.bind_host,
        "approval_policy": config.approval_policy,
        "sandbox": config.sandbox,
    })
}

fn default_remote_channel() -> String {
    "feishu".to_string()
}

fn default_thread_name() -> String {
    DEFAULT_THREAD_NAME.to_string()
}

fn default_app_server_port() -> u16 {
    DEFAULT_APP_SERVER_PORT
}

fn default_remote_bind_host() -> String {
    DEFAULT_REMOTE_BIND_HOST.to_string()
}

fn default_approval_policy() -> String {
    SAFE_APPROVAL_POLICY.to_string()
}

fn default_sandbox() -> String {
    SAFE_SANDBOX.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "codex-plus-core-remote-test-{}-{}",
            std::process::id(),
            NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn default_config_is_disabled_and_safe() {
        let config = RemoteControlConfig::default();

        assert!(!config.enabled);
        assert_eq!(config.bind_host, "127.0.0.1");
        assert_eq!(config.approval_policy, "on-request");
        assert_eq!(config.sandbox, "workspace-write");
    }

    #[test]
    fn store_save_normalizes_values() {
        let dir = temp_dir();
        let store = RemoteControlStore::new(dir.join("remote.json"));
        let saved = store
            .save(&RemoteControlConfig {
                enabled: true,
                workspace_name: " Demo ".to_string(),
                workspace_path: "  C:/demo  ".to_string(),
                lark_app_id: " cli_demo ".to_string(),
                lark_app_secret: " secret ".to_string(),
                lark_encrypt_key: " enc ".to_string(),
                lark_verification_token: " token ".to_string(),
                thread_name: " ".to_string(),
                app_server_port: 0,
                bind_host: "localhost".to_string(),
                approval_policy: "bad".to_string(),
                sandbox: "bad".to_string(),
                ..RemoteControlConfig::default()
            })
            .unwrap();

        assert_eq!(saved.workspace_name, "Demo");
        assert_eq!(saved.workspace_path, "C:/demo");
        assert_eq!(saved.lark_app_id, "cli_demo");
        assert_eq!(saved.lark_app_secret, "secret");
        assert_eq!(saved.lark_encrypt_key, "enc");
        assert_eq!(saved.lark_verification_token, "token");
        assert_eq!(saved.thread_name, DEFAULT_THREAD_NAME);
        assert_eq!(saved.app_server_port, DEFAULT_APP_SERVER_PORT);
        assert_eq!(saved.bind_host, "127.0.0.1");
        assert_eq!(saved.approval_policy, SAFE_APPROVAL_POLICY);
        assert_eq!(saved.sandbox, SAFE_SANDBOX);
        assert_eq!(store.load().unwrap(), saved);
    }

    #[test]
    fn status_requires_workspace_and_route_when_enabled() {
        let dir = temp_dir();
        let config = RemoteControlConfig {
            enabled: true,
            workspace_path: dir.to_string_lossy().to_string(),
            feishu_chat_id: "chat-1".to_string(),
            ..RemoteControlConfig::default()
        };

        let status = build_status(&config, Path::new("remote.json"));

        assert_eq!(status.status, STATUS_ENABLED_READY);
        assert!(status.workspace_ready);
        assert_eq!(status.route_key, "feishu:chat:chat-1");
    }

    #[test]
    fn status_rejects_public_host_and_dangerous_defaults() {
        let dir = temp_dir();
        let config = RemoteControlConfig {
            enabled: true,
            workspace_path: dir.to_string_lossy().to_string(),
            feishu_chat_id: "chat-1".to_string(),
            bind_host: "0.0.0.0".to_string(),
            approval_policy: "never".to_string(),
            sandbox: "danger-full-access".to_string(),
            ..RemoteControlConfig::default()
        };

        let status = build_status(&config, Path::new("remote.json"));

        assert_eq!(status.status, STATUS_INCOMPLETE);
        assert_eq!(status.warnings.len(), 3);
        assert!(status.warnings[0].contains("loopback"));
    }

    #[test]
    fn route_key_prefers_chat_and_user_pair() {
        let config = RemoteControlConfig {
            feishu_chat_id: "chat".to_string(),
            feishu_user_id: "user".to_string(),
            auto_bind_p2p: true,
            ..RemoteControlConfig::default()
        };

        assert_eq!(route_key(&config), "feishu:chat:user");
    }
}
