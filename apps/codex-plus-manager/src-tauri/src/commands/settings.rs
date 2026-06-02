use codex_plus_core::settings::{BackendSettings, SettingsStore};

use super::{
    CommandResult, SettingsPayload, UserScriptKeyRequest, default_user_script_manager, failed,
    settings_payload, user_script_inventory,
};

#[tauri::command]
pub fn load_settings() -> CommandResult<SettingsPayload> {
    settings_payload("设置已加载。", "设置读取失败")
}

#[tauri::command]
pub fn save_settings(settings: BackendSettings) -> CommandResult<SettingsPayload> {
    match SettingsStore::default().save(&settings) {
        Ok(()) => settings_payload("设置已保存。", "设置保存后重新读取失败"),
        Err(error) => failed(
            &format!("保存设置失败：{error}"),
            SettingsPayload {
                settings,
                settings_path: codex_plus_core::paths::default_settings_path()
                    .to_string_lossy()
                    .to_string(),
                user_scripts: user_script_inventory(),
            },
        ),
    }
}

#[tauri::command]
pub fn repair_backend() -> CommandResult<SettingsPayload> {
    settings_payload("后端状态已刷新。", "修复后重新读取设置失败")
}

#[tauri::command]
pub fn reset_settings() -> CommandResult<SettingsPayload> {
    let settings = BackendSettings::default();
    match SettingsStore::default().save(&settings) {
        Ok(()) => settings_payload("设置已重置为默认值。", "设置重置后重新读取失败"),
        Err(error) => failed(
            &format!("重置设置失败：{error}"),
            SettingsPayload {
                settings,
                settings_path: codex_plus_core::paths::default_settings_path()
                    .to_string_lossy()
                    .to_string(),
                user_scripts: user_script_inventory(),
            },
        ),
    }
}

#[tauri::command]
pub fn delete_user_script(request: UserScriptKeyRequest) -> CommandResult<SettingsPayload> {
    match default_user_script_manager().delete_user_script(&request.key) {
        Ok(_) => settings_payload("用户脚本已删除。", "删除脚本后重新读取设置失败"),
        Err(error) => failed(
            &format!("删除用户脚本失败：{error}"),
            SettingsPayload {
                settings: SettingsStore::default().load().unwrap_or_default(),
                settings_path: codex_plus_core::paths::default_settings_path()
                    .to_string_lossy()
                    .to_string(),
                user_scripts: user_script_inventory(),
            },
        ),
    }
}
