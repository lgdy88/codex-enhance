use codex_plus_core::remote::{RemoteControlConfig, RemoteControlStore};
use codex_plus_core::remote_bot::{RemoteBotMessage, RemoteBotResponse, RemoteBotRouter};
use codex_plus_core::remote_bridge::RemoteBridgeController;
use serde_json::json;

use super::{
    CommandResult, RemoteBotMessagePayload, RemoteBotMessageRequest, RemoteBridgePayload,
    RemoteControlPayload, RemoteDependencyPayload, RemoteInventoryPayload, failed,
    inventory_for_bot, load_remote_inventory_value, ok, remote_bridge_payload,
    remote_bridge_payload_value, write_remote_inventory_snapshot,
};

#[tauri::command]
pub fn load_remote_control() -> CommandResult<RemoteControlPayload> {
    super::remote_control_payload("远程控制配置已加载。", "远程控制配置读取失败")
}

#[tauri::command]
pub fn save_remote_control(config: RemoteControlConfig) -> CommandResult<RemoteControlPayload> {
    let store = RemoteControlStore::default();
    match store.save(&config) {
        Ok(config) => {
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.remote_config_saved",
                codex_plus_core::remote::audit_remote_config_saved(&config),
            );
            ok(
                "远程控制配置已保存。",
                RemoteControlPayload {
                    status: codex_plus_core::remote::build_status(&config, store.path()),
                    config,
                },
            )
        }
        Err(error) => failed(
            &format!("远程控制配置保存失败：{error}"),
            RemoteControlPayload {
                status: codex_plus_core::remote::build_status(&config, store.path()),
                config,
            },
        ),
    }
}

#[tauri::command]
pub fn check_remote_dependencies() -> CommandResult<RemoteDependencyPayload> {
    let checks = codex_plus_core::remote::dependency_checks();
    let missing = checks.iter().filter(|check| check.status != "ok").count();
    let message = if missing == 0 {
        "远程桥接依赖已可用。".to_string()
    } else {
        format!("有 {missing} 个远程桥接依赖未就绪。")
    };
    ok(&message, RemoteDependencyPayload { checks })
}

#[tauri::command]
pub async fn load_remote_inventory() -> CommandResult<RemoteInventoryPayload> {
    let result = tauri::async_runtime::spawn_blocking(load_remote_inventory_value).await;
    match result {
        Ok(inventory) => {
            let status = inventory.status.clone();
            let message = inventory.message.clone();
            CommandResult {
                status,
                message,
                payload: RemoteInventoryPayload { inventory },
            }
        }
        Err(error) => failed(
            &format!("读取本地项目和对话失败：{error}"),
            RemoteInventoryPayload {
                inventory: codex_plus_data::CodexRemoteInventory {
                    status: "failed".to_string(),
                    message: error.to_string(),
                    db_path: String::new(),
                    projects: Vec::new(),
                    threads: Vec::new(),
                },
            },
        ),
    }
}

#[tauri::command]
pub async fn handle_remote_bot_message(
    request: RemoteBotMessageRequest,
) -> CommandResult<RemoteBotMessagePayload> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        let inventory = inventory_for_bot(load_remote_inventory_value());
        let message = RemoteBotMessage {
            chat_id: request.chat_id,
            user_id: request.user_id,
            text: request.text,
        };
        let response = RemoteBotRouter::default().handle(&message, &inventory)?;
        let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
            "manager.remote_bot_message",
            codex_plus_core::remote_bot::audit_bot_message(&message, &response),
        );
        anyhow::Ok(response)
    })
    .await;
    match result {
        Ok(Ok(response)) => CommandResult {
            status: response.status.clone(),
            message: response.reply.clone(),
            payload: RemoteBotMessagePayload { response },
        },
        Ok(Err(error)) => failed(
            &format!("处理飞书远程命令失败：{error}"),
            RemoteBotMessagePayload {
                response: RemoteBotResponse {
                    status: "failed".to_string(),
                    reply: error.to_string(),
                    action: "error".to_string(),
                    selection: None,
                    choices: Vec::new(),
                    forward_to_codex: None,
                },
            },
        ),
        Err(error) => failed(
            &format!("处理飞书远程命令后台任务失败：{error}"),
            RemoteBotMessagePayload {
                response: RemoteBotResponse {
                    status: "failed".to_string(),
                    reply: error.to_string(),
                    action: "error".to_string(),
                    selection: None,
                    choices: Vec::new(),
                    forward_to_codex: None,
                },
            },
        ),
    }
}

#[tauri::command]
pub fn remote_bridge_status() -> CommandResult<RemoteBridgePayload> {
    remote_bridge_payload("飞书桥接状态已读取。")
}

#[tauri::command]
pub fn start_remote_bridge() -> CommandResult<RemoteBridgePayload> {
    if let Err(error) = write_remote_inventory_snapshot() {
        return failed(
            &format!("飞书桥接启动前刷新项目/对话快照失败：{error}"),
            remote_bridge_payload_value(),
        );
    }
    match codex_plus_core::remote_bridge::start_default_bridge() {
        Ok(bridge) => {
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.remote_bridge_started",
                json!({
                    "status": bridge.status,
                    "pid": bridge.pid,
                    "script_path": bridge.script_path,
                    "config_path": bridge.config_path,
                    "log_path": bridge.log_path,
                }),
            );
            let log = RemoteBridgeController::default()
                .read_log(160)
                .unwrap_or_default();
            ok("飞书桥接已启动。", RemoteBridgePayload { bridge, log })
        }
        Err(error) => failed(
            &format!("飞书桥接启动失败：{error}"),
            remote_bridge_payload_value(),
        ),
    }
}

#[tauri::command]
pub fn stop_remote_bridge() -> CommandResult<RemoteBridgePayload> {
    let controller = RemoteBridgeController::default();
    match controller.stop() {
        Ok(bridge) => {
            let _ = codex_plus_core::diagnostic_log::append_diagnostic_log(
                "manager.remote_bridge_stopped",
                json!({
                    "status": bridge.status,
                    "pid": bridge.pid,
                    "log_path": bridge.log_path,
                }),
            );
            let log = controller.read_log(160).unwrap_or_default();
            ok("飞书桥接已停止。", RemoteBridgePayload { bridge, log })
        }
        Err(error) => failed(
            &format!("飞书桥接停止失败：{error}"),
            remote_bridge_payload_value(),
        ),
    }
}

#[tauri::command]
pub fn read_remote_bridge_log() -> CommandResult<RemoteBridgePayload> {
    remote_bridge_payload("飞书桥接日志已读取。")
}
