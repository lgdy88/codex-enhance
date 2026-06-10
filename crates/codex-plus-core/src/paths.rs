use std::path::PathBuf;

const APP_STATE_DIR: &str = ".codex-session-delete";
const SETTINGS_FILE: &str = "settings.json";
const LATEST_STATUS_FILE: &str = "latest-status.json";
const DIAGNOSTIC_LOG_FILE: &str = "codex-plus.log";
const IMAGE_CONFIG_FILE: &str = "image.json";
const PROMPT_AGENT_CONFIG_FILE: &str = "prompt-agent.json";
const GENERATED_IMAGES_DIR: &str = "generated-images";
const PLUGIN_CACHE_BACKUPS_DIR: &str = "plugin-cache-backups";
const REMOTE_CONFIG_FILE: &str = "remote.json";
const REMOTE_BOT_STATE_FILE: &str = "remote-bot-state.json";
const REMOTE_INVENTORY_FILE: &str = "remote-inventory.json";
const REMOTE_BRIDGE_STATUS_FILE: &str = "remote-bridge-status.json";
const REMOTE_BRIDGE_LOG_FILE: &str = "remote-bridge.log";

pub fn default_app_state_dir() -> PathBuf {
    if let Some(home_dir) = directories::BaseDirs::new().map(|dirs| dirs.home_dir().to_path_buf()) {
        return home_dir.join(APP_STATE_DIR);
    }

    PathBuf::from(APP_STATE_DIR)
}

pub fn default_settings_path() -> PathBuf {
    default_app_state_dir().join(SETTINGS_FILE)
}

pub fn default_image_config_path() -> PathBuf {
    default_app_state_dir().join(IMAGE_CONFIG_FILE)
}

pub fn default_prompt_agent_config_path() -> PathBuf {
    default_app_state_dir().join(PROMPT_AGENT_CONFIG_FILE)
}

pub fn default_generated_images_dir() -> PathBuf {
    default_app_state_dir().join(GENERATED_IMAGES_DIR)
}

pub fn default_plugin_cache_backups_dir() -> PathBuf {
    default_app_state_dir().join(PLUGIN_CACHE_BACKUPS_DIR)
}

pub fn default_remote_config_path() -> PathBuf {
    default_app_state_dir().join(REMOTE_CONFIG_FILE)
}

pub fn default_remote_bot_state_path() -> PathBuf {
    default_app_state_dir().join(REMOTE_BOT_STATE_FILE)
}

pub fn default_remote_inventory_path() -> PathBuf {
    default_app_state_dir().join(REMOTE_INVENTORY_FILE)
}

pub fn default_remote_bridge_status_path() -> PathBuf {
    default_app_state_dir().join(REMOTE_BRIDGE_STATUS_FILE)
}

pub fn default_remote_bridge_log_path() -> PathBuf {
    default_app_state_dir().join(REMOTE_BRIDGE_LOG_FILE)
}

pub fn default_latest_status_path() -> PathBuf {
    default_app_state_dir().join(LATEST_STATUS_FILE)
}

pub fn default_diagnostic_log_path() -> PathBuf {
    default_app_state_dir().join(DIAGNOSTIC_LOG_FILE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_path_uses_app_state_directory() {
        let path = default_settings_path();

        assert!(path.ends_with(".codex-session-delete/settings.json"));
    }

    #[test]
    fn default_remote_config_path_uses_app_state_directory() {
        let path = default_remote_config_path();

        assert!(path.ends_with(".codex-session-delete/remote.json"));
    }

    #[test]
    fn default_image_paths_use_app_state_directory() {
        let config = default_image_config_path();
        let prompt_agent = default_prompt_agent_config_path();
        let output = default_generated_images_dir();

        assert!(config.ends_with(".codex-session-delete/image.json"));
        assert!(prompt_agent.ends_with(".codex-session-delete/prompt-agent.json"));
        assert!(output.ends_with(".codex-session-delete/generated-images"));
    }

    #[test]
    fn default_remote_bot_state_path_uses_app_state_directory() {
        let path = default_remote_bot_state_path();

        assert!(path.ends_with(".codex-session-delete/remote-bot-state.json"));
    }

    #[test]
    fn default_remote_bridge_paths_use_app_state_directory() {
        let inventory_path = default_remote_inventory_path();
        let status_path = default_remote_bridge_status_path();
        let log_path = default_remote_bridge_log_path();

        assert!(inventory_path.ends_with(".codex-session-delete/remote-inventory.json"));
        assert!(status_path.ends_with(".codex-session-delete/remote-bridge-status.json"));
        assert!(log_path.ends_with(".codex-session-delete/remote-bridge.log"));
    }

    #[test]
    fn default_latest_status_path_uses_app_state_directory() {
        let path = default_latest_status_path();

        assert!(path.ends_with(".codex-session-delete/latest-status.json"));
    }

    #[test]
    fn default_diagnostic_log_path_uses_app_state_directory() {
        let path = default_diagnostic_log_path();

        assert!(path.ends_with(".codex-session-delete/codex-plus.log"));
    }
}
