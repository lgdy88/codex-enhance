use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

const BROWSER_MCP_SERVERS: [&str; 2] = ["chrome-devtools", "playwright"];
const DEFAULT_BROWSER_URL: &str = "http://127.0.0.1:9222";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    pub name: String,
    pub installed: bool,
    pub enabled: bool,
    pub command: String,
    pub args: Vec<String>,
    pub mode: String,
    pub server_type: String,
    pub managed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfigResult {
    pub status: String,
    pub message: String,
    pub config_path: String,
    pub backup_path: String,
    pub servers: Vec<McpServerStatus>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChromeMode {
    AutoConnect,
    BrowserUrl,
    Default,
}

pub fn default_config_path() -> PathBuf {
    home_dir().join(".codex").join("config.toml")
}

pub fn load_browser_mcp_status(config_path: Option<&Path>) -> McpConfigResult {
    let path = config_path
        .map(Path::to_path_buf)
        .unwrap_or_else(default_config_path);
    McpConfigResult {
        status: "ok".to_string(),
        message: "MCP 配置已读取。".to_string(),
        config_path: path.to_string_lossy().to_string(),
        backup_path: String::new(),
        servers: browser_mcp_status(&path),
    }
}

pub fn install_browser_mcp_servers(
    names: &[String],
    chrome_mode: ChromeMode,
    browser_url: &str,
    config_path: Option<&Path>,
    backup: bool,
) -> anyhow::Result<McpConfigResult> {
    let path = config_path
        .map(Path::to_path_buf)
        .unwrap_or_else(default_config_path);
    let selected = normalize_server_names(names)?;
    let current = read_text_or_empty(&path)?;
    let mut next_text = current.clone();
    for name in selected {
        next_text = upsert_server_block(&next_text, name, &chrome_mode, browser_url)?;
    }
    let backup_path = write_config_if_changed(&path, &current, &next_text, backup)?;
    Ok(McpConfigResult {
        status: "ok".to_string(),
        message: "浏览器 MCP 配置已写入，请重启 Codex 或新开会话让 MCP 生效。".to_string(),
        config_path: path.to_string_lossy().to_string(),
        backup_path: optional_path_string(backup_path),
        servers: browser_mcp_status(&path),
    })
}

pub fn remove_browser_mcp_servers(
    names: &[String],
    config_path: Option<&Path>,
    backup: bool,
) -> anyhow::Result<McpConfigResult> {
    let path = config_path
        .map(Path::to_path_buf)
        .unwrap_or_else(default_config_path);
    let selected = normalize_server_names(names)?;
    let current = read_text_or_empty(&path)?;
    let mut next_text = current.clone();
    for name in selected {
        next_text = remove_server_block(&next_text, name);
    }
    let backup_path = write_config_if_changed(&path, &current, &next_text, backup)?;
    Ok(McpConfigResult {
        status: "ok".to_string(),
        message: "浏览器 MCP 配置已移除，请重启 Codex 或新开会话让变更生效。".to_string(),
        config_path: path.to_string_lossy().to_string(),
        backup_path: optional_path_string(backup_path),
        servers: browser_mcp_status(&path),
    })
}

pub fn set_mcp_server_enabled(
    name: &str,
    enabled: bool,
    config_path: Option<&Path>,
    backup: bool,
) -> anyhow::Result<McpConfigResult> {
    let path = config_path
        .map(Path::to_path_buf)
        .unwrap_or_else(default_config_path);
    let current = read_text_or_empty(&path)?;
    if !load_mcp_servers(&path)?.contains_key(name) {
        anyhow::bail!("MCP server not found: {name}");
    }
    let next_text = set_server_enabled_in_text(&current, name, enabled)?;
    let backup_path = write_config_if_changed(&path, &current, &next_text, backup)?;
    Ok(McpConfigResult {
        status: "ok".to_string(),
        message: "MCP 配置已更新；当前 Codex 会话通常需要重启或新会话才会重新加载。".to_string(),
        config_path: path.to_string_lossy().to_string(),
        backup_path: optional_path_string(backup_path),
        servers: browser_mcp_status(&path),
    })
}

fn home_dir() -> PathBuf {
    directories::BaseDirs::new()
        .map(|dirs| dirs.home_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn browser_mcp_status(path: &Path) -> Vec<McpServerStatus> {
    let raw_servers = load_mcp_servers(path).unwrap_or_default();
    BROWSER_MCP_SERVERS
        .iter()
        .map(|name| server_status(name, raw_servers.get(*name)))
        .collect()
}

fn load_mcp_servers(path: &Path) -> anyhow::Result<toml::map::Map<String, toml::Value>> {
    if !path.exists() {
        return Ok(toml::map::Map::new());
    }
    let Ok(data) = fs::read_to_string(path)?.parse::<toml::Value>() else {
        return Ok(toml::map::Map::new());
    };
    Ok(data
        .get("mcp_servers")
        .and_then(toml::Value::as_table)
        .cloned()
        .unwrap_or_default())
}

fn server_status(name: &str, raw: Option<&toml::Value>) -> McpServerStatus {
    let table = raw.and_then(toml::Value::as_table);
    let args = table
        .and_then(|data| data.get("args"))
        .and_then(toml::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(toml::Value::as_str)
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let installed = table.is_some();
    McpServerStatus {
        name: name.to_string(),
        installed,
        enabled: table
            .and_then(|data| data.get("enabled"))
            .and_then(toml::Value::as_bool)
            .unwrap_or(installed),
        command: table
            .and_then(|data| data.get("command"))
            .and_then(toml::Value::as_str)
            .unwrap_or_default()
            .to_string(),
        mode: detect_mode(name, &args),
        server_type: table
            .and_then(|data| data.get("type"))
            .and_then(toml::Value::as_str)
            .unwrap_or(if installed { "stdio" } else { "" })
            .to_string(),
        managed: BROWSER_MCP_SERVERS.contains(&name),
        args,
    }
}

fn detect_mode(name: &str, args: &[String]) -> String {
    if name == "chrome-devtools" {
        if args.iter().any(|arg| arg == "--autoConnect") {
            return "auto-connect".to_string();
        }
        if args
            .iter()
            .any(|arg| arg == "--browserUrl" || arg.starts_with("--browser-url="))
        {
            return "browser-url".to_string();
        }
        return if args.is_empty() {
            "missing"
        } else {
            "default"
        }
        .to_string();
    }
    if name == "playwright" {
        return if args.iter().any(|arg| arg == "--browser=chrome") {
            "chrome"
        } else if args.is_empty() {
            "missing"
        } else {
            "default"
        }
        .to_string();
    }
    "unknown".to_string()
}

fn normalize_server_names(names: &[String]) -> anyhow::Result<Vec<&'static str>> {
    let requested = if names.is_empty() || names.iter().any(|name| name == "all") {
        BROWSER_MCP_SERVERS.to_vec()
    } else {
        let mut selected = Vec::new();
        for name in names {
            let Some(server) = BROWSER_MCP_SERVERS
                .iter()
                .copied()
                .find(|item| item == name)
            else {
                anyhow::bail!("Unsupported MCP server: {name}");
            };
            selected.push(server);
        }
        selected
    };
    let mut deduped = Vec::new();
    for name in requested {
        if !deduped.contains(&name) {
            deduped.push(name);
        }
    }
    Ok(deduped)
}

fn upsert_server_block(
    text: &str,
    name: &str,
    chrome_mode: &ChromeMode,
    browser_url: &str,
) -> anyhow::Result<String> {
    let cleaned = remove_server_block(text, name).trim_end().to_string();
    let block = server_block(name, chrome_mode, browser_url)?;
    Ok(if cleaned.is_empty() {
        format!("{block}\n")
    } else {
        format!("{cleaned}\n\n{block}\n")
    })
}

fn remove_server_block(text: &str, name: &str) -> String {
    let mut output = Vec::new();
    let mut skipping = false;
    for line in split_keepends(text) {
        if let Some(header) = parse_table_header(&line) {
            skipping = table_matches_server(&header, name);
        }
        if !skipping {
            output.push(line);
        }
    }
    let joined = output.concat();
    if joined.is_empty() {
        String::new()
    } else {
        format!("{}\n", joined.trim_end())
    }
}

fn set_server_enabled_in_text(text: &str, name: &str, enabled: bool) -> anyhow::Result<String> {
    let mut output = Vec::new();
    let mut inside_main = false;
    let mut found_table = false;
    let mut wrote_enabled = false;
    for line in split_keepends(text) {
        if let Some(header) = parse_table_header(&line) {
            if inside_main && !wrote_enabled {
                output.push(enabled_line(enabled, &line));
            }
            inside_main = table_is_server_main(&header, name);
            found_table |= inside_main;
            wrote_enabled = false;
        }
        if inside_main && is_enabled_line(&line) {
            output.push(enabled_line(enabled, &line));
            wrote_enabled = true;
        } else {
            output.push(line);
        }
    }
    if inside_main && !wrote_enabled {
        output.push(format!("enabled = {}\n", enabled));
    }
    if !found_table {
        anyhow::bail!("MCP server not found: {name}");
    }
    Ok(output.concat())
}

fn server_block(name: &str, chrome_mode: &ChromeMode, browser_url: &str) -> anyhow::Result<String> {
    let (command, args) = server_command_args(name, chrome_mode, browser_url)?;
    let mut lines = vec![
        format!("[mcp_servers.{name}]"),
        format!("command = {}", toml_string(&command)),
        format!("args = {}", toml_array(&args)),
        "enabled = true".to_string(),
        "startup_timeout_sec = 20".to_string(),
    ];
    if cfg!(windows) {
        lines.push(
            r#"env = { SystemRoot = "C:\\Windows", PROGRAMFILES = "C:\\Program Files" }"#
                .to_string(),
        );
    }
    Ok(lines.join("\n"))
}

fn server_command_args(
    name: &str,
    chrome_mode: &ChromeMode,
    browser_url: &str,
) -> anyhow::Result<(String, Vec<String>)> {
    let (command, prefix_args) = npx_prefix();
    match name {
        "chrome-devtools" => Ok((
            command,
            [
                prefix_args,
                vec!["chrome-devtools-mcp@latest".to_string()],
                chrome_mode_args(chrome_mode, browser_url),
            ]
            .concat(),
        )),
        "playwright" => Ok((
            command,
            [
                prefix_args,
                vec![
                    "@playwright/mcp@latest".to_string(),
                    "--browser=chrome".to_string(),
                    "--caps=devtools".to_string(),
                ],
            ]
            .concat(),
        )),
        _ => anyhow::bail!("Unsupported MCP server: {name}"),
    }
}

fn chrome_mode_args(mode: &ChromeMode, browser_url: &str) -> Vec<String> {
    match mode {
        ChromeMode::AutoConnect => vec!["--autoConnect".to_string()],
        ChromeMode::BrowserUrl => vec![
            "--browserUrl".to_string(),
            if browser_url.trim().is_empty() {
                DEFAULT_BROWSER_URL
            } else {
                browser_url.trim()
            }
            .to_string(),
        ],
        ChromeMode::Default => Vec::new(),
    }
}

fn npx_prefix() -> (String, Vec<String>) {
    if cfg!(windows) {
        (
            "cmd".to_string(),
            vec!["/c".to_string(), "npx".to_string(), "-y".to_string()],
        )
    } else {
        ("npx".to_string(), vec!["-y".to_string()])
    }
}

fn read_text_or_empty(path: &Path) -> anyhow::Result<String> {
    if path.exists() {
        Ok(fs::read_to_string(path)?)
    } else {
        Ok(String::new())
    }
}

fn write_config_if_changed(
    path: &Path,
    current: &str,
    next_text: &str,
    backup: bool,
) -> anyhow::Result<Option<PathBuf>> {
    if current == next_text {
        return Ok(None);
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let backup_path = if backup && path.exists() {
        Some(backup_config(path)?)
    } else {
        None
    };
    let temp_path = path.with_file_name(format!(
        "{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("config.toml")
    ));
    fs::write(&temp_path, next_text)?;
    fs::rename(&temp_path, path)?;
    Ok(backup_path)
}

fn backup_config(path: &Path) -> anyhow::Result<PathBuf> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let backup_path = path.with_file_name(format!(
        "{}.codex-plus.{timestamp}.bak",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("config.toml")
    ));
    fs::copy(path, &backup_path)?;
    Ok(backup_path)
}

fn optional_path_string(path: Option<PathBuf>) -> String {
    path.map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn split_keepends(text: &str) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }
    text.split_inclusive('\n')
        .map(ToString::to_string)
        .collect()
}

fn parse_table_header(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let content = trimmed.strip_prefix('[')?.split_once(']')?.0;
    Some(content.trim().to_string())
}

fn table_matches_server(header: &str, name: &str) -> bool {
    let bare = format!("mcp_servers.{name}");
    let quoted = format!("mcp_servers.\"{name}\"");
    header == bare
        || header.starts_with(&format!("{bare}."))
        || header == quoted
        || header.starts_with(&format!("{quoted}."))
}

fn table_is_server_main(header: &str, name: &str) -> bool {
    header == format!("mcp_servers.{name}") || header == format!("mcp_servers.\"{name}\"")
}

fn is_enabled_line(line: &str) -> bool {
    line.trim_start().starts_with("enabled") && line.contains('=')
}

fn enabled_line(enabled: bool, reference_line: &str) -> String {
    let newline = if reference_line.ends_with("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    format!("enabled = {}{newline}", enabled)
}

fn toml_string(value: &str) -> String {
    Value::String(value.to_string()).to_string()
}

fn toml_array(values: &[String]) -> String {
    format!(
        "[{}]",
        values
            .iter()
            .map(|value| toml_string(value))
            .collect::<Vec<_>>()
            .join(", ")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_remove_and_enable_browser_mcp_blocks() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("config.toml");
        fs::write(&path, "model_provider = \"openai\"\n").unwrap();

        let installed = install_browser_mcp_servers(
            &["all".to_string()],
            ChromeMode::AutoConnect,
            DEFAULT_BROWSER_URL,
            Some(&path),
            true,
        )
        .unwrap();
        assert_eq!(installed.servers.len(), 2);
        assert!(installed.servers.iter().all(|server| server.installed));
        assert!(!installed.backup_path.is_empty());

        let disabled =
            set_mcp_server_enabled("chrome-devtools", false, Some(&path), false).unwrap();
        assert!(
            disabled
                .servers
                .iter()
                .any(|server| server.name == "chrome-devtools" && !server.enabled)
        );

        let removed =
            remove_browser_mcp_servers(&["chrome-devtools".to_string()], Some(&path), false)
                .unwrap();
        assert!(
            removed
                .servers
                .iter()
                .any(|server| server.name == "chrome-devtools" && !server.installed)
        );
        assert!(fs::read_to_string(path).unwrap().contains("playwright"));
    }

    #[test]
    fn status_read_does_not_create_missing_config() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("missing.toml");

        let status = load_browser_mcp_status(Some(&path));

        assert_eq!(status.status, "ok");
        assert!(!path.exists());
        assert!(status.servers.iter().all(|server| !server.installed));
    }
}
