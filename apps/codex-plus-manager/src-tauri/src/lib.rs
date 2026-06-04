pub mod commands;
pub mod install;

pub fn run() {
    let show_update = commands::startup_should_show_update();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::image::load_image_generation,
            commands::image::save_image_generation,
            commands::image::generate_image,
            commands::remote::load_remote_control,
            commands::remote::save_remote_control,
            commands::remote::check_remote_dependencies,
            commands::remote::load_remote_inventory,
            commands::remote::handle_remote_bot_message,
            commands::remote::remote_bridge_status,
            commands::remote::start_remote_bridge,
            commands::remote::stop_remote_bridge,
            commands::remote::read_remote_bridge_log,
            commands::settings::delete_user_script,
            commands::sync_providers_now,
            commands::repair_provider_paths,
            commands::maintenance::open_external_url,
            commands::maintenance::install_entrypoints,
            commands::maintenance::uninstall_entrypoints,
            commands::maintenance::repair_shortcuts,
            commands::settings::repair_backend,
            commands::update::check_update,
            commands::update::perform_update,
            commands::maintenance::load_watcher_state,
            commands::maintenance::install_watcher,
            commands::maintenance::uninstall_watcher,
            commands::maintenance::enable_watcher,
            commands::maintenance::disable_watcher,
            commands::maintenance::read_latest_logs,
            commands::maintenance::copy_diagnostics,
            commands::settings::reset_settings
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Dex manager");
}
