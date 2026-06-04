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

fn codex_home_dir() -> PathBuf {
    std::env::var_os("CODEX_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| directories::BaseDirs::new().map(|dirs| dirs.home_dir().join(".codex")))
        .unwrap_or_else(|| PathBuf::from(".codex"))
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
}
