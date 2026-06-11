use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct PluginCacheRepairResult {
    pub status: String,
    pub message: String,
    pub marketplace: String,
    pub plugin: String,
    pub cache_path: String,
    pub backup_path: String,
    pub moved: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialPluginCacheRefreshResult {
    pub status: String,
    pub message: String,
    pub codex_home: String,
    pub cache_root: String,
    pub backup_root: String,
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
    })
}

pub fn refresh_official_plugin_cache() -> anyhow::Result<OfficialPluginCacheRefreshResult> {
    refresh_plugin_cache_for(
        "openai-bundled",
        &["browser", "chrome", "computer-use"],
        crate::paths::default_plugin_cache_backups_dir(),
    )
}

fn refresh_plugin_cache_for(
    marketplace: &str,
    plugins: &[&str],
    backup_root: PathBuf,
) -> anyhow::Result<OfficialPluginCacheRefreshResult> {
    let codex_home = codex_home_dir();
    let cache_root = codex_home.join("plugins").join("cache");
    let plugin_results = plugins
        .iter()
        .map(|plugin| {
            repair_plugin_cache_for_install_with_backup_root(marketplace, plugin, &backup_root)
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    let moved_count = plugin_results.iter().filter(|result| result.moved).count();
    let missing_count = plugin_results.len().saturating_sub(moved_count);
    let status = if moved_count > 0 { "ok" } else { "accepted" };
    let message = if moved_count > 0 {
        format!("已备份 {moved_count} 个官方插件缓存；重启 Codex 后会重新拉取/重建。")
    } else {
        format!("未发现可备份的官方插件缓存；{missing_count} 个目标缓存已不存在。")
    };

    Ok(OfficialPluginCacheRefreshResult {
        status: status.to_string(),
        message,
        codex_home: codex_home.to_string_lossy().into_owned(),
        cache_root: cache_root.to_string_lossy().into_owned(),
        backup_root: backup_root.to_string_lossy().into_owned(),
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

fn repair_plugin_cache_for_install_with_backup_root(
    marketplace: &str,
    plugin: &str,
    backup_root: &Path,
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
        });
    }

    let backup_root = backup_root.join(&marketplace).join(&plugin);
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
    })
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
    fn refresh_official_plugin_cache_backs_up_known_bundled_plugins_only() {
        let _guard = env_lock().lock().unwrap();
        let temp = tempfile::tempdir().unwrap();
        let codex_home = temp.path().join(".codex");
        let backup_root = temp.path().join("backups");
        let cache = codex_home
            .join("plugins")
            .join("cache")
            .join("openai-bundled");
        std::fs::create_dir_all(cache.join("browser")).unwrap();
        std::fs::create_dir_all(cache.join("chrome")).unwrap();
        std::fs::write(cache.join("browser").join("marker.txt"), "browser").unwrap();
        std::fs::write(cache.join("chrome").join("marker.txt"), "chrome").unwrap();

        unsafe {
            std::env::set_var("CODEX_HOME", &codex_home);
        }
        let result = refresh_plugin_cache_for(
            "openai-bundled",
            &["browser", "chrome", "computer-use"],
            backup_root.clone(),
        )
        .unwrap();
        unsafe {
            std::env::remove_var("CODEX_HOME");
        }

        assert_eq!(result.status, "ok");
        assert_eq!(result.plugins.len(), 3);
        assert_eq!(
            result.plugins.iter().filter(|plugin| plugin.moved).count(),
            2
        );
        assert!(!cache.join("browser").exists());
        assert!(!cache.join("chrome").exists());
        assert!(backup_root.join("openai-bundled/browser").exists());
        assert!(backup_root.join("openai-bundled/chrome").exists());
        assert!(result.plugins.iter().any(|plugin| {
            plugin.plugin == "computer-use" && !plugin.moved && plugin.backup_path.is_empty()
        }));
    }
}
