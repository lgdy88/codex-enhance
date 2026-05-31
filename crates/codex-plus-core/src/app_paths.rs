use std::ffi::OsStr;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};

pub fn find_latest_codex_app_dir(root: &Path) -> Option<PathBuf> {
    let mut matches = std::fs::read_dir(root)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .filter_map(|path| version_tuple(&path).map(|version| (version, path)))
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| left.0.cmp(&right.0));
    let (_, latest) = matches.pop()?;
    let app = latest.join("app");
    Some(if app.is_dir() { app } else { latest })
}

pub fn find_latest_codex_app_dir_from_roots(roots: &[PathBuf]) -> Option<PathBuf> {
    roots
        .iter()
        .filter_map(|root| find_latest_codex_app_dir(root))
        .max_by(|left, right| {
            version_tuple(left.parent().unwrap_or(left))
                .cmp(&version_tuple(right.parent().unwrap_or(right)))
        })
}

pub fn find_latest_codex_app_dir_default() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        find_latest_codex_app_dir_from_roots(&windows_app_package_roots())
            .or_else(find_windows_appx_codex_app_dir)
            .or_else(find_running_windows_codex_app_dir)
    }

    #[cfg(not(windows))]
    {
        None
    }
}

#[cfg(windows)]
fn windows_app_package_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(program_files) = std::env::var_os("ProgramFiles") {
        roots.push(PathBuf::from(program_files).join("WindowsApps"));
    }
    if let Some(program_files) = std::env::var_os("ProgramW6432") {
        roots.push(PathBuf::from(program_files).join("WindowsApps"));
    }
    roots.push(PathBuf::from(r"C:\Program Files\WindowsApps"));
    roots.sort();
    roots.dedup();
    roots
}

#[cfg(windows)]
fn find_windows_appx_codex_app_dir() -> Option<PathBuf> {
    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$pkg = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1; if ($pkg) { $pkg | Select-Object InstallLocation,PackageFamilyName | ConvertTo-Json -Compress }",
        ])
        .creation_flags(crate::windows_integration::CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let payload = String::from_utf8(output.stdout).ok()?;
    let package = serde_json::from_str::<WindowsAppxPackage>(&payload).ok()?;
    select_windows_codex_app_dir_from_appx_package(
        &package.install_location,
        package.package_family_name.as_deref(),
    )
}

#[cfg(windows)]
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct WindowsAppxPackage {
    install_location: String,
    package_family_name: Option<String>,
}

#[cfg(windows)]
pub fn select_windows_codex_app_dir_from_appx_package(
    install_location: &str,
    package_family_name: Option<&str>,
) -> Option<PathBuf> {
    if !package_family_name
        .unwrap_or_default()
        .starts_with("OpenAI.Codex_")
    {
        return None;
    }
    let package_dir = PathBuf::from(install_location.trim());
    let package_name = package_dir.file_name()?.to_str()?;
    if !package_name.starts_with("OpenAI.Codex_") || !package_name.contains("__") {
        return None;
    }
    Some(if package_name.eq_ignore_ascii_case("app") {
        package_dir
    } else {
        package_dir.join("app")
    })
}

#[cfg(windows)]
fn find_running_windows_codex_app_dir() -> Option<PathBuf> {
    select_windows_codex_app_dir_from_process_paths(
        crate::windows_integration::enumerate_processes()
            .into_iter()
            .filter(|process| {
                process.exe_file.eq_ignore_ascii_case("Codex.exe")
                    || process.exe_file.eq_ignore_ascii_case("codex.exe")
            })
            .filter_map(|process| process.executable_path),
    )
}

#[cfg(windows)]
pub fn select_windows_codex_app_dir_from_process_paths(
    paths: impl IntoIterator<Item = PathBuf>,
) -> Option<PathBuf> {
    paths
        .into_iter()
        .filter_map(|path| normalize_codex_app_path(&path))
        .filter(|path| packaged_app_user_model_id(path).is_some())
        .max_by(|left, right| {
            version_tuple(left.parent().unwrap_or(left))
                .cmp(&version_tuple(right.parent().unwrap_or(right)))
        })
}

pub fn user_data_candidates() -> Vec<PathBuf> {
    user_data_candidates_from(
        std::env::var_os("LOCALAPPDATA").as_deref().map(Path::new),
        std::env::var_os("APPDATA").as_deref().map(Path::new),
    )
}

pub fn user_data_candidates_from(local: Option<&Path>, roaming: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(local) = local {
        append_user_data_variants(&mut candidates, local);
    }
    if let Some(roaming) = roaming {
        append_user_data_variants(&mut candidates, roaming);
    }
    candidates
}

pub fn find_macos_codex_app(search_roots: &[PathBuf]) -> Option<PathBuf> {
    for root in search_roots {
        for candidate in macos_app_candidates(root) {
            if candidate.is_dir() {
                return Some(candidate);
            }
        }
    }
    None
}

pub fn find_macos_codex_app_default() -> Option<PathBuf> {
    let mut roots = vec![PathBuf::from("/Applications")];
    if let Some(home) = directories::BaseDirs::new().map(|dirs| dirs.home_dir().to_path_buf()) {
        roots.push(home.join("Applications"));
    }
    find_macos_codex_app(&roots)
}

pub fn resolve_codex_app_dir(app_dir: Option<&Path>) -> Option<PathBuf> {
    if let Some(app_dir) = app_dir {
        return normalize_codex_app_path(app_dir);
    }
    if cfg!(target_os = "macos") {
        find_macos_codex_app_default()
    } else {
        find_latest_codex_app_dir_default()
    }
}

pub fn resolve_codex_app_dir_with_saved(
    app_dir: Option<&Path>,
    saved_app_path: Option<&str>,
) -> Option<PathBuf> {
    if let Some(app_dir) = app_dir {
        return normalize_codex_app_path(app_dir);
    }
    if let Some(saved) = saved_app_path
        .map(str::trim)
        .filter(|saved| !saved.is_empty())
    {
        if let Some(path) = normalize_codex_app_path(Path::new(saved)) {
            return Some(path);
        }
    }
    resolve_codex_app_dir(None)
}

pub fn normalize_codex_app_path(path: &Path) -> Option<PathBuf> {
    if path.as_os_str().is_empty() {
        return None;
    }

    let file_name = path.file_name().and_then(OsStr::to_str).unwrap_or_default();
    if file_name.eq_ignore_ascii_case("Codex.exe") || file_name.eq_ignore_ascii_case("codex.exe") {
        return normalize_codex_executable_parent(path.parent()?);
    }

    if path.extension() == Some(OsStr::new("app")) {
        return Some(path.to_path_buf());
    }

    if path.is_file() {
        return path.parent().map(Path::to_path_buf);
    }

    let upper = path.join("Codex.exe");
    let lower = path.join("codex.exe");
    if upper.exists() || lower.exists() {
        return Some(path.to_path_buf());
    }

    let nested_app = path.join("app");
    if nested_app.is_dir() {
        let upper = nested_app.join("Codex.exe");
        let lower = nested_app.join("codex.exe");
        if upper.exists() || lower.exists() {
            return Some(nested_app);
        }
    }

    if path.is_dir() {
        return Some(path.to_path_buf());
    }

    None
}

fn normalize_codex_executable_parent(parent: &Path) -> Option<PathBuf> {
    if parent
        .file_name()
        .and_then(OsStr::to_str)
        .is_some_and(|name| name.eq_ignore_ascii_case("resources"))
        && parent
            .parent()
            .and_then(Path::file_name)
            .and_then(OsStr::to_str)
            .is_some_and(|name| name.eq_ignore_ascii_case("app"))
    {
        return parent.parent().map(Path::to_path_buf);
    }
    Some(parent.to_path_buf())
}

pub fn build_codex_executable(app_dir: &Path) -> PathBuf {
    if app_dir.extension() == Some(OsStr::new("app")) {
        return app_dir.join("Contents").join("MacOS").join("Codex");
    }
    let upper = app_dir.join("Codex.exe");
    if upper.exists() {
        upper
    } else {
        app_dir.join("codex.exe")
    }
}

pub fn codex_app_version(app_dir: &Path) -> Option<String> {
    let package_dir = if app_dir
        .file_name()
        .and_then(OsStr::to_str)
        .is_some_and(|name| name.eq_ignore_ascii_case("app"))
    {
        app_dir.parent()?
    } else {
        app_dir
    };
    codex_package_version(package_dir)
}

pub fn packaged_app_user_model_id(app_dir: &Path) -> Option<String> {
    let package_dir = if app_dir
        .file_name()
        .and_then(OsStr::to_str)
        .is_some_and(|name| name.eq_ignore_ascii_case("app"))
    {
        app_dir.parent()?
    } else {
        app_dir
    };
    let package_name = package_dir.file_name()?.to_str()?;
    if !package_name.starts_with("OpenAI.Codex_") || !package_name.contains("__") {
        return None;
    }
    let identity_name = package_name.split_once('_')?.0;
    let publisher_id = package_name.rsplit_once("__")?.1;
    if publisher_id.is_empty() {
        return None;
    }
    Some(format!("{identity_name}_{publisher_id}!App"))
}

fn codex_package_version(package_dir: &Path) -> Option<String> {
    let name = package_dir.file_name()?.to_str()?;
    let rest = name.strip_prefix("OpenAI.Codex_")?;
    let version = rest.split_once('_')?.0;
    if version.is_empty() {
        None
    } else {
        Some(version.to_string())
    }
}

fn append_user_data_variants(candidates: &mut Vec<PathBuf>, base: &Path) {
    candidates.push(base.join("OpenAI").join("Codex"));
    candidates.push(base.join("OpenAI.Codex"));
    candidates.push(base.join("Codex"));
}

fn macos_app_candidates(root: &Path) -> Vec<PathBuf> {
    if root.extension() == Some(OsStr::new("app")) {
        return vec![root.to_path_buf()];
    }
    ["Codex.app", "OpenAI Codex.app", "OpenAI.Codex.app"]
        .into_iter()
        .map(|name| root.join(name))
        .collect()
}

fn version_tuple(path: &Path) -> Option<Vec<u32>> {
    let name = path.file_name()?.to_str()?;
    let rest = name.strip_prefix("OpenAI.Codex_")?;
    let version = rest.split_once('_')?.0;
    let parts = version
        .split('.')
        .map(str::parse::<u32>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    if parts.is_empty() { None } else { Some(parts) }
}
