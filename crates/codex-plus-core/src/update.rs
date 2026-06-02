use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DEFAULT_REPOSITORY: &str = "lgdy88/codex-enhance";
pub const DEFAULT_LATEST_RELEASE_URL: &str =
    "https://github.com/lgdy88/codex-enhance/releases/latest";
pub const DEFAULT_LATEST_METADATA_URL: &str =
    "https://github.com/lgdy88/codex-enhance/releases/latest/download/latest.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Release {
    pub version: String,
    pub url: String,
    pub body: String,
    pub asset_name: Option<String>,
    pub asset_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UpdateCheck {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub release_summary: String,
    pub asset_name: Option<String>,
    pub asset_url: Option<String>,
    pub update_available: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UpdateInstall {
    pub release: Release,
    pub installer_path: PathBuf,
    pub launched: bool,
}

pub fn parse_version_tag(value: &str) -> anyhow::Result<Vec<u64>> {
    let normalized = value.trim().trim_start_matches(['v', 'V']);
    let mut digits = String::new();
    for ch in normalized.chars() {
        if ch.is_ascii_digit() || ch == '.' {
            digits.push(ch);
        } else {
            break;
        }
    }
    if digits.is_empty() {
        anyhow::bail!("Invalid version tag: {value}");
    }
    digits
        .split('.')
        .map(|part| part.parse::<u64>().map_err(Into::into))
        .collect()
}

pub fn is_newer_version(candidate: &str, current: &str) -> anyhow::Result<bool> {
    let mut left = parse_version_tag(candidate)?;
    let mut right = parse_version_tag(current)?;
    let len = left.len().max(right.len());
    left.resize(len, 0);
    right.resize(len, 0);
    Ok(left > right)
}

pub fn release_from_github_payload(payload: &Value) -> anyhow::Result<Release> {
    let version = payload
        .get("tag_name")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("release payload missing tag_name"))?
        .to_string();
    let assets = payload
        .get("assets")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|asset| {
            Some((
                asset.get("name")?.as_str()?.to_string(),
                asset.get("browser_download_url")?.as_str()?.to_string(),
            ))
        })
        .collect::<Vec<_>>();
    let selected = select_update_asset(&assets);
    Ok(Release {
        version,
        url: payload
            .get("html_url")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        body: payload
            .get("body")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        asset_name: selected.as_ref().map(|asset| asset.name.clone()),
        asset_url: selected.map(|asset| asset.browser_download_url),
    })
}

pub fn release_from_latest_metadata_payload(payload: &Value) -> anyhow::Result<Release> {
    let version = payload
        .get("version")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("latest.json missing version"))?
        .to_string();
    parse_version_tag(&version)?;
    let assets = latest_metadata_assets(payload);
    let selected = select_update_asset(&assets);
    Ok(Release {
        version,
        url: payload
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        body: payload
            .get("body")
            .or_else(|| payload.get("notes"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        asset_name: selected.as_ref().map(|asset| asset.name.clone()),
        asset_url: selected.map(|asset| asset.browser_download_url),
    })
}

fn latest_metadata_assets(payload: &Value) -> Vec<(String, String)> {
    let mut assets = payload
        .get("assets")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|asset| {
            Some((
                asset.get("name")?.as_str()?.to_string(),
                asset.get("url")?.as_str()?.to_string(),
            ))
        })
        .collect::<Vec<_>>();

    if assets.is_empty() {
        assets.extend(tauri_updater_platform_assets(payload));
    }

    assets
}

fn tauri_updater_platform_assets(payload: &Value) -> Option<(String, String)> {
    let platform = if cfg!(windows) {
        "windows-x86_64"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "darwin-aarch64"
    } else if cfg!(target_os = "macos") {
        "darwin-x86_64"
    } else {
        return None;
    };
    let url = payload
        .get("platforms")?
        .get(platform)?
        .get("url")?
        .as_str()?
        .to_string();
    let name = url
        .rsplit('/')
        .next()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or(platform)
        .to_string();

    Some((name, url))
}

pub fn parse_latest_release_tag_url(value: &str) -> anyhow::Result<String> {
    let path = value
        .split('#')
        .next()
        .unwrap_or(value)
        .split('?')
        .next()
        .unwrap_or(value)
        .trim_end_matches('/');
    let marker = "/releases/tag/";
    let tag = path
        .split_once(marker)
        .map(|(_, tag)| tag)
        .and_then(|tag| tag.split('/').next())
        .filter(|tag| !tag.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("无法从 GitHub Release 地址解析版本：{value}"))?;
    parse_version_tag(tag)?;
    Ok(tag.to_string())
}

pub fn release_from_latest_release_url(value: &str) -> anyhow::Result<Release> {
    let version = parse_latest_release_tag_url(value)?;
    let asset = platform_download_asset_for_version(&version);
    Ok(Release {
        version,
        url: value.to_string(),
        body: String::new(),
        asset_name: asset.as_ref().map(|asset| asset.name.clone()),
        asset_url: asset.map(|asset| asset.browser_download_url),
    })
}

pub fn platform_download_asset_for_version(version: &str) -> Option<ReleaseAsset> {
    parse_version_tag(version).ok()?;
    let tag = normalized_release_tag(version);
    let asset_version = tag.trim_start_matches(['v', 'V']);
    let name = if cfg!(windows) {
        format!("Dex-{asset_version}-windows-x64.msi")
    } else if cfg!(target_os = "macos") {
        format!("Dex-{asset_version}-macos-universal.dmg")
    } else {
        return None;
    };
    Some(ReleaseAsset {
        browser_download_url: format!(
            "https://github.com/{DEFAULT_REPOSITORY}/releases/download/{tag}/{name}"
        ),
        name,
    })
}

fn normalized_release_tag(version: &str) -> String {
    let trimmed = version.trim();
    if trimmed.starts_with(['v', 'V']) {
        trimmed.to_string()
    } else {
        format!("v{trimmed}")
    }
}

pub fn select_update_asset(assets: &[(String, String)]) -> Option<ReleaseAsset> {
    let named = assets
        .iter()
        .filter(|(name, url)| !name.trim().is_empty() && !url.trim().is_empty())
        .collect::<Vec<_>>();
    for (name, url) in &named {
        let lower = name.to_ascii_lowercase();
        if platform_asset_rank(&lower) == 0 {
            return Some(ReleaseAsset {
                name: (*name).clone(),
                browser_download_url: (*url).clone(),
            });
        }
    }
    None
}

pub async fn fetch_latest_release(api_url: &str) -> anyhow::Result<Release> {
    let client = crate::http_client::proxied_client(&format!("Dex/{}", crate::version::VERSION))?;
    let response = client.get(api_url).send().await?.error_for_status()?;
    release_from_latest_release_url(response.url().as_str())
}

pub async fn fetch_latest_metadata(metadata_url: &str) -> anyhow::Result<Release> {
    let user_agent = format!("Dex/{}", crate::version::VERSION);
    let response = crate::http_client::proxied_client(&user_agent)?
        .get(metadata_url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| anyhow::anyhow!("请求 latest.json 失败（{metadata_url}）：{error}"))?
        .error_for_status()
        .map_err(|error| anyhow::anyhow!("读取 latest.json 失败（{metadata_url}）：{error}"))?;
    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| anyhow::anyhow!("解析 latest.json 失败（{metadata_url}）：{error}"))?;
    release_from_latest_metadata_payload(&payload)
}

pub async fn check_for_update(current_version: &str) -> anyhow::Result<UpdateCheck> {
    let release = match fetch_latest_metadata(DEFAULT_LATEST_METADATA_URL).await {
        Ok(release) => release,
        Err(metadata_error) => fetch_latest_release(DEFAULT_LATEST_RELEASE_URL)
            .await
            .map_err(|release_error| {
                anyhow::anyhow!(
                    "读取 latest.json 和 GitHub Release 均失败；latest.json：{metadata_error}；Release：{release_error}"
                )
            })?,
    };
    let update_available = is_newer_version(&release.version, current_version)?;
    Ok(UpdateCheck {
        current_version: current_version.to_string(),
        latest_version: Some(release.version),
        release_summary: release.body,
        asset_name: release.asset_name,
        asset_url: release.asset_url,
        update_available,
    })
}

pub async fn perform_update(
    release: &Release,
    download_dir: &Path,
) -> anyhow::Result<UpdateInstall> {
    let url = release
        .asset_url
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("没有可下载的 Release asset"))?;
    let bytes = download_update_bytes(url).await?;
    let installer_path = download_asset_to(release, &bytes, download_dir)?;
    launch_installer(&installer_path)?;
    Ok(UpdateInstall {
        release: release.clone(),
        installer_path,
        launched: true,
    })
}

async fn download_update_bytes(url: &str) -> anyhow::Result<Vec<u8>> {
    let user_agent = format!("Dex/{}", crate::version::VERSION);
    let proxied = crate::http_client::proxied_client(&user_agent)?;
    match download_update_bytes_with(&proxied, url).await {
        Ok(bytes) => Ok(bytes),
        Err(proxied_error) => {
            let direct = crate::http_client::direct_client(&user_agent)?;
            download_update_bytes_with(&direct, url).await.map_err(|direct_error| {
                anyhow::anyhow!(
                    "下载安装包失败（{url}）。已尝试自动代理和直连；自动代理：{proxied_error}；直连：{direct_error}"
                )
            })
        }
    }
}

async fn download_update_bytes_with(
    client: &reqwest::Client,
    url: &str,
) -> anyhow::Result<Vec<u8>> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| anyhow::anyhow!("发送请求失败：{error}"))?
        .error_for_status()
        .map_err(|error| anyhow::anyhow!("服务端返回错误状态：{error}"))?;
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| anyhow::anyhow!("读取安装包内容失败：{error}"))
}

pub fn download_asset_to(
    release: &Release,
    bytes: &[u8],
    download_dir: &Path,
) -> anyhow::Result<PathBuf> {
    let name = release
        .asset_name
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("没有可下载的 Release asset"))?;
    let safe = safe_asset_name(name)?;
    std::fs::create_dir_all(download_dir)?;
    let path = download_dir.join(safe);
    std::fs::write(&path, bytes)?;
    Ok(path)
}

pub fn safe_asset_name(name: &str) -> anyhow::Result<String> {
    if name.trim().is_empty() {
        anyhow::bail!("非法 Release asset 文件名: {name}");
    }
    let path = Path::new(name);
    if path.components().count() != 1 {
        anyhow::bail!("非法 Release asset 文件名: {name}");
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| anyhow::anyhow!("非法 Release asset 文件名: {name}"))?;
    if file_name == "." || file_name == ".." {
        anyhow::bail!("非法 Release asset 文件名: {name}");
    }
    Ok(file_name.to_string())
}

fn platform_asset_rank(name: &str) -> u8 {
    if cfg!(windows) && is_windows_installer_asset(name) {
        return 0;
    }
    if cfg!(target_os = "macos") && is_macos_installer_asset(name) {
        return 0;
    }
    2
}

fn is_windows_installer_asset(name: &str) -> bool {
    name.starts_with("dex-") && name.contains("-windows-") && name.ends_with(".msi")
}

fn is_macos_installer_asset(name: &str) -> bool {
    name.starts_with("dex-") && name.contains("-macos-") && name.ends_with(".dmg")
}

pub fn launch_installer(path: &Path) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut command = if path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("msi"))
        {
            let mut command = std::process::Command::new("msiexec.exe");
            command.arg("/i").arg(path);
            command
        } else {
            std::process::Command::new(path)
        };
        command
            .creation_flags(crate::windows_integration::CREATE_NO_WINDOW)
            .spawn()
            .map(|_| ())
            .map_err(|error| anyhow::anyhow!("启动安装包失败：{error}"))
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| anyhow::anyhow!("打开 DMG 失败：{error}"))
    }

    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let _ = path;
        anyhow::bail!("当前平台不支持启动安装包")
    }
}
