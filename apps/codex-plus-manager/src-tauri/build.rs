fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();
    let sidecar = std::path::Path::new("binaries/codex-plus-plus-x86_64-pc-windows-msvc.exe");
    let needs_sidecar = target.contains("windows");
    if !needs_sidecar || (std::env::var("PROFILE").as_deref() == Ok("debug") && !sidecar.exists()) {
        // Unit tests and the custom macOS DMG path build this crate without Tauri sidecars.
        unsafe {
            std::env::set_var("TAURI_CONFIG", r#"{"bundle":{"externalBin":[]}}"#);
        }
    }

    let windows = tauri_build::WindowsAttributes::new()
        .app_manifest(include_str!("windows-app-manifest.xml"));
    let attrs = tauri_build::Attributes::new().windows_attributes(windows);
    tauri_build::try_build(attrs).expect("failed to run Tauri build script");
}
