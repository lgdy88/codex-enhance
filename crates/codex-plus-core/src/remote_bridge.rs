use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context;

use crate::remote::{RemoteControlConfig, RemoteControlStore};
use crate::settings::atomic_write;

const EMBEDDED_BRIDGE_SCRIPT: &str =
    include_str!("../../../apps/codex-plus-manager/scripts/feishu-bridge.mjs");
const STATUS_RUNNING: &str = "running";
const STATUS_STOPPED: &str = "stopped";
const STATUS_FAILED: &str = "failed";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBridgeStatus {
    pub status: String,
    pub message: String,
    pub pid: Option<u32>,
    pub started_at_ms: Option<u64>,
    pub stopped_at_ms: Option<u64>,
    pub script_path: String,
    pub config_path: String,
    pub log_path: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteAppServerState {
    pid: u32,
    started_at_ms: u64,
    listen_url: String,
    log_path: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteBridgeState {
    pid: u32,
    started_at_ms: u64,
    script_path: String,
    config_path: String,
    log_path: String,
}

#[derive(Debug, Clone)]
pub struct RemoteBridgeController {
    status_path: PathBuf,
    log_path: PathBuf,
    script_path: PathBuf,
    config_path: PathBuf,
}

impl Default for RemoteBridgeController {
    fn default() -> Self {
        Self::new(
            crate::paths::default_remote_bridge_status_path(),
            crate::paths::default_remote_bridge_log_path(),
            default_bridge_script_path(),
            crate::paths::default_remote_config_path(),
        )
    }
}

impl RemoteBridgeController {
    pub fn new(
        status_path: PathBuf,
        log_path: PathBuf,
        script_path: PathBuf,
        config_path: PathBuf,
    ) -> Self {
        Self {
            status_path,
            log_path,
            script_path,
            config_path,
        }
    }

    pub fn status(&self) -> RemoteBridgeStatus {
        match self.read_state() {
            Ok(Some(state)) if process_running(state.pid) => self.running_status(state),
            Ok(Some(state)) => self.stopped_status(
                format!("飞书桥接进程 {} 已退出。", state.pid),
                Some(state.started_at_ms),
            ),
            Ok(None) => self.stopped_status("飞书桥接尚未启动。".to_string(), None),
            Err(error) => self.failed_status(format!("读取飞书桥接状态失败：{error}")),
        }
    }

    pub fn start(&self, config: &RemoteControlConfig) -> anyhow::Result<RemoteBridgeStatus> {
        if let Ok(Some(state)) = self.read_state() {
            if process_running(state.pid) {
                return Ok(self.running_status(state));
            }
        }
        self.materialize_script()?;
        if !self.script_path.is_file() {
            anyhow::bail!("未找到飞书桥接脚本：{}", self.script_path.to_string_lossy());
        }
        validate_launch_config(config)?;
        ensure_app_server_running(config, &self.log_path)?;
        if let Some(parent) = self.log_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        append_log_line(&self.log_path, "starting feishu bridge")?;
        let stdout = log_file(&self.log_path)?;
        let stderr = log_file(&self.log_path)?;
        let mut command = Command::new(node_command());
        command
            .arg(&self.script_path)
            .arg("--config")
            .arg(&self.config_path)
            .arg("--state")
            .arg(crate::paths::default_remote_bot_state_path())
            .arg("--log")
            .arg(&self.log_path)
            .env("DEX_REMOTE_CONFIG", &self.config_path)
            .env(
                "DEX_REMOTE_BOT_STATE",
                crate::paths::default_remote_bot_state_path(),
            )
            .env("DEX_REMOTE_BRIDGE_LOG", &self.log_path)
            .env("DEX_REMOTE_NODE_MODULES", default_node_modules_path())
            .stdin(Stdio::null())
            .stdout(Stdio::from(stdout))
            .stderr(Stdio::from(stderr));
        command.current_dir(default_bridge_workdir());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(crate::windows_create_no_window());
        }
        let child = command.spawn().with_context(|| {
            format!(
                "无法启动 Node 飞书桥接脚本 {}",
                self.script_path.to_string_lossy()
            )
        })?;
        let state = RemoteBridgeState {
            pid: child.id(),
            started_at_ms: now_ms(),
            script_path: self.script_path.to_string_lossy().to_string(),
            config_path: self.config_path.to_string_lossy().to_string(),
            log_path: self.log_path.to_string_lossy().to_string(),
        };
        self.write_state(&state)?;
        Ok(self.running_status(state))
    }

    pub fn stop(&self) -> anyhow::Result<RemoteBridgeStatus> {
        let Some(state) = self.read_state()? else {
            stop_managed_app_server(&self.log_path)?;
            return Ok(self.stopped_status("飞书桥接尚未启动。".to_string(), None));
        };
        if process_running(state.pid) {
            kill_process(state.pid)?;
            append_log_line(
                &self.log_path,
                &format!("stop requested for pid {}", state.pid),
            )?;
        }
        let _ = std::fs::remove_file(&self.status_path);
        stop_managed_app_server(&self.log_path)?;
        Ok(self.stopped_status(
            format!("飞书桥接已请求停止：{}", state.pid),
            Some(state.started_at_ms),
        ))
    }

    pub fn read_log(&self, max_lines: usize) -> anyhow::Result<String> {
        let contents = match std::fs::read_to_string(&self.log_path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(String::new()),
            Err(error) => return Err(error.into()),
        };
        let mut lines = contents.lines().rev().take(max_lines).collect::<Vec<_>>();
        lines.reverse();
        Ok(lines.join("\n"))
    }

    fn read_state(&self) -> anyhow::Result<Option<RemoteBridgeState>> {
        let contents = match std::fs::read_to_string(&self.status_path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        Ok(serde_json::from_str(&contents).ok())
    }

    fn write_state(&self, state: &RemoteBridgeState) -> anyhow::Result<()> {
        if let Some(parent) = self.status_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let bytes = serde_json::to_vec_pretty(state)?;
        atomic_write(&self.status_path, &bytes)
    }

    fn materialize_script(&self) -> anyhow::Result<()> {
        if let Some(parent) = self.script_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let needs_write = std::fs::read_to_string(&self.script_path)
            .map(|current| current != EMBEDDED_BRIDGE_SCRIPT)
            .unwrap_or(true);
        if needs_write {
            atomic_write(&self.script_path, EMBEDDED_BRIDGE_SCRIPT.as_bytes())?;
        }
        Ok(())
    }

    fn running_status(&self, state: RemoteBridgeState) -> RemoteBridgeStatus {
        RemoteBridgeStatus {
            status: STATUS_RUNNING.to_string(),
            message: format!("飞书桥接运行中：pid {}", state.pid),
            pid: Some(state.pid),
            started_at_ms: Some(state.started_at_ms),
            stopped_at_ms: None,
            script_path: state.script_path,
            config_path: state.config_path,
            log_path: state.log_path,
        }
    }

    fn stopped_status(&self, message: String, started_at_ms: Option<u64>) -> RemoteBridgeStatus {
        RemoteBridgeStatus {
            status: STATUS_STOPPED.to_string(),
            message,
            pid: None,
            started_at_ms,
            stopped_at_ms: Some(now_ms()),
            script_path: self.script_path.to_string_lossy().to_string(),
            config_path: self.config_path.to_string_lossy().to_string(),
            log_path: self.log_path.to_string_lossy().to_string(),
        }
    }

    fn failed_status(&self, message: String) -> RemoteBridgeStatus {
        RemoteBridgeStatus {
            status: STATUS_FAILED.to_string(),
            message,
            pid: None,
            started_at_ms: None,
            stopped_at_ms: Some(now_ms()),
            script_path: self.script_path.to_string_lossy().to_string(),
            config_path: self.config_path.to_string_lossy().to_string(),
            log_path: self.log_path.to_string_lossy().to_string(),
        }
    }
}

pub fn start_default_bridge() -> anyhow::Result<RemoteBridgeStatus> {
    let store = RemoteControlStore::default();
    let config = store.load()?;
    RemoteBridgeController::default().start(&config)
}

fn validate_launch_config(config: &RemoteControlConfig) -> anyhow::Result<()> {
    if !config.enabled {
        anyhow::bail!("请先启用飞书远程入口配置。");
    }
    if config.lark_app_id.trim().is_empty() || config.lark_app_secret.trim().is_empty() {
        anyhow::bail!("请先配置 Lark/飞书 App ID 和 App Secret。");
    }
    if config.feishu_chat_id.trim().is_empty()
        && config.feishu_user_id.trim().is_empty()
        && !config.auto_bind_p2p
    {
        anyhow::bail!("请先绑定飞书 chat/user，或开启首次私聊自动绑定。");
    }
    if !config.workspace_path.trim().is_empty()
        && !std::path::Path::new(config.workspace_path.trim()).is_dir()
    {
        anyhow::bail!("预绑定项目目录不存在；可清空项目路径后由飞书 /项目 动态选择。");
    }
    if config.bind_host != "127.0.0.1" && config.bind_host != "::1" {
        anyhow::bail!("app-server 只能绑定 loopback；请改为 127.0.0.1 或 ::1。");
    }
    if config.approval_policy == "never" {
        anyhow::bail!("远程入口拒绝使用 approvalPolicy=never。");
    }
    if config.sandbox == "danger-full-access" {
        anyhow::bail!("远程入口拒绝使用 danger-full-access。");
    }
    Ok(())
}

fn default_bridge_script_path() -> PathBuf {
    crate::paths::default_app_state_dir().join("feishu-bridge.mjs")
}

fn default_app_server_status_path() -> PathBuf {
    crate::paths::default_app_state_dir().join("remote-app-server-status.json")
}

fn default_app_server_log_path() -> PathBuf {
    crate::paths::default_app_state_dir().join("remote-app-server.log")
}

fn default_bridge_workdir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("apps")
        .join("codex-plus-manager")
}

fn default_node_modules_path() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .map(|path| path.join("node_modules"))
        .filter(|path| path.is_dir())
        .unwrap_or_else(|| default_bridge_workdir().join("node_modules"))
}

fn log_file(path: &Path) -> anyhow::Result<File> {
    Ok(OpenOptions::new().create(true).append(true).open(path)?)
}

fn append_log_line(path: &Path, message: &str) -> std::io::Result<()> {
    use std::io::Write;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(file, "[{}] {message}", now_ms())
}

fn ensure_app_server_running(
    config: &RemoteControlConfig,
    bridge_log_path: &Path,
) -> anyhow::Result<()> {
    let listen_url = format!("ws://{}:{}", config.bind_host, config.app_server_port);
    let status_path = default_app_server_status_path();
    if let Ok(Some(state)) = read_app_server_state(&status_path) {
        if state.listen_url == listen_url && process_running(state.pid) {
            return Ok(());
        }
    }
    if tcp_port_listening(config.app_server_port) {
        return Ok(());
    }
    let log_path = default_app_server_log_path();
    append_log_line(
        bridge_log_path,
        &format!("starting codex app-server {listen_url}"),
    )?;
    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let stdout = log_file(&log_path)?;
    let stderr = log_file(&log_path)?;
    let mut command = Command::new("codex");
    command
        .args(["app-server", "--listen", &listen_url])
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(crate::windows_create_no_window());
    }
    let child = command
        .spawn()
        .with_context(|| format!("无法启动 Codex app-server：{listen_url}"))?;
    let state = RemoteAppServerState {
        pid: child.id(),
        started_at_ms: now_ms(),
        listen_url,
        log_path: log_path.to_string_lossy().to_string(),
    };
    write_app_server_state(&status_path, &state)?;
    wait_for_app_server(config.app_server_port, bridge_log_path)
}

fn stop_managed_app_server(bridge_log_path: &Path) -> anyhow::Result<()> {
    let status_path = default_app_server_status_path();
    let Some(state) = read_app_server_state(&status_path)? else {
        return Ok(());
    };
    if process_running(state.pid) {
        kill_process(state.pid)?;
        append_log_line(
            bridge_log_path,
            &format!("stop requested for codex app-server pid {}", state.pid),
        )?;
    }
    let _ = std::fs::remove_file(status_path);
    Ok(())
}

fn read_app_server_state(path: &Path) -> anyhow::Result<Option<RemoteAppServerState>> {
    let contents = match std::fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    Ok(serde_json::from_str(&contents).ok())
}

fn write_app_server_state(path: &Path, state: &RemoteAppServerState) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(state)?;
    atomic_write(path, &bytes)
}

fn wait_for_app_server(port: u16, bridge_log_path: &Path) -> anyhow::Result<()> {
    let mut last_error = None;
    for _ in 0..40 {
        if tcp_port_listening(port) {
            append_log_line(
                bridge_log_path,
                &format!("codex app-server ready on {port}"),
            )?;
            return Ok(());
        }
        if let Err(error) = try_connect_port(port) {
            last_error = Some(error);
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Codex app-server 未监听端口 {port}")))
}

fn tcp_port_listening(port: u16) -> bool {
    try_connect_port(port).is_ok()
}

fn try_connect_port(port: u16) -> anyhow::Result<()> {
    let addr = format!("127.0.0.1:{port}");
    let stream = std::net::TcpStream::connect_timeout(
        &addr.parse()?,
        std::time::Duration::from_millis(220),
    )?;
    drop(stream);
    Ok(())
}

fn node_command() -> &'static str {
    if cfg!(windows) { "node.exe" } else { "node" }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn process_running(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    #[cfg(windows)]
    {
        Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).contains(&pid.to_string()))
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}

fn kill_process(pid: u32) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()?;
        if !status.success() {
            anyhow::bail!("taskkill 退出码：{}", status.code().unwrap_or_default());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let status = Command::new("kill").arg(pid.to_string()).status()?;
        if !status.success() {
            anyhow::bail!("kill 退出码：{}", status.code().unwrap_or_default());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> RemoteControlConfig {
        RemoteControlConfig {
            enabled: true,
            lark_app_id: "cli_test".to_string(),
            lark_app_secret: "secret".to_string(),
            feishu_chat_id: "chat".to_string(),
            ..RemoteControlConfig::default()
        }
    }

    #[test]
    fn validate_launch_config_rejects_dangerous_remote_defaults() {
        let mut config = config();
        config.approval_policy = "never".to_string();

        let error = validate_launch_config(&config).unwrap_err().to_string();

        assert!(error.contains("approvalPolicy=never"));
    }

    #[test]
    fn validate_launch_config_accepts_safe_loopback() {
        let config = config();

        assert!(validate_launch_config(&config).is_ok());
    }
}
