use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Map, Value, json};

#[derive(Debug, Clone, Serialize)]
pub struct PluginCacheRepairResult {
    pub status: String,
    pub message: String,
    pub marketplace: String,
    pub plugin: String,
    pub cache_path: String,
    pub backup_path: String,
    pub moved: bool,
    pub restored: bool,
    pub config_entry: String,
    pub config_updated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialPluginCacheRefreshResult {
    pub status: String,
    pub message: String,
    pub codex_home: String,
    pub cache_root: String,
    pub backup_root: String,
    pub config_path: String,
    pub config_backup_path: String,
    pub global_state_path: String,
    pub global_state_backup_path: String,
    pub global_state_updated: bool,
    pub global_state_entries: Vec<String>,
    pub plugins: Vec<PluginCacheRepairResult>,
}

pub fn repair_plugin_cache_for_install(
    marketplace: &str,
    plugin: &str,
) -> anyhow::Result<PluginCacheRepairResult> {
    let marketplace = sanitize_segment(marketplace)?;
    let plugin = sanitize_segment(plugin)?;
    let codex_home = codex_home_dir();
    let cache_root = codex_home.join("plugins").join("cache");
    let cache_path = cache_root.join(&marketplace).join(&plugin);

    ensure_inside(&cache_root, &cache_path)?;

    if !cache_path.exists() {
        return Ok(PluginCacheRepairResult {
            status: "ok".to_string(),
            message: "插件缓存不存在，无需修复".to_string(),
            marketplace,
            plugin,
            cache_path: cache_path.to_string_lossy().into_owned(),
            backup_path: String::new(),
            moved: false,
            restored: false,
            config_entry: String::new(),
            config_updated: false,
        });
    }

    let backup_root = crate::paths::default_plugin_cache_backups_dir()
        .join(&marketplace)
        .join(&plugin);
    std::fs::create_dir_all(&backup_root)?;
    let backup_path = unique_backup_path(&backup_root);

    std::fs::rename(&cache_path, &backup_path)
        .map_err(|error| anyhow::anyhow!("移动插件缓存失败：{error}"))?;

    Ok(PluginCacheRepairResult {
        status: "ok".to_string(),
        message: "已备份旧插件缓存，可重试安装".to_string(),
        marketplace,
        plugin,
        cache_path: cache_path.to_string_lossy().into_owned(),
        backup_path: backup_path.to_string_lossy().into_owned(),
        moved: true,
        restored: false,
        config_entry: String::new(),
        config_updated: false,
    })
}

pub fn refresh_official_plugin_cache() -> anyhow::Result<OfficialPluginCacheRefreshResult> {
    repair_official_plugin_cache(
        "openai-bundled",
        &official_plugin_specs(),
        crate::paths::default_plugin_cache_backups_dir(),
    )
}

#[derive(Debug, Clone)]
struct OfficialPluginSpec {
    plugin: &'static str,
    required_paths: &'static [&'static [&'static str]],
    required_root_paths: &'static [&'static [&'static str]],
}

#[derive(Debug, Clone)]
struct ConfigRepairResult {
    path: PathBuf,
    backup_path: Option<PathBuf>,
    updated_entries: Vec<String>,
}

#[derive(Debug, Clone)]
struct GlobalStateRepairResult {
    path: PathBuf,
    backup_path: Option<PathBuf>,
    updated: bool,
    entries: Vec<String>,
}

#[derive(Debug, Clone)]
struct PluginVersion {
    path: PathBuf,
}

fn official_plugin_specs() -> Vec<OfficialPluginSpec> {
    vec![
        OfficialPluginSpec {
            plugin: "browser",
            required_paths: &[&["scripts", "browser-client.mjs"], &["docs"]],
            required_root_paths: &[],
        },
        OfficialPluginSpec {
            plugin: "chrome",
            required_paths: &[
                &["scripts", "browser-client.mjs"],
                &["scripts", "installManifest.mjs"],
                &["extension-host", "windows", "x64", "extension-host.exe"],
            ],
            required_root_paths: &[
                &["latest", "scripts", "browser-client.mjs"],
                &["latest", "scripts", "installManifest.mjs"],
                &[
                    "latest",
                    "extension-host",
                    "windows",
                    "x64",
                    "extension-host.exe",
                ],
            ],
        },
        OfficialPluginSpec {
            plugin: "computer-use",
            required_paths: &[&["scripts", "computer-use-client.mjs"]],
            required_root_paths: &[],
        },
    ]
}

fn repair_official_plugin_cache(
    marketplace: &str,
    plugins: &[OfficialPluginSpec],
    backup_root: PathBuf,
) -> anyhow::Result<OfficialPluginCacheRefreshResult> {
    let codex_home = codex_home_dir();
    let cache_root = codex_home.join("plugins").join("cache");
    let marketplace = sanitize_segment(marketplace)?;
    let config_repair =
        ensure_official_plugin_config(&codex_home, &marketplace, plugins, &backup_root)?;
    let global_state_repair =
        ensure_official_plugin_global_state(&codex_home, &marketplace, plugins, &backup_root)?;
    let plugin_results = plugins
        .iter()
        .map(|plugin| {
            repair_official_plugin_cache_with_backup_root(
                &marketplace,
                plugin,
                &backup_root,
                &config_repair.updated_entries,
            )
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    let moved_count = plugin_results.iter().filter(|result| result.moved).count();
    let restored_count = plugin_results
        .iter()
        .filter(|result| result.restored)
        .count();
    let config_updated_count = config_repair.updated_entries.len();
    let global_state_status = if global_state_repair.updated {
        format!(
            "修复 {} 个运行态插件状态",
            global_state_repair.entries.len()
        )
    } else {
        "确认运行态插件状态".to_string()
    };
    let unresolved_count = plugin_results
        .iter()
        .filter(|result| result.status != "ok")
        .count();
    let status = if unresolved_count > 0 {
        "needs_repair"
    } else {
        "ok"
    };
    let message = if unresolved_count > 0 {
        format!(
            "还有 {unresolved_count} 个官方插件缓存缺失且未找到有效备份；请在 Codex 设置中重新安装 Browser / Chrome / Computer Use。"
        )
    } else if moved_count > 0 || restored_count > 0 || config_updated_count > 0 {
        format!(
            "已修复官方插件：恢复 {restored_count} 个缓存、备份 {moved_count} 个旧缓存、启用 {config_updated_count} 个 config.toml 表项、{global_state_status}；请完全重启 Codex。"
        )
    } else if global_state_repair.updated {
        "已修复官方插件运行态状态；请完全重启 Codex。".to_string()
    } else {
        "官方插件缓存、config.toml 启用状态和运行态插件状态已完整；如插件页仍未显示，请完全重启 Codex。"
            .to_string()
    };

    Ok(OfficialPluginCacheRefreshResult {
        status: status.to_string(),
        message,
        codex_home: codex_home.to_string_lossy().into_owned(),
        cache_root: cache_root.to_string_lossy().into_owned(),
        backup_root: backup_root.to_string_lossy().into_owned(),
        config_path: config_repair.path.to_string_lossy().into_owned(),
        config_backup_path: config_repair
            .backup_path
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default(),
        global_state_path: global_state_repair.path.to_string_lossy().into_owned(),
        global_state_backup_path: global_state_repair
            .backup_path
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default(),
        global_state_updated: global_state_repair.updated,
        global_state_entries: global_state_repair.entries,
        plugins: plugin_results,
    })
}

fn codex_home_dir() -> PathBuf {
    std::env::var_os("CODEX_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| directories::BaseDirs::new().map(|dirs| dirs.home_dir().join(".codex")))
        .unwrap_or_else(|| PathBuf::from(".codex"))
}

fn repair_official_plugin_cache_with_backup_root(
    marketplace: &str,
    spec: &OfficialPluginSpec,
    backup_root: &Path,
    updated_config_entries: &[String],
) -> anyhow::Result<PluginCacheRepairResult> {
    let marketplace = sanitize_segment(marketplace)?;
    let plugin = sanitize_segment(spec.plugin)?;
    let codex_home = codex_home_dir();
    let cache_root = codex_home.join("plugins").join("cache");
    let cache_path = cache_root.join(&marketplace).join(&plugin);
    let config_entry = plugin_config_entry(&marketplace, &plugin);
    let config_updated = updated_config_entries
        .iter()
        .any(|entry| entry == &config_entry);

    ensure_inside(&cache_root, &cache_path)?;

    if valid_plugin_cache_root(&cache_path, spec.required_paths, spec.required_root_paths) {
        return Ok(PluginCacheRepairResult {
            status: "ok".to_string(),
            message: "插件缓存已完整，已确认启用配置".to_string(),
            marketplace,
            plugin,
            cache_path: cache_path.to_string_lossy().into_owned(),
            backup_path: String::new(),
            moved: false,
            restored: false,
            config_entry,
            config_updated,
        });
    }

    let latest_backup = latest_valid_plugin_backup(
        backup_root,
        &marketplace,
        &plugin,
        spec.required_paths,
        spec.required_root_paths,
    );
    let Some(latest_backup) = latest_backup else {
        return Ok(PluginCacheRepairResult {
            status: "missing".to_string(),
            message: "插件缓存缺失或不完整，且 Dex 备份中没有可恢复版本".to_string(),
            marketplace,
            plugin,
            cache_path: cache_path.to_string_lossy().into_owned(),
            backup_path: String::new(),
            moved: false,
            restored: false,
            config_entry,
            config_updated,
        });
    };

    let mut moved = false;
    let mut backup_path = PathBuf::new();
    if cache_path.exists() {
        let stale_backup_root = backup_root
            .join(&marketplace)
            .join(&plugin)
            .join("stale-before-restore");
        std::fs::create_dir_all(&stale_backup_root)?;
        backup_path = unique_backup_path(&stale_backup_root);
        std::fs::rename(&cache_path, &backup_path)
            .map_err(|error| anyhow::anyhow!("移动旧插件缓存失败：{error}"))?;
        moved = true;
    }

    if let Some(parent) = cache_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    copy_dir_all(&latest_backup, &cache_path)?;

    Ok(PluginCacheRepairResult {
        status: "ok".to_string(),
        message: "已从 Dex 备份恢复官方插件缓存，并确认启用配置".to_string(),
        marketplace,
        plugin,
        cache_path: cache_path.to_string_lossy().into_owned(),
        backup_path: if moved {
            backup_path.to_string_lossy().into_owned()
        } else {
            latest_backup.to_string_lossy().into_owned()
        },
        moved,
        restored: true,
        config_entry,
        config_updated,
    })
}

fn valid_plugin_cache_root(
    path: &Path,
    required_paths: &[&[&str]],
    required_root_paths: &[&[&str]],
) -> bool {
    if !required_root_paths
        .iter()
        .all(|segments| join_segments(path, segments).exists())
    {
        return false;
    }
    latest_version_dir(path)
        .map(|version| {
            required_paths
                .iter()
                .all(|segments| join_segments(&version.path, segments).exists())
        })
        .unwrap_or(false)
}

fn latest_valid_plugin_backup(
    backup_root: &Path,
    marketplace: &str,
    plugin: &str,
    required_paths: &[&[&str]],
    required_root_paths: &[&[&str]],
) -> Option<PathBuf> {
    let root = backup_root.join(marketplace).join(plugin);
    let entries = std::fs::read_dir(root).ok()?;
    let mut candidates = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let metadata = entry.metadata().ok()?;
            if !metadata.is_dir()
                || !valid_plugin_cache_root(&path, required_paths, required_root_paths)
            {
                return None;
            }
            let modified = metadata.modified().ok()?;
            Some((modified, path))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| right.0.cmp(&left.0));
    candidates.into_iter().map(|(_, path)| path).next()
}

fn ensure_official_plugin_config(
    codex_home: &Path,
    marketplace: &str,
    plugins: &[OfficialPluginSpec],
    backup_root: &Path,
) -> anyhow::Result<ConfigRepairResult> {
    let config_path = codex_home.join("config.toml");
    let original = std::fs::read_to_string(&config_path).unwrap_or_default();
    let mut next = original.clone();
    let mut updated_entries = Vec::new();

    for plugin in plugins {
        let entry = plugin_config_entry(marketplace, plugin.plugin);
        let (updated, changed) = ensure_plugin_enabled_entry(&next, &entry);
        if changed {
            next = updated;
            updated_entries.push(entry);
        }
    }

    let backup_path = if next != original {
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let backup_path = if config_path.exists() {
            let root = backup_root.join("config.toml");
            std::fs::create_dir_all(&root)?;
            let backup_path = unique_backup_path(&root).with_extension("toml");
            std::fs::copy(&config_path, &backup_path)
                .map_err(|error| anyhow::anyhow!("备份 config.toml 失败：{error}"))?;
            Some(backup_path)
        } else {
            None
        };
        std::fs::write(&config_path, next)
            .map_err(|error| anyhow::anyhow!("写入 config.toml 插件启用配置失败：{error}"))?;
        backup_path
    } else {
        None
    };

    Ok(ConfigRepairResult {
        path: config_path,
        backup_path,
        updated_entries,
    })
}

fn ensure_official_plugin_global_state(
    codex_home: &Path,
    marketplace: &str,
    plugins: &[OfficialPluginSpec],
    backup_root: &Path,
) -> anyhow::Result<GlobalStateRepairResult> {
    let global_state_path = codex_home.join(".codex-global-state.json");
    let original = std::fs::read_to_string(&global_state_path).unwrap_or_default();
    let mut changed = false;
    let mut state = if original.trim().is_empty() {
        Map::new()
    } else {
        match serde_json::from_str::<Value>(&original) {
            Ok(Value::Object(object)) => object,
            Ok(_) | Err(_) => {
                changed = true;
                Map::new()
            }
        }
    };
    let entries = plugins
        .iter()
        .map(|plugin| plugin_config_entry(marketplace, plugin.plugin))
        .collect::<Vec<_>>();
    let key = "electron-chrome-extension-sync-managed-plugin-ids";
    let mut managed_plugin_ids = global_state_string_array(state.get(key));
    for entry in &entries {
        if !managed_plugin_ids.iter().any(|item| item == entry) {
            managed_plugin_ids.push(entry.clone());
            changed = true;
        }
    }
    let next_value = json!(managed_plugin_ids);
    if state.get(key) != Some(&next_value) {
        state.insert(key.to_string(), next_value);
        changed = true;
    }

    let backup_path = if changed {
        if let Some(parent) = global_state_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let backup_path = if global_state_path.exists() {
            let root = backup_root.join(".codex-global-state.json");
            std::fs::create_dir_all(&root)?;
            let backup_path = unique_backup_path(&root).with_extension("json");
            std::fs::copy(&global_state_path, &backup_path)
                .map_err(|error| anyhow::anyhow!("备份 .codex-global-state.json 失败：{error}"))?;
            Some(backup_path)
        } else {
            None
        };
        std::fs::write(
            &global_state_path,
            serde_json::to_string_pretty(&Value::Object(state))?,
        )
        .map_err(|error| anyhow::anyhow!("写入 .codex-global-state.json 插件状态失败：{error}"))?;
        backup_path
    } else {
        None
    };

    Ok(GlobalStateRepairResult {
        path: global_state_path,
        backup_path,
        updated: changed,
        entries,
    })
}

fn global_state_string_array(value: Option<&Value>) -> Vec<String> {
    let mut result = Vec::new();
    match value {
        Some(Value::Array(items)) => {
            for item in items {
                if let Some(text) = item.as_str().map(str::trim).filter(|text| !text.is_empty()) {
                    push_unique(&mut result, text.to_string());
                }
            }
        }
        Some(Value::String(text)) if !text.trim().is_empty() => {
            push_unique(&mut result, text.trim().to_string());
        }
        _ => {}
    }
    result
}

fn push_unique(items: &mut Vec<String>, value: String) {
    if !items.iter().any(|item| item == &value) {
        items.push(value);
    }
}

fn plugin_config_entry(marketplace: &str, plugin: &str) -> String {
    format!("{plugin}@{marketplace}")
}

fn ensure_plugin_enabled_entry(contents: &str, entry: &str) -> (String, bool) {
    let header = format!("[plugins.\"{entry}\"]");
    let mut lines = split_preserving_lines(contents);

    if let Some(index) = lines.iter().position(|line| line.trim() == header) {
        let end = lines[index + 1..]
            .iter()
            .position(|line| {
                let trimmed = line.trim();
                trimmed.starts_with('[') && trimmed.ends_with(']')
            })
            .map(|offset| index + 1 + offset)
            .unwrap_or(lines.len());
        if let Some(enabled_index) = lines[index + 1..end].iter().position(|line| {
            line.trim_start()
                .split_once('=')
                .map(|(key, _)| key.trim() == "enabled")
                .unwrap_or(false)
        }) {
            let absolute_index = index + 1 + enabled_index;
            if lines[absolute_index].trim() == "enabled = true" {
                return (contents.to_string(), false);
            }
            lines[absolute_index] = "enabled = true\n".to_string();
            return (lines.concat(), true);
        }
        lines.insert(index + 1, "enabled = true\n".to_string());
        return (lines.concat(), true);
    }

    let mut next = contents.trim_end_matches(&['\r', '\n'][..]).to_string();
    if !next.is_empty() {
        next.push_str("\n\n");
    }
    if !contents.lines().any(|line| line.trim() == "[plugins]") {
        next.push_str("[plugins]\n\n");
    }
    next.push_str(&header);
    next.push_str("\nenabled = true\n");
    (next, true)
}

fn split_preserving_lines(contents: &str) -> Vec<String> {
    if contents.is_empty() {
        return Vec::new();
    }
    let mut lines = Vec::new();
    let mut start = 0;
    for (index, ch) in contents.char_indices() {
        if ch == '\n' {
            lines.push(contents[start..=index].to_string());
            start = index + 1;
        }
    }
    if start < contents.len() {
        lines.push(contents[start..].to_string());
    }
    lines
}

fn copy_dir_all(source: &Path, destination: &Path) -> anyhow::Result<()> {
    std::fs::create_dir_all(destination)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_all(&source_path, &destination_path)?;
        } else if file_type.is_file() {
            std::fs::copy(&source_path, &destination_path).map_err(|error| {
                anyhow::anyhow!(
                    "复制插件缓存文件失败：{} -> {}: {error}",
                    source_path.to_string_lossy(),
                    destination_path.to_string_lossy()
                )
            })?;
        }
    }
    Ok(())
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
            version_key(&version).map(|key| (key, entry.path()))
        })
        .max_by(|left, right| left.0.cmp(&right.0))
        .map(|(_, path)| PluginVersion { path })
}

fn version_key(value: &str) -> Option<Vec<u32>> {
    let parts = value
        .split('.')
        .map(str::parse::<u32>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    (!parts.is_empty()).then_some(parts)
}

fn join_segments(root: &Path, segments: &[&str]) -> PathBuf {
    segments
        .iter()
        .fold(root.to_path_buf(), |path, segment| path.join(segment))
}

fn sanitize_segment(value: &str) -> anyhow::Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        anyhow::bail!("插件缓存参数不能为空");
    }
    if trimmed
        .chars()
        .any(|ch| !(ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.')))
    {
        anyhow::bail!("插件缓存参数包含非法字符");
    }
    if trimmed == "." || trimmed == ".." {
        anyhow::bail!("插件缓存参数非法");
    }
    Ok(trimmed.to_string())
}

fn ensure_inside(root: &Path, candidate: &Path) -> anyhow::Result<()> {
    if !candidate.starts_with(root) || candidate.components().count() <= root.components().count() {
        anyhow::bail!("插件缓存路径非法");
    }
    Ok(())
}

fn unique_backup_path(root: &Path) -> PathBuf {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    for index in 0..1000 {
        let suffix = if index == 0 {
            format!("{now}")
        } else {
            format!("{now}-{index}")
        };
        let path = root.join(suffix);
        if !path.exists() {
            return path;
        }
    }
    root.join(format!("{now}-{}", uuid::Uuid::new_v4()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn sanitize_segment_rejects_paths() {
        assert!(sanitize_segment("../chrome").is_err());
        assert!(sanitize_segment("chrome/latest").is_err());
        assert!(sanitize_segment("").is_err());
        assert_eq!(
            sanitize_segment("openai-bundled").unwrap(),
            "openai-bundled"
        );
    }

    #[test]
    fn refresh_official_plugin_cache_restores_missing_plugins_and_enables_config() {
        let _guard = env_lock().lock().unwrap();
        let temp = tempfile::tempdir().unwrap();
        let codex_home = temp.path().join(".codex");
        let backup_root = temp.path().join("backups");
        let cache_root = codex_home
            .join("plugins")
            .join("cache")
            .join("openai-bundled");
        let backup = backup_root.join("openai-bundled");
        std::fs::create_dir_all(&codex_home).unwrap();
        std::fs::write(codex_home.join("config.toml"), "model = \"gpt-5\"\n").unwrap();
        std::fs::write(
            codex_home.join(".codex-global-state.json"),
            json!({
                "electron-chrome-extension-sync-managed-plugin-ids": ["chrome@openai-bundled"],
                "global-dictation-keep-visible": false
            })
            .to_string(),
        )
        .unwrap();
        write_complete_plugin_cache(&backup.join("browser").join("backup-1"), "browser");
        write_complete_plugin_cache(&backup.join("chrome").join("backup-1"), "chrome");
        write_complete_plugin_cache(
            &backup.join("computer-use").join("backup-1"),
            "computer-use",
        );

        unsafe {
            std::env::set_var("CODEX_HOME", &codex_home);
        }
        let result = repair_official_plugin_cache(
            "openai-bundled",
            &official_plugin_specs(),
            backup_root.clone(),
        )
        .unwrap();
        unsafe {
            std::env::remove_var("CODEX_HOME");
        }

        assert_eq!(result.status, "ok");
        assert!(result.global_state_updated);
        assert_eq!(
            result.global_state_entries,
            vec![
                "browser@openai-bundled".to_string(),
                "chrome@openai-bundled".to_string(),
                "computer-use@openai-bundled".to_string(),
            ]
        );
        assert_eq!(result.plugins.len(), 3);
        assert_eq!(
            result
                .plugins
                .iter()
                .filter(|plugin| plugin.restored)
                .count(),
            3
        );
        assert_eq!(
            result
                .plugins
                .iter()
                .filter(|plugin| plugin.config_updated)
                .count(),
            3
        );
        assert!(
            cache_root
                .join("browser/26.608.12217/scripts/browser-client.mjs")
                .exists()
        );
        assert!(
            cache_root
                .join("chrome/latest/scripts/installManifest.mjs")
                .exists()
        );
        assert!(
            cache_root
                .join("computer-use/26.608.12217/scripts/computer-use-client.mjs")
                .exists()
        );
        let config = std::fs::read_to_string(codex_home.join("config.toml")).unwrap();
        assert!(config.contains("[plugins.\"browser@openai-bundled\"]"));
        assert!(config.contains("[plugins.\"chrome@openai-bundled\"]"));
        assert!(config.contains("[plugins.\"computer-use@openai-bundled\"]"));
        let global_state: Value = serde_json::from_str(
            &std::fs::read_to_string(codex_home.join(".codex-global-state.json")).unwrap(),
        )
        .unwrap();
        let managed = global_state["electron-chrome-extension-sync-managed-plugin-ids"]
            .as_array()
            .unwrap();
        assert!(managed.contains(&json!("browser@openai-bundled")));
        assert!(managed.contains(&json!("chrome@openai-bundled")));
        assert!(managed.contains(&json!("computer-use@openai-bundled")));
        assert_eq!(global_state["global-dictation-keep-visible"], false);
    }

    #[test]
    fn refresh_official_plugin_cache_is_noop_when_plugins_are_complete_and_enabled() {
        let _guard = env_lock().lock().unwrap();
        let temp = tempfile::tempdir().unwrap();
        let codex_home = temp.path().join(".codex");
        let backup_root = temp.path().join("backups");
        let cache_root = codex_home
            .join("plugins")
            .join("cache")
            .join("openai-bundled");
        std::fs::create_dir_all(&codex_home).unwrap();
        std::fs::write(
            codex_home.join("config.toml"),
            [
                "[plugins.\"browser@openai-bundled\"]",
                "enabled = true",
                "",
                "[plugins.\"chrome@openai-bundled\"]",
                "enabled = true",
                "",
                "[plugins.\"computer-use@openai-bundled\"]",
                "enabled = true",
                "",
            ]
            .join("\n"),
        )
        .unwrap();
        std::fs::write(
            codex_home.join(".codex-global-state.json"),
            json!({
                "electron-chrome-extension-sync-managed-plugin-ids": [
                    "browser@openai-bundled",
                    "chrome@openai-bundled",
                    "computer-use@openai-bundled"
                ],
                "custom": true
            })
            .to_string(),
        )
        .unwrap();
        write_complete_plugin_cache(&cache_root.join("browser"), "browser");
        write_complete_plugin_cache(&cache_root.join("chrome"), "chrome");
        write_complete_plugin_cache(&cache_root.join("computer-use"), "computer-use");

        unsafe {
            std::env::set_var("CODEX_HOME", &codex_home);
        }
        let result = repair_official_plugin_cache(
            "openai-bundled",
            &official_plugin_specs(),
            backup_root.clone(),
        )
        .unwrap();
        unsafe {
            std::env::remove_var("CODEX_HOME");
        }

        assert_eq!(result.status, "ok");
        assert!(result.plugins.iter().all(|plugin| !plugin.moved));
        assert!(result.plugins.iter().all(|plugin| !plugin.restored));
        assert!(result.plugins.iter().all(|plugin| !plugin.config_updated));
        assert!(!result.global_state_updated);
    }

    fn write_complete_plugin_cache(root: &Path, plugin: &str) {
        let version_root = root.join("26.608.12217");
        std::fs::create_dir_all(version_root.join(".codex-plugin")).unwrap();
        std::fs::write(version_root.join(".codex-plugin/plugin.json"), "{}").unwrap();
        match plugin {
            "browser" => {
                std::fs::create_dir_all(version_root.join("scripts")).unwrap();
                std::fs::create_dir_all(version_root.join("docs")).unwrap();
                std::fs::write(version_root.join("scripts/browser-client.mjs"), "").unwrap();
            }
            "chrome" => {
                std::fs::create_dir_all(version_root.join("scripts")).unwrap();
                std::fs::create_dir_all(version_root.join("extension-host/windows/x64")).unwrap();
                std::fs::write(version_root.join("scripts/browser-client.mjs"), "").unwrap();
                std::fs::write(version_root.join("scripts/installManifest.mjs"), "").unwrap();
                std::fs::write(
                    version_root.join("extension-host/windows/x64/extension-host.exe"),
                    "",
                )
                .unwrap();
                copy_dir_all(&version_root, &root.join("latest")).unwrap();
            }
            "computer-use" => {
                std::fs::create_dir_all(version_root.join("scripts")).unwrap();
                std::fs::write(version_root.join("scripts/computer-use-client.mjs"), "").unwrap();
            }
            _ => unreachable!("unknown test plugin"),
        }
    }
}
