use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialPluginHealthReport {
    pub status: String,
    pub message: String,
    pub codex_home: String,
    pub bundled_cache_root: String,
    pub checks: Vec<OfficialPluginHealthCheck>,
    pub repair_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialPluginHealthCheck {
    pub key: String,
    pub label: String,
    pub status: String,
    pub detail: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone)]
struct OfficialPluginDoctorPaths {
    codex_home: PathBuf,
    local_app_data: PathBuf,
    check_registry: bool,
}

#[derive(Debug, Clone)]
struct PluginVersion {
    path: PathBuf,
    version: String,
}

pub fn check_official_plugins() -> OfficialPluginHealthReport {
    check_official_plugins_with_paths(default_paths())
}

fn check_official_plugins_with_paths(
    paths: OfficialPluginDoctorPaths,
) -> OfficialPluginHealthReport {
    let bundled_cache_root = paths
        .codex_home
        .join("plugins")
        .join("cache")
        .join("openai-bundled");
    let browser_root = bundled_cache_root.join("browser");
    let chrome_root = bundled_cache_root.join("chrome");
    let computer_use_root = bundled_cache_root.join("computer-use");
    let browser_version = latest_version_dir(&browser_root);
    let chrome_version = latest_version_dir(&chrome_root);
    let computer_use_version = latest_version_dir(&computer_use_root);
    let chrome_latest = chrome_root.join("latest");
    let bin_root = paths
        .local_app_data
        .join("OpenAI")
        .join("Codex")
        .join("bin");
    let node_path = find_first_file_named(&bin_root, runtime_exe_name("node"));
    let codex_cli_path = find_first_file_named(&bin_root, runtime_exe_name("codex"));
    let node_repl_path = find_first_file_named(&bin_root, runtime_exe_name("node_repl"));
    let native_hosts_config = paths
        .local_app_data
        .join("OpenAI")
        .join("Codex")
        .join("chrome-native-hosts.json");
    let native_hosts_v2_local = paths
        .local_app_data
        .join("OpenAI")
        .join("Codex")
        .join("chrome-native-hosts-v2.json");
    let native_hosts_v2_codex_home = paths.codex_home.join("chrome-native-hosts-v2.json");
    let native_manifest = paths
        .local_app_data
        .join("OpenAI")
        .join("extension")
        .join("com.openai.codexextension.json");

    let mut checks = vec![
        path_check(
            "codex-home",
            "Codex HOME",
            &paths.codex_home,
            "Dex 读取官方插件缓存的 Codex HOME 目录",
        ),
        path_check(
            "openai-bundled-cache",
            "openai-bundled 缓存",
            &bundled_cache_root,
            "官方 bundled marketplace 缓存根目录",
        ),
        plugin_version_check(
            "browser-plugin",
            "Browser 插件",
            &browser_root,
            &browser_version,
        ),
        plugin_file_check(
            "browser-client",
            "Browser client",
            browser_version.as_ref(),
            &["scripts", "browser-client.mjs"],
        ),
        plugin_file_check(
            "browser-docs",
            "Browser docs",
            browser_version.as_ref(),
            &["docs"],
        ),
        plugin_version_check(
            "chrome-plugin",
            "Chrome 插件",
            &chrome_root,
            &chrome_version,
        ),
        path_check(
            "chrome-latest",
            "Chrome latest",
            &chrome_latest,
            "Chrome 插件 latest 入口",
        ),
        plugin_file_check(
            "chrome-browser-client",
            "Chrome browser-client",
            chrome_version.as_ref(),
            &["scripts", "browser-client.mjs"],
        ),
        plugin_file_check(
            "chrome-install-manifest",
            "Chrome installManifest",
            chrome_version.as_ref(),
            &["scripts", "installManifest.mjs"],
        ),
        plugin_file_check(
            "chrome-native-host-checker",
            "Chrome native-host checker",
            chrome_version.as_ref(),
            &["scripts", "check-native-host-manifest.js"],
        ),
        plugin_file_check(
            "chrome-extension-checker",
            "Chrome extension checker",
            chrome_version.as_ref(),
            &["scripts", "check-extension-installed.js"],
        ),
        plugin_file_check(
            "chrome-extension-host",
            "Chrome extension-host",
            chrome_version.as_ref(),
            &["extension-host", "windows", "x64", "extension-host.exe"],
        ),
        plugin_version_check(
            "computer-use-plugin",
            "Computer Use 插件",
            &computer_use_root,
            &computer_use_version,
        ),
        plugin_file_check(
            "computer-use-client",
            "Computer Use client",
            computer_use_version.as_ref(),
            &["scripts", "computer-use-client.mjs"],
        ),
        runtime_check(
            "runtime-node",
            "Node runtime",
            &bin_root,
            node_path.as_ref(),
        ),
        runtime_check(
            "runtime-codex-cli",
            "Codex CLI runtime",
            &bin_root,
            codex_cli_path.as_ref(),
        ),
        runtime_check(
            "runtime-node-repl",
            "node_repl runtime",
            &bin_root,
            node_repl_path.as_ref(),
        ),
        native_hosts_config_check(&native_hosts_config),
        native_hosts_v2_files_check(
            &native_hosts_v2_local,
            &native_hosts_v2_codex_home,
            &native_manifest,
        ),
    ];

    if paths.check_registry {
        checks.push(native_host_registry_check(&native_manifest));
    }

    let status = overall_status(&checks);
    let message = match status.as_str() {
        "ok" => "官方插件依赖检查通过。".to_string(),
        "partial" => "官方插件依赖部分未检查，请查看明细。".to_string(),
        _ => "官方插件依赖存在缺口，请按明细修复后重启 Codex。".to_string(),
    };

    OfficialPluginHealthReport {
        status,
        message,
        codex_home: display_path(&paths.codex_home),
        bundled_cache_root: display_path(&bundled_cache_root),
        checks,
        repair_notes: vec![
            "默认检查不会修改 auth.json、config.toml、Chrome 用户数据或 Windows 注册表。"
                .to_string(),
            "默认检查不会执行 .codex 插件缓存中的 Node 脚本，只做文件、JSON 和只读注册表查询。"
                .to_string(),
            "若 Chrome native-host 或 v2 文件缺失，应走显式修复流程并保留备份。".to_string(),
            "若 Browser / Computer Use / Chrome 缓存缺失，先在 Codex 官方插件页重新安装对应插件。"
                .to_string(),
        ],
    }
}

fn default_paths() -> OfficialPluginDoctorPaths {
    OfficialPluginDoctorPaths {
        codex_home: codex_home_dir(),
        local_app_data: local_app_data_dir(),
        check_registry: true,
    }
}

fn codex_home_dir() -> PathBuf {
    std::env::var_os("CODEX_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| directories::BaseDirs::new().map(|dirs| dirs.home_dir().join(".codex")))
        .unwrap_or_else(|| PathBuf::from(".codex"))
}

fn local_app_data_dir() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| directories::BaseDirs::new().map(|dirs| dirs.data_local_dir().to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn path_check(
    key: impl Into<String>,
    label: impl Into<String>,
    path: &Path,
    detail: impl Into<String>,
) -> OfficialPluginHealthCheck {
    OfficialPluginHealthCheck {
        key: key.into(),
        label: label.into(),
        status: if path.exists() { "ok" } else { "missing" }.to_string(),
        detail: detail.into(),
        path: Some(display_path(path)),
    }
}

fn plugin_version_check(
    key: &str,
    label: &str,
    root: &Path,
    version: &Option<PluginVersion>,
) -> OfficialPluginHealthCheck {
    match version {
        Some(version) => OfficialPluginHealthCheck {
            key: key.to_string(),
            label: label.to_string(),
            status: "ok".to_string(),
            detail: format!("已找到最新版本 {}", version.version),
            path: Some(display_path(&version.path)),
        },
        None => OfficialPluginHealthCheck {
            key: key.to_string(),
            label: label.to_string(),
            status: "missing".to_string(),
            detail: "没有找到版本化插件目录".to_string(),
            path: Some(display_path(root)),
        },
    }
}

fn plugin_file_check(
    key: &str,
    label: &str,
    version: Option<&PluginVersion>,
    segments: &[&str],
) -> OfficialPluginHealthCheck {
    let Some(version) = version else {
        return OfficialPluginHealthCheck {
            key: key.to_string(),
            label: label.to_string(),
            status: "missing".to_string(),
            detail: "插件版本目录缺失，无法检查文件".to_string(),
            path: None,
        };
    };
    let path = join_segments(&version.path, segments);
    path_check(
        key,
        label,
        &path,
        format!("{} 内的关键文件", version.version),
    )
}

fn runtime_check(
    key: &str,
    label: &str,
    bin_root: &Path,
    path: Option<&PathBuf>,
) -> OfficialPluginHealthCheck {
    match path {
        Some(path) => OfficialPluginHealthCheck {
            key: key.to_string(),
            label: label.to_string(),
            status: "ok".to_string(),
            detail: "已找到 Codex Desktop runtime 可执行文件".to_string(),
            path: Some(display_path(path)),
        },
        None => OfficialPluginHealthCheck {
            key: key.to_string(),
            label: label.to_string(),
            status: "missing".to_string(),
            detail: "Codex Desktop runtime 目录中未找到该可执行文件".to_string(),
            path: Some(display_path(bin_root)),
        },
    }
}

fn native_hosts_config_check(path: &Path) -> OfficialPluginHealthCheck {
    let Ok(text) = std::fs::read_to_string(path) else {
        return OfficialPluginHealthCheck {
            key: "chrome-native-hosts-json".to_string(),
            label: "Chrome native-host 配置".to_string(),
            status: "missing".to_string(),
            detail: "未找到 chrome-native-hosts.json".to_string(),
            path: Some(display_path(path)),
        };
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return OfficialPluginHealthCheck {
            key: "chrome-native-hosts-json".to_string(),
            label: "Chrome native-host 配置".to_string(),
            status: "failed".to_string(),
            detail: "chrome-native-hosts.json 不是有效 JSON".to_string(),
            path: Some(display_path(path)),
        };
    };
    let Some(host) = value
        .get("chromeNativeHosts")
        .and_then(Value::as_array)
        .and_then(|hosts| hosts.first())
    else {
        return OfficialPluginHealthCheck {
            key: "chrome-native-hosts-json".to_string(),
            label: "Chrome native-host 配置".to_string(),
            status: "failed".to_string(),
            detail: "chromeNativeHosts 为空".to_string(),
            path: Some(display_path(path)),
        };
    };

    let missing = missing_native_host_config_fields(host);

    OfficialPluginHealthCheck {
        key: "chrome-native-hosts-json".to_string(),
        label: "Chrome native-host 配置".to_string(),
        status: if missing.is_empty() { "ok" } else { "failed" }.to_string(),
        detail: if missing.is_empty() {
            "配置引用的 runtime 和 host 路径均存在".to_string()
        } else {
            format!("配置引用缺失或无效：{}", missing.join(", "))
        },
        path: Some(display_path(path)),
    }
}

fn missing_native_host_config_fields(host: &Value) -> Vec<String> {
    [
        "browserClientPath",
        "codexCliPath",
        "extensionHostPath",
        "nodePath",
        "nodeReplPath",
    ]
    .into_iter()
    .filter(|field| !native_host_field_path_exists(host, field))
    .map(str::to_string)
    .collect()
}

fn native_host_field_path_exists(host: &Value, field: &str) -> bool {
    let Some(value) = host.get(field).and_then(Value::as_str).map(str::trim) else {
        return false;
    };
    !value.is_empty() && Path::new(value).exists()
}

fn native_hosts_v2_files_check(
    local_config: &Path,
    codex_home_config: &Path,
    manifest: &Path,
) -> OfficialPluginHealthCheck {
    let local_exists = local_config.exists();
    let codex_home_exists = codex_home_config.exists();
    let manifest_exists = manifest.exists();
    let exists = [
        ("LOCALAPPDATA v2", local_exists),
        ("CODEX_HOME v2", codex_home_exists),
        ("Chrome manifest", manifest_exists),
    ];
    let missing = exists
        .iter()
        .filter_map(|(label, present)| (!present).then_some(*label))
        .collect::<Vec<_>>();
    let status = if !local_exists && !codex_home_exists {
        "not_checked"
    } else if local_exists && codex_home_exists && manifest_exists {
        "ok"
    } else {
        "failed"
    };
    OfficialPluginHealthCheck {
        key: "chrome-native-host-v2-files".to_string(),
        label: "Chrome native-host v2 文件".to_string(),
        status: status.to_string(),
        detail: if missing.is_empty() {
            "v2 配置文件和 Chrome manifest 均存在".to_string()
        } else if !local_exists && !codex_home_exists {
            "未发现 v2 文件；若当前 Codex 使用 v2 native-host，需要显式修复。".to_string()
        } else {
            format!("v2 文件不完整：{}", missing.join(", "))
        },
        path: Some(display_path(local_config)),
    }
}

fn native_host_registry_check(manifest: &Path) -> OfficialPluginHealthCheck {
    if !cfg!(windows) {
        return not_checked(
            "chrome-native-host-registry",
            "Chrome native-host 注册表",
            "非 Windows 平台不检查 Chrome NativeMessagingHosts 注册表。",
            Some(manifest.to_path_buf()),
        );
    }
    if !manifest.exists() {
        return OfficialPluginHealthCheck {
            key: "chrome-native-host-registry".to_string(),
            label: "Chrome native-host 注册表".to_string(),
            status: "missing".to_string(),
            detail: "Chrome native messaging manifest 文件缺失，无法校验注册表。".to_string(),
            path: Some(display_path(manifest)),
        };
    }
    let output = Command::new(reg_exe_path())
        .args([
            "query",
            r"HKCU\Software\Google\Chrome\NativeMessagingHosts\com.openai.codexextension",
            "/ve",
        ])
        .output();
    let Ok(output) = output else {
        return OfficialPluginHealthCheck {
            key: "chrome-native-host-registry".to_string(),
            label: "Chrome native-host 注册表".to_string(),
            status: "failed".to_string(),
            detail: "无法启动 reg.exe 读取 Chrome NativeMessagingHosts 注册表。".to_string(),
            path: Some(display_path(manifest)),
        };
    };
    if !output.status.success() {
        return OfficialPluginHealthCheck {
            key: "chrome-native-host-registry".to_string(),
            label: "Chrome native-host 注册表".to_string(),
            status: "missing".to_string(),
            detail: "未找到 Chrome NativeMessagingHosts 注册表项。".to_string(),
            path: Some(display_path(manifest)),
        };
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let manifest_path = display_path(manifest);
    let status = if stdout
        .to_ascii_lowercase()
        .contains(&manifest_path.to_ascii_lowercase())
    {
        "ok"
    } else {
        "failed"
    };
    OfficialPluginHealthCheck {
        key: "chrome-native-host-registry".to_string(),
        label: "Chrome native-host 注册表".to_string(),
        status: status.to_string(),
        detail: if status == "ok" {
            "HKCU NativeMessagingHosts 指向当前 manifest。".to_string()
        } else {
            "HKCU NativeMessagingHosts 没有指向当前 manifest。".to_string()
        },
        path: Some(manifest_path),
    }
}

fn reg_exe_path() -> PathBuf {
    std::env::var_os("SystemRoot")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .map(|root| root.join("System32").join("reg.exe"))
        .filter(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from("reg.exe"))
}

fn not_checked(
    key: &str,
    label: &str,
    detail: &str,
    path: Option<PathBuf>,
) -> OfficialPluginHealthCheck {
    OfficialPluginHealthCheck {
        key: key.to_string(),
        label: label.to_string(),
        status: "not_checked".to_string(),
        detail: detail.to_string(),
        path: path.as_ref().map(|path| display_path(path)),
    }
}

fn latest_version_dir(root: &Path) -> Option<PluginVersion> {
    let entries = std::fs::read_dir(root).ok()?;
    entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_dir() {
                return None;
            }
            let version = entry.file_name().to_string_lossy().to_string();
            version_key(&version).map(|key| (key, version, entry.path()))
        })
        .max_by(|left, right| left.0.cmp(&right.0))
        .map(|(_, version, path)| PluginVersion { path, version })
}

fn version_key(value: &str) -> Option<Vec<u32>> {
    let parts = value
        .split('.')
        .map(str::parse::<u32>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    (!parts.is_empty()).then_some(parts)
}

fn find_first_file_named(root: &Path, name: &str) -> Option<PathBuf> {
    if !root.exists() {
        return None;
    }
    let mut queue = VecDeque::from([root.to_path_buf()]);
    let mut matches = Vec::new();
    while let Some(dir) = queue.pop_front() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                queue.push_back(path);
            } else if entry
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case(name)
            {
                matches.push(path);
            }
        }
    }
    matches.into_iter().max_by_key(|path| {
        std::fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .ok()
    })
}

fn runtime_exe_name(name: &str) -> &str {
    match name {
        "node" => {
            if cfg!(windows) {
                "node.exe"
            } else {
                "node"
            }
        }
        "codex" => {
            if cfg!(windows) {
                "codex.exe"
            } else {
                "codex"
            }
        }
        "node_repl" => {
            if cfg!(windows) {
                "node_repl.exe"
            } else {
                "node_repl"
            }
        }
        _ => name,
    }
}

fn join_segments(root: &Path, segments: &[&str]) -> PathBuf {
    segments
        .iter()
        .fold(root.to_path_buf(), |path, segment| path.join(segment))
}

fn overall_status(checks: &[OfficialPluginHealthCheck]) -> String {
    if checks
        .iter()
        .any(|check| matches!(check.status.as_str(), "failed" | "missing"))
    {
        "needs_repair".to_string()
    } else {
        "ok".to_string()
    }
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_key_orders_numeric_versions() {
        assert!(version_key("26.602.71036") > version_key("26.60.99999"));
        assert!(version_key("latest").is_none());
    }

    #[test]
    fn check_official_plugins_reports_ok_for_complete_cache_without_runtime_checks() {
        let temp = tempfile::tempdir().unwrap();
        let codex_home = temp.path().join(".codex");
        let local_app_data = temp.path().join("local");
        let bundled = codex_home
            .join("plugins")
            .join("cache")
            .join("openai-bundled");
        let browser = bundled.join("browser").join("26.602.71036");
        let chrome = bundled.join("chrome").join("26.602.71036");
        let computer_use = bundled.join("computer-use").join("26.602.71036");
        let bin = local_app_data.join("OpenAI").join("Codex").join("bin");
        std::fs::create_dir_all(browser.join("scripts")).unwrap();
        std::fs::create_dir_all(browser.join("docs")).unwrap();
        std::fs::create_dir_all(chrome.join("scripts")).unwrap();
        std::fs::create_dir_all(chrome.join("extension-host/windows/x64")).unwrap();
        std::fs::create_dir_all(computer_use.join("scripts")).unwrap();
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(browser.join("scripts/browser-client.mjs"), "").unwrap();
        std::fs::write(chrome.join("scripts/browser-client.mjs"), "").unwrap();
        std::fs::write(chrome.join("scripts/installManifest.mjs"), "").unwrap();
        std::fs::write(chrome.join("scripts/check-native-host-manifest.js"), "").unwrap();
        std::fs::write(chrome.join("scripts/check-extension-installed.js"), "").unwrap();
        std::fs::write(
            chrome.join("extension-host/windows/x64/extension-host.exe"),
            "",
        )
        .unwrap();
        std::fs::write(computer_use.join("scripts/computer-use-client.mjs"), "").unwrap();
        std::fs::write(bin.join(runtime_exe_name("node")), "").unwrap();
        std::fs::write(bin.join(runtime_exe_name("codex")), "").unwrap();
        std::fs::write(bin.join(runtime_exe_name("node_repl")), "").unwrap();
        std::fs::create_dir_all(bundled.join("chrome")).unwrap();
        std::fs::create_dir_all(bundled.join("chrome").join("latest")).unwrap();
        let native_config = local_app_data
            .join("OpenAI")
            .join("Codex")
            .join("chrome-native-hosts.json");
        std::fs::create_dir_all(native_config.parent().unwrap()).unwrap();
        std::fs::write(
            &native_config,
            serde_json::json!({
                "chromeNativeHosts": [{
                    "browserClientPath": chrome.join("scripts/browser-client.mjs"),
                    "codexCliPath": bin.join(runtime_exe_name("codex")),
                    "extensionHostPath": chrome.join("extension-host/windows/x64/extension-host.exe"),
                    "nodePath": bin.join(runtime_exe_name("node")),
                    "nodeReplPath": bin.join(runtime_exe_name("node_repl"))
                }]
            })
            .to_string(),
        )
        .unwrap();

        let report = check_official_plugins_with_paths(OfficialPluginDoctorPaths {
            codex_home,
            local_app_data,
            check_registry: false,
        });

        assert_eq!(report.status, "ok");
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.key == "computer-use-client" && check.status == "ok")
        );
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.key == "runtime-node-repl" && check.status == "ok")
        );
    }

    #[test]
    fn native_hosts_config_check_reports_missing_or_invalid_required_fields() {
        let temp = tempfile::tempdir().unwrap();
        let existing = temp.path().join("existing.exe");
        let config = temp.path().join("chrome-native-hosts.json");
        std::fs::write(&existing, "").unwrap();
        std::fs::write(
            &config,
            serde_json::json!({
                "chromeNativeHosts": [{
                    "browserClientPath": "",
                    "codexCliPath": existing,
                    "extensionHostPath": existing,
                    "nodePath": 42
                }]
            })
            .to_string(),
        )
        .unwrap();

        let check = native_hosts_config_check(&config);

        assert_eq!(check.status, "failed");
        assert!(check.detail.contains("browserClientPath"));
        assert!(check.detail.contains("nodePath"));
        assert!(check.detail.contains("nodeReplPath"));
        assert!(!check.detail.contains("codexCliPath"));
        assert!(!check.detail.contains("extensionHostPath"));
    }
}
