use std::collections::BTreeMap;
use std::path::PathBuf;

use anyhow::Context;
use serde_json::json;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteProject {
    pub name: String,
    pub cwd: String,
    pub thread_count: usize,
    pub latest_updated_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteThread {
    pub id: String,
    pub title: String,
    pub cwd: String,
    pub archived: bool,
    pub updated_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBotInventory {
    pub projects: Vec<RemoteProject>,
    pub threads: Vec<RemoteThread>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBotMessage {
    pub chat_id: String,
    pub user_id: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBotSelection {
    pub workspace_name: String,
    pub workspace_path: String,
    pub thread_id: String,
    pub thread_name: String,
    pub updated_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBotResponse {
    pub status: String,
    pub reply: String,
    pub action: String,
    pub selection: Option<RemoteBotSelection>,
    pub choices: Vec<RemoteBotChoice>,
    pub forward_to_codex: Option<RemoteCodexTurn>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBotChoice {
    pub index: usize,
    pub title: String,
    pub subtitle: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCodexTurn {
    pub workspace_path: String,
    pub thread_id: Option<String>,
    pub thread_name: String,
    pub prompt: String,
    pub create_new_thread: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteBotState {
    #[serde(default)]
    bindings: BTreeMap<String, RemoteBotBinding>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteBotBinding {
    workspace_name: String,
    workspace_path: String,
    thread_id: String,
    thread_name: String,
    updated_at_ms: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct RemoteBotRouter {
    state_path: PathBuf,
}

impl Default for RemoteBotRouter {
    fn default() -> Self {
        Self::new(crate::paths::default_remote_bot_state_path())
    }
}

impl RemoteBotRouter {
    pub fn new(state_path: PathBuf) -> Self {
        Self { state_path }
    }

    pub fn handle(
        &self,
        message: &RemoteBotMessage,
        inventory: &RemoteBotInventory,
    ) -> anyhow::Result<RemoteBotResponse> {
        let mut state = self.load_state()?;
        let response = handle_message(&mut state, message, inventory);
        if response.status == "ok" {
            self.save_state(&state)?;
        }
        Ok(response)
    }

    fn load_state(&self) -> anyhow::Result<RemoteBotState> {
        let contents = match std::fs::read_to_string(&self.state_path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(RemoteBotState::default());
            }
            Err(error) => {
                return Err(error).with_context(|| {
                    format!(
                        "failed to read remote bot state {}",
                        self.state_path.display()
                    )
                });
            }
        };
        Ok(serde_json::from_str(&contents).unwrap_or_default())
    }

    fn save_state(&self, state: &RemoteBotState) -> anyhow::Result<()> {
        if let Some(parent) = self.state_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let bytes = serde_json::to_vec_pretty(state)?;
        crate::settings::atomic_write(&self.state_path, &bytes)
    }
}

fn handle_message(
    state: &mut RemoteBotState,
    message: &RemoteBotMessage,
    inventory: &RemoteBotInventory,
) -> RemoteBotResponse {
    let text = message.text.trim();
    let key = binding_key(message);
    if text.is_empty() {
        return help_response(current_selection(state, &key));
    }
    if text == "/帮助" || text == "/help" {
        return help_response(current_selection(state, &key));
    }
    if text == "/当前" {
        return current_response(current_selection(state, &key));
    }
    if text.starts_with("/项目") {
        return route_project_command(state, &key, text, inventory);
    }
    if text.starts_with("/对话") {
        return route_thread_command(state, &key, text, inventory);
    }
    if text.starts_with("/新建对话") {
        return route_new_thread_command(state, &key, text);
    }
    match current_selection(state, &key) {
        Some(selection) => {
            let create_new_thread = selection.thread_id.is_empty();
            RemoteBotResponse {
                status: "ok".to_string(),
                reply: "已转发到当前 Codex 对话。".to_string(),
                action: "forward".to_string(),
                selection: Some(selection.clone()),
                choices: Vec::new(),
                forward_to_codex: Some(RemoteCodexTurn {
                    workspace_path: selection.workspace_path,
                    thread_id: if create_new_thread {
                        None
                    } else {
                        Some(selection.thread_id)
                    },
                    thread_name: selection.thread_name,
                    prompt: text.to_string(),
                    create_new_thread,
                }),
            }
        }
        None => failed_response("请先发送 /项目 选择项目，再发送 /对话 选择对话。"),
    }
}

fn route_project_command(
    state: &mut RemoteBotState,
    key: &str,
    text: &str,
    inventory: &RemoteBotInventory,
) -> RemoteBotResponse {
    let arg = command_arg(text, "/项目");
    if arg.is_empty() {
        let choices = inventory
            .projects
            .iter()
            .take(30)
            .enumerate()
            .map(|(index, project)| RemoteBotChoice {
                index: index + 1,
                title: project.name.clone(),
                subtitle: format!(
                    "{} 个对话 · {}",
                    project.thread_count,
                    format_relative_time(project.latest_updated_at_ms)
                ),
                value: project.cwd.clone(),
            })
            .collect::<Vec<_>>();
        return RemoteBotResponse {
            status: "ok".to_string(),
            reply: format_choices("请选择项目：", "/项目", &choices),
            action: "list_projects".to_string(),
            selection: current_selection(state, key),
            choices,
            forward_to_codex: None,
        };
    }
    let Some(project) = choose_project(arg, inventory) else {
        return failed_response("未找到项目。请发送 /项目 查看可选项目。");
    };
    let first_thread = inventory
        .threads
        .iter()
        .find(|thread| thread.cwd == project.cwd);
    state.bindings.insert(
        key.to_string(),
        RemoteBotBinding {
            workspace_name: project.name.clone(),
            workspace_path: project.cwd.clone(),
            thread_id: first_thread
                .map(|thread| thread.id.clone())
                .unwrap_or_default(),
            thread_name: first_thread
                .map(|thread| thread.title.clone())
                .unwrap_or_else(|| "Feishu - Dex".to_string()),
            updated_at_ms: first_thread.and_then(|thread| thread.updated_at_ms),
        },
    );
    RemoteBotResponse {
        status: "ok".to_string(),
        reply: format!(
            "已选择项目：{}\n继续发送 /对话 查看该项目下的旧对话，或发送 /新建对话。",
            project.name
        ),
        action: "select_project".to_string(),
        selection: current_selection(state, key),
        choices: Vec::new(),
        forward_to_codex: None,
    }
}

fn route_thread_command(
    state: &mut RemoteBotState,
    key: &str,
    text: &str,
    inventory: &RemoteBotInventory,
) -> RemoteBotResponse {
    let Some(selection) = current_selection(state, key) else {
        return failed_response("请先发送 /项目 选择项目。");
    };
    let threads = inventory
        .threads
        .iter()
        .filter(|thread| thread.cwd == selection.workspace_path)
        .collect::<Vec<_>>();
    let arg = command_arg(text, "/对话");
    if arg.is_empty() {
        let choices = threads
            .iter()
            .take(30)
            .enumerate()
            .map(|(index, thread)| RemoteBotChoice {
                index: index + 1,
                title: thread.title.clone(),
                subtitle: format!(
                    "{}{}",
                    format_relative_time(thread.updated_at_ms),
                    if thread.archived { " · 归档" } else { "" }
                ),
                value: thread.id.clone(),
            })
            .collect::<Vec<_>>();
        return RemoteBotResponse {
            status: "ok".to_string(),
            reply: format_choices("请选择对话：", "/对话", &choices),
            action: "list_threads".to_string(),
            selection: Some(selection),
            choices,
            forward_to_codex: None,
        };
    }
    let Some(thread) = choose_thread(arg, &threads) else {
        return failed_response("未找到对话。请发送 /对话 查看可选对话。");
    };
    state.bindings.insert(
        key.to_string(),
        RemoteBotBinding {
            workspace_name: selection.workspace_name,
            workspace_path: thread.cwd.clone(),
            thread_id: thread.id.clone(),
            thread_name: thread.title.clone(),
            updated_at_ms: thread.updated_at_ms,
        },
    );
    RemoteBotResponse {
        status: "ok".to_string(),
        reply: format!(
            "已选择对话：{}\n时间：{}\n之后的普通消息会继续这个对话。",
            thread.title,
            format_relative_time(thread.updated_at_ms)
        ),
        action: "select_thread".to_string(),
        selection: current_selection(state, key),
        choices: Vec::new(),
        forward_to_codex: None,
    }
}

fn route_new_thread_command(
    state: &mut RemoteBotState,
    key: &str,
    text: &str,
) -> RemoteBotResponse {
    let Some(selection) = current_selection(state, key) else {
        return failed_response("请先发送 /项目 选择项目。");
    };
    let name = command_arg(text, "/新建对话");
    let thread_name = if name.is_empty() {
        "Feishu - Dex".to_string()
    } else {
        name.to_string()
    };
    state.bindings.insert(
        key.to_string(),
        RemoteBotBinding {
            workspace_name: selection.workspace_name,
            workspace_path: selection.workspace_path.clone(),
            thread_id: String::new(),
            thread_name: thread_name.clone(),
            updated_at_ms: None,
        },
    );
    RemoteBotResponse {
        status: "ok".to_string(),
        reply: format!(
            "已准备新建对话：{thread_name}\n下一条普通消息会在当前项目下创建新 Codex thread。"
        ),
        action: "new_thread".to_string(),
        selection: current_selection(state, key),
        choices: Vec::new(),
        forward_to_codex: None,
    }
}

fn choose_project<'a>(arg: &str, inventory: &'a RemoteBotInventory) -> Option<&'a RemoteProject> {
    if let Ok(index) = arg.parse::<usize>() {
        return inventory.projects.get(index.saturating_sub(1));
    }
    inventory
        .projects
        .iter()
        .find(|project| project.name == arg || project.cwd == arg)
}

fn choose_thread<'a>(arg: &str, threads: &'a [&RemoteThread]) -> Option<&'a RemoteThread> {
    if let Ok(index) = arg.parse::<usize>() {
        return threads.get(index.saturating_sub(1)).copied();
    }
    threads
        .iter()
        .copied()
        .find(|thread| thread.id == arg || thread.title == arg)
}

fn current_selection(state: &RemoteBotState, key: &str) -> Option<RemoteBotSelection> {
    state.bindings.get(key).map(|binding| RemoteBotSelection {
        workspace_name: binding.workspace_name.clone(),
        workspace_path: binding.workspace_path.clone(),
        thread_id: binding.thread_id.clone(),
        thread_name: binding.thread_name.clone(),
        updated_at_ms: binding.updated_at_ms,
    })
}

fn current_response(selection: Option<RemoteBotSelection>) -> RemoteBotResponse {
    match selection {
        Some(selection) => RemoteBotResponse {
            status: "ok".to_string(),
            reply: format!(
                "当前项目：{}\n当前对话：{}\n时间：{}",
                selection.workspace_name,
                if selection.thread_id.is_empty() {
                    "新对话"
                } else {
                    &selection.thread_name
                },
                format_relative_time(selection.updated_at_ms)
            ),
            action: "current".to_string(),
            selection: Some(selection),
            choices: Vec::new(),
            forward_to_codex: None,
        },
        None => failed_response("当前还没有选择项目。发送 /项目 查看项目列表。"),
    }
}

fn help_response(selection: Option<RemoteBotSelection>) -> RemoteBotResponse {
    let mut reply = [
        "可用命令：",
        "/项目 - 查看项目列表",
        "/项目 2 - 选择第 2 个项目",
        "/对话 - 查看当前项目的旧对话",
        "/对话 3 - 选择第 3 个对话",
        "/新建对话 [名称] - 在当前项目下新建对话",
        "/当前 - 查看当前绑定",
    ]
    .join("\n");
    if let Some(selection) = &selection {
        reply.push_str(&format!(
            "\n\n当前：{} / {}",
            selection.workspace_name, selection.thread_name
        ));
    }
    RemoteBotResponse {
        status: "ok".to_string(),
        reply,
        action: "help".to_string(),
        selection,
        choices: Vec::new(),
        forward_to_codex: None,
    }
}

fn failed_response(message: &str) -> RemoteBotResponse {
    RemoteBotResponse {
        status: "failed".to_string(),
        reply: message.to_string(),
        action: "error".to_string(),
        selection: None,
        choices: Vec::new(),
        forward_to_codex: None,
    }
}

fn format_choices(title: &str, command: &str, choices: &[RemoteBotChoice]) -> String {
    if choices.is_empty() {
        return format!("{title}\n暂无可选项。");
    }
    let lines = choices
        .iter()
        .map(|choice| {
            format!(
                "{}. {} - {}\n   选择：{} {}",
                choice.index, choice.title, choice.subtitle, command, choice.index
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("{title}\n{lines}")
}

fn command_arg<'a>(text: &'a str, command: &str) -> &'a str {
    text.strip_prefix(command).unwrap_or(text).trim()
}

fn binding_key(message: &RemoteBotMessage) -> String {
    let chat = message.chat_id.trim();
    let user = message.user_id.trim();
    if !chat.is_empty() && !user.is_empty() {
        format!("{chat}:{user}")
    } else if !chat.is_empty() {
        chat.to_string()
    } else {
        user.to_string()
    }
}

fn format_relative_time(value: Option<i64>) -> String {
    let Some(value) = value else {
        return "未知时间".to_string();
    };
    let now = now_ms();
    let diff = now.saturating_sub(value.max(0) as u64);
    let minute = 60_000;
    let hour = 60 * minute;
    let day = 24 * hour;
    if diff < minute {
        "刚刚".to_string()
    } else if diff < hour {
        format!("{} 分钟前", diff / minute)
    } else if diff < day {
        format!("{} 小时前", diff / hour)
    } else {
        format!("{} 天前", diff / day)
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn audit_bot_message(
    message: &RemoteBotMessage,
    response: &RemoteBotResponse,
) -> serde_json::Value {
    json!({
        "chat_id_set": !message.chat_id.trim().is_empty(),
        "user_id_set": !message.user_id.trim().is_empty(),
        "command": message.text.split_whitespace().next().unwrap_or("message"),
        "status": response.status,
        "action": response.action,
        "forward_to_codex": response.forward_to_codex.is_some(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn inventory() -> RemoteBotInventory {
        RemoteBotInventory {
            projects: vec![
                RemoteProject {
                    name: "Meta".to_string(),
                    cwd: "D:/Skye/Meta".to_string(),
                    thread_count: 2,
                    latest_updated_at_ms: Some(1_700_000_000_000),
                },
                RemoteProject {
                    name: "codex-enhance".to_string(),
                    cwd: "D:/Skye/codex-enhance".to_string(),
                    thread_count: 1,
                    latest_updated_at_ms: Some(1_700_000_001_000),
                },
            ],
            threads: vec![
                RemoteThread {
                    id: "t1".to_string(),
                    title: "为什么我当前的下载...".to_string(),
                    cwd: "D:/Skye/Meta".to_string(),
                    archived: false,
                    updated_at_ms: Some(1_700_000_000_000),
                },
                RemoteThread {
                    id: "t2".to_string(),
                    title: "当前项目和三层架构".to_string(),
                    cwd: "D:/Skye/Meta".to_string(),
                    archived: true,
                    updated_at_ms: Some(1_699_000_000_000),
                },
            ],
        }
    }

    fn msg(text: &str) -> RemoteBotMessage {
        RemoteBotMessage {
            chat_id: "chat".to_string(),
            user_id: "user".to_string(),
            text: text.to_string(),
        }
    }

    #[test]
    fn project_command_lists_projects() {
        let mut state = RemoteBotState::default();
        let response = handle_message(&mut state, &msg("/项目"), &inventory());

        assert_eq!(response.action, "list_projects");
        assert_eq!(response.choices.len(), 2);
        assert!(response.reply.contains("/项目 1"));
    }

    #[test]
    fn project_and_thread_selection_bind_current_chat() {
        let mut state = RemoteBotState::default();

        let project = handle_message(&mut state, &msg("/项目 1"), &inventory());
        let thread = handle_message(&mut state, &msg("/对话 2"), &inventory());

        assert_eq!(project.action, "select_project");
        assert_eq!(thread.action, "select_thread");
        let selection = thread.selection.unwrap();
        assert_eq!(selection.workspace_name, "Meta");
        assert_eq!(selection.thread_id, "t2");
    }

    #[test]
    fn ordinary_message_forwards_to_selected_thread() {
        let mut state = RemoteBotState::default();
        handle_message(&mut state, &msg("/项目 Meta"), &inventory());
        handle_message(&mut state, &msg("/对话 1"), &inventory());

        let response = handle_message(&mut state, &msg("继续分析"), &inventory());

        assert_eq!(response.action, "forward");
        let turn = response.forward_to_codex.unwrap();
        assert_eq!(turn.workspace_path, "D:/Skye/Meta");
        assert_eq!(turn.thread_id.as_deref(), Some("t1"));
        assert_eq!(turn.prompt, "继续分析");
    }

    #[test]
    fn new_thread_clears_thread_id_for_next_turn() {
        let mut state = RemoteBotState::default();
        handle_message(&mut state, &msg("/项目 1"), &inventory());

        let response = handle_message(&mut state, &msg("/新建对话 远程测试"), &inventory());

        assert_eq!(response.action, "new_thread");
        let selection = response.selection.unwrap();
        assert_eq!(selection.thread_id, "");
        assert_eq!(selection.thread_name, "远程测试");

        let forwarded = handle_message(&mut state, &msg("开始新话题"), &inventory());
        assert!(forwarded.forward_to_codex.unwrap().create_new_thread);
    }
}
