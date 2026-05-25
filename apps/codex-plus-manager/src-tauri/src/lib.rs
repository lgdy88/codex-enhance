pub mod commands;
pub mod install;

pub fn run() {
    let show_update = commands::startup_should_show_update();
    tauri::Builder::default()
        .setup(move |app| {
            let url = if show_update {
                "index.html?showUpdate=1"
            } else {
                "index.html"
            };
            let mut window =
                tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App(url.into()))
                    .title("Dex")
                    .inner_size(960.0, 720.0);
            if let Some(icon) = app.default_window_icon().cloned() {
                window = window.icon(icon)?;
            }
            window.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::backend_version,
            commands::startup_options,
            commands::load_overview,
            commands::launch_codex_plus,
            commands::restart_codex_plus,
            commands::load_settings,
            commands::save_settings,
            commands::delete_user_script,
            commands::sync_providers_now,
            commands::repair_provider_paths,
            commands::open_external_url,
            commands::install_entrypoints,
            commands::uninstall_entrypoints,
            commands::repair_shortcuts,
            commands::repair_backend,
            commands::check_update,
            commands::perform_update,
            commands::load_watcher_state,
            commands::install_watcher,
            commands::uninstall_watcher,
            commands::enable_watcher,
            commands::disable_watcher,
            commands::read_latest_logs,
            commands::copy_diagnostics,
            commands::reset_settings,
            commands::load_mcp_status,
            commands::install_browser_mcp,
            commands::remove_browser_mcp,
            commands::set_mcp_enabled
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Dex manager");
}
