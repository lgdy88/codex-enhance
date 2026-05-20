use codex_plus_core::update::{
    Release, download_asset_to, is_newer_version, parse_latest_release_tag_url, parse_version_tag,
    platform_download_asset_for_version, release_from_github_payload,
    release_from_latest_release_url, safe_asset_name, select_update_asset,
};
use serde_json::json;

#[test]
fn parse_version_tag_accepts_prefix_and_suffix() {
    assert_eq!(parse_version_tag("v1.2.3").unwrap(), vec![1, 2, 3]);
    assert_eq!(parse_version_tag("1.2.3").unwrap(), vec![1, 2, 3]);
    assert_eq!(parse_version_tag("v1.2.3-beta.1").unwrap(), vec![1, 2, 3]);
}

#[test]
fn version_comparison_uses_numeric_segments() {
    assert!(is_newer_version("v1.0.10", "1.0.4").unwrap());
    assert!(!is_newer_version("v1.0.4", "1.0.4").unwrap());
    assert!(!is_newer_version("v1.0.3", "1.0.4").unwrap());
}

#[test]
fn github_payload_selects_platform_installer() {
    let release = release_from_github_payload(&json!({
        "tag_name": "v1.0.9",
        "html_url": "https://github.com/lgdy88/codex-enhance/releases/tag/v1.0.9",
        "body": "fixes",
        "assets": [
            {"name": "source.zip", "browser_download_url": "https://example.test/source.zip"},
            {"name": "codex-plus-plus-manager.exe", "browser_download_url": "https://example.test/manager.exe"},
            {"name": "CodexPlusPlus-1.0.9-windows-x64-setup.exe", "browser_download_url": "https://example.test/setup.exe"},
            {"name": "CodexPlusPlus_1.0.9_x64.dmg", "browser_download_url": "https://example.test/app.dmg"}
        ]
    }))
    .unwrap();

    assert_eq!(release.version, "v1.0.9");
    if cfg!(windows) {
        assert_eq!(
            release.asset_name.as_deref(),
            Some("CodexPlusPlus-1.0.9-windows-x64-setup.exe")
        );
    } else if cfg!(target_os = "macos") {
        assert_eq!(
            release.asset_name.as_deref(),
            Some("CodexPlusPlus_1.0.9_x64.dmg")
        );
    } else {
        assert_eq!(release.asset_name.as_deref(), None);
    }
}

#[test]
fn latest_release_url_parser_accepts_redirect_target() {
    assert_eq!(
        parse_latest_release_tag_url(
            "https://github.com/lgdy88/codex-enhance/releases/tag/v1.0.12"
        )
        .unwrap(),
        "v1.0.12"
    );
    assert_eq!(
        parse_latest_release_tag_url(
            "https://github.com/lgdy88/codex-enhance/releases/tag/v1.0.12?expanded_assets=true"
        )
        .unwrap(),
        "v1.0.12"
    );
    assert!(
        parse_latest_release_tag_url("https://github.com/lgdy88/codex-enhance/releases/latest")
            .is_err()
    );
}

#[test]
fn latest_release_url_builds_platform_download_asset_without_github_api() {
    let release = release_from_latest_release_url(
        "https://github.com/lgdy88/codex-enhance/releases/tag/v1.0.12",
    )
    .unwrap();

    assert_eq!(release.version, "v1.0.12");
    assert_eq!(release.body, "");
    if cfg!(windows) {
        assert_eq!(
            release.asset_name.as_deref(),
            Some("CodexPlusPlus-1.0.12-windows-x64-setup.exe")
        );
        assert_eq!(
            release.asset_url.as_deref(),
            Some(
                "https://github.com/lgdy88/codex-enhance/releases/download/v1.0.12/CodexPlusPlus-1.0.12-windows-x64-setup.exe"
            )
        );
    } else if cfg!(target_os = "macos") {
        assert_eq!(
            release.asset_name.as_deref(),
            Some("CodexPlusPlus-1.0.12-macos-universal.dmg")
        );
        assert_eq!(
            release.asset_url.as_deref(),
            Some(
                "https://github.com/lgdy88/codex-enhance/releases/download/v1.0.12/CodexPlusPlus-1.0.12-macos-universal.dmg"
            )
        );
    } else {
        assert_eq!(release.asset_name.as_deref(), None);
        assert_eq!(release.asset_url.as_deref(), None);
    }
}

#[test]
fn platform_download_asset_normalizes_tags() {
    let selected = platform_download_asset_for_version("1.0.12");
    if cfg!(windows) {
        let selected = selected.unwrap();
        assert_eq!(selected.name, "CodexPlusPlus-1.0.12-windows-x64-setup.exe");
        assert_eq!(
            selected.browser_download_url,
            "https://github.com/lgdy88/codex-enhance/releases/download/v1.0.12/CodexPlusPlus-1.0.12-windows-x64-setup.exe"
        );
    } else if cfg!(target_os = "macos") {
        let selected = selected.unwrap();
        assert_eq!(selected.name, "CodexPlusPlus-1.0.12-macos-universal.dmg");
        assert_eq!(
            selected.browser_download_url,
            "https://github.com/lgdy88/codex-enhance/releases/download/v1.0.12/CodexPlusPlus-1.0.12-macos-universal.dmg"
        );
    } else {
        assert!(selected.is_none());
    }
}

#[test]
fn asset_selection_prefers_current_platform_artifacts() {
    let assets = vec![
        (
            "CodexPlusPlus.zip".to_string(),
            "https://example.test/source.zip".to_string(),
        ),
        (
            "codex-plus-plus-manager.exe".to_string(),
            "https://example.test/manager.exe".to_string(),
        ),
        (
            "CodexPlusPlus-1.0.9-windows-x64-setup.exe".to_string(),
            "https://example.test/setup.exe".to_string(),
        ),
        (
            "CodexPlusPlus_1.0.9_x64.dmg".to_string(),
            "https://example.test/app.dmg".to_string(),
        ),
    ];

    if cfg!(windows) {
        let selected = select_update_asset(&assets).unwrap();
        assert_eq!(selected.name, "CodexPlusPlus-1.0.9-windows-x64-setup.exe");
    } else if cfg!(target_os = "macos") {
        let selected = select_update_asset(&assets).unwrap();
        assert_eq!(selected.name, "CodexPlusPlus_1.0.9_x64.dmg");
    } else {
        assert!(select_update_asset(&assets).is_none());
    }
}

#[test]
fn asset_selection_rejects_manager_only_windows_installers() {
    let assets = vec![(
        "Codex++ Manager_1.0.9_x64-setup.exe".to_string(),
        "https://example.test/manager-setup.exe".to_string(),
    )];

    assert!(select_update_asset(&assets).is_none());
}

#[test]
fn safe_asset_name_rejects_path_traversal() {
    assert_eq!(safe_asset_name("pkg.zip").unwrap(), "pkg.zip");
    assert!(safe_asset_name("../pkg.zip").is_err());
    assert!(safe_asset_name("").is_err());
}

#[test]
fn download_asset_to_writes_bytes() {
    let dir = tempfile::tempdir().unwrap();
    let release = Release {
        version: "v1.0.9".to_string(),
        url: "https://example.test".to_string(),
        body: "fixes".to_string(),
        asset_name: Some("pkg.zip".to_string()),
        asset_url: Some("https://example.test/pkg.zip".to_string()),
    };

    let path = download_asset_to(&release, b"abcdef", dir.path()).unwrap();

    assert_eq!(path, dir.path().join("pkg.zip"));
    assert_eq!(std::fs::read(path).unwrap(), b"abcdef");
}
