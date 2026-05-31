#[cfg(windows)]
#[test]
fn manager_binary_uses_windows_gui_subsystem_in_debug_and_release() {
    let main_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/main.rs"))
        .expect("read manager main.rs");

    assert!(
        main_rs.contains("#![cfg_attr(windows, windows_subsystem = \"windows\")]"),
        "manager binary should not allocate a console window on Windows"
    );
}

#[test]
fn manager_release_binary_uses_embedded_frontend_assets() {
    let cargo_toml = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml"))
        .expect("read manager Cargo.toml");

    assert!(
        cargo_toml.contains("custom-protocol"),
        "release manager binary should use Tauri custom protocol instead of devUrl localhost"
    );
}

#[test]
fn launcher_binary_embeds_codex_icon_resource() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let launcher_build = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("codex-plus-launcher/build.rs");
    let build_rs = std::fs::read_to_string(&launcher_build).expect("read launcher build.rs");

    assert!(build_rs.contains("WindowsResource"));
    assert!(build_rs.contains("icons/icon.ico"));
}

#[test]
fn windows_binaries_use_user_level_privileges() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let manager_build =
        std::fs::read_to_string(manifest_dir.join("build.rs")).expect("read manager build.rs");
    let windows_manifest = std::fs::read_to_string(manifest_dir.join("windows-app-manifest.xml"))
        .expect("read windows app manifest");
    let launcher_build = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .unwrap()
        .join("codex-plus-launcher/build.rs");
    let launcher_build = std::fs::read_to_string(&launcher_build).expect("read launcher build.rs");
    let tauri_config =
        std::fs::read_to_string(manifest_dir.join("tauri.conf.json")).expect("read tauri config");
    let wix_template = std::fs::read_to_string(manifest_dir.join("wix/per-user-main.wxs"))
        .expect("read per-user wix template");

    assert!(manager_build.contains("windows-app-manifest.xml"));
    assert!(launcher_build.contains("windows-app-manifest.xml"));
    assert!(windows_manifest.contains("asInvoker"));
    assert!(!windows_manifest.contains("requireAdministrator"));
    assert!(windows_manifest.contains("Microsoft.Windows.Common-Controls"));
    assert!(tauri_config.contains("\"targets\": ["));
    assert!(tauri_config.contains("\"msi\""));
    assert!(tauri_config.contains("\"externalBin\": ["));
    assert!(tauri_config.contains("\"binaries/codex-plus-plus\""));
    assert!(tauri_config.contains("\"template\": \"wix/per-user-main.wxs\""));
    assert!(tauri_config.contains("\"signCommand\": null"));
    assert!(tauri_config.contains("\"timestampUrl\": null"));
    assert!(wix_template.contains("InstallScope=\"perUser\""));
    assert!(wix_template.contains("InstallPrivileges=\"limited\""));
    assert!(wix_template.contains("Directory Id=\"LocalAppDataFolder\""));
    assert!(wix_template.contains("RegistryValue Root=\"HKCU\""));
    assert!(!wix_template.contains("requireAdministrator"));
    assert!(!wix_template.contains("taskkill /IM"));
}

#[test]
fn release_workflow_builds_unified_desktop_installers() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let workflow = manifest_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap()
        .join(".github/workflows/release-assets.yml");
    let workflow = std::fs::read_to_string(&workflow).expect("read release workflow");

    assert!(workflow.contains("Build silent launcher"));
    assert!(workflow.contains("Build Windows MSI"));
    assert!(workflow.contains("Build macOS desktop binaries"));
    assert!(workflow.contains("cargo build --release -p codex-plus-manager"));
    assert!(workflow.contains("Install WiX Toolset"));
    assert!(workflow.contains("Stage Windows launcher sidecar"));
    assert!(workflow.contains("codex-plus-plus-x86_64-pc-windows-msvc.exe"));
    assert!(workflow.contains("bundle/msi/*.msi"));
    assert!(workflow.contains("Dex-${VERSION}-windows-x64.msi"));
    assert!(workflow.contains("Package macOS installer"));
    assert!(workflow.contains("package-dmg.sh"));
    assert!(!workflow.contains("CodexPlusPlus-${VERSION}-windows-x64.msi"));
    assert!(!workflow.contains("CodexPlusPlus-${version}"));
    assert!(workflow.contains("!name.startsWith(\"CodexPlusPlus-\")"));
    assert!(!workflow.to_ascii_lowercase().contains("makensis"));
    assert!(!workflow.to_ascii_lowercase().contains("choco install nsis"));
    assert!(!workflow.to_ascii_lowercase().contains("dex.nsi"));
    assert!(
        !workflow
            .to_ascii_lowercase()
            .contains("windows-x64-setup.exe")
    );
    assert!(!workflow.contains("portable.zip"));
    assert!(!workflow.contains("Compress-Archive"));
}

#[test]
fn manager_launch_button_spawns_silent_launcher_binary() {
    let commands_rs =
        std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/commands.rs"))
            .expect("read manager commands.rs");

    assert!(commands_rs.contains("resolve_silent_launcher"));
    assert!(commands_rs.contains("std::process::Command::new"));
    assert!(!commands_rs.contains("launch_and_inject_with_hooks(options"));
}
