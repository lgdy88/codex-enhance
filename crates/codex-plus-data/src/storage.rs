use crate::BackupStore;
use codex_plus_core::models::{DeleteResult, DeleteStatus, SessionRef};
use rusqlite::types::{ToSqlOutput, Value as SqlValue, ValueRef};
use rusqlite::{Connection, ToSql};
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct SQLiteStorageAdapter {
    db_path: PathBuf,
    backup_store: BackupStore,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SchemaKind {
    GenericSessions,
    CodexThreads,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexProjectSummary {
    pub name: String,
    pub cwd: String,
    pub thread_count: usize,
    pub latest_updated_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexThreadSummary {
    pub id: String,
    pub title: String,
    pub cwd: String,
    pub archived: bool,
    pub rollout_path: Option<String>,
    pub updated_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRemoteInventory {
    pub status: String,
    pub message: String,
    pub db_path: String,
    pub projects: Vec<CodexProjectSummary>,
    pub threads: Vec<CodexThreadSummary>,
}

#[derive(Debug, Clone)]
struct OwnedSqlValue(SqlValue);

#[derive(Debug, Clone, Default)]
struct CodexWorkspaceState {
    workspace_roots: Vec<String>,
    workspace_labels: HashMap<String, String>,
    projectless_thread_ids: HashSet<String>,
}

impl ToSql for OwnedSqlValue {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::Owned(self.0.clone()))
    }
}

impl SQLiteStorageAdapter {
    pub fn new(db_path: impl Into<PathBuf>, backup_store: BackupStore) -> Self {
        Self {
            db_path: db_path.into(),
            backup_store,
        }
    }

    pub fn delete_local(&self, session: &SessionRef) -> DeleteResult {
        if !self.db_path.exists() {
            return failed(
                &session.session_id,
                format!("Database not found: {}", self.db_path.to_string_lossy()),
            );
        }
        let result = (|| -> anyhow::Result<DeleteResult> {
            let mut db = Connection::open(&self.db_path)?;
            match schema_kind(&db)? {
                Some(SchemaKind::GenericSessions) => self.delete_generic_session(&mut db, session),
                Some(SchemaKind::CodexThreads) => self.delete_codex_thread(&mut db, session),
                None => Ok(failed(
                    &session.session_id,
                    "Unsupported local storage schema".to_string(),
                )),
            }
        })();
        result.unwrap_or_else(|err| failed(&session.session_id, err.to_string()))
    }

    pub fn undo(&self, token: &str) -> DeleteResult {
        let result = (|| -> anyhow::Result<DeleteResult> {
            let backup = self.backup_store.read_backup(token)?;
            let session_id = backup["session_id"].as_str().unwrap_or("").to_string();
            let mut db = Connection::open(&self.db_path)?;
            if let Some(tables) = backup["tables"].as_object() {
                validate_restore_tables(tables)?;
                detect_restore_conflicts(&db, tables)?;
                detect_file_restore_conflicts(tables)?;
                let tx = db.transaction()?;
                for (table, rows) in tables {
                    if table.starts_with("__") {
                        continue;
                    }
                    let Some(rows) = rows.as_array() else {
                        continue;
                    };
                    for row in rows {
                        if let Some(row) = row.as_object() {
                            if table == "agent_job_items"
                                && update_existing_agent_job_item(&tx, row)?
                            {
                                continue;
                            }
                            insert_row(&tx, table, row)?;
                        }
                    }
                }
                tx.commit()?;
                if let Some(files) = tables.get("__files").and_then(Value::as_array) {
                    for file in files {
                        let Some(path) = file.get("path").and_then(Value::as_str) else {
                            continue;
                        };
                        let Some(content) = file.get("content_b64").and_then(Value::as_str) else {
                            continue;
                        };
                        let bytes = base64::Engine::decode(
                            &base64::engine::general_purpose::STANDARD,
                            content,
                        )?;
                        if let Some(parent) = Path::new(path).parent() {
                            fs::create_dir_all(parent)?;
                        }
                        fs::write(path, bytes)?;
                    }
                }
            }
            Ok(DeleteResult {
                status: DeleteStatus::Undone,
                session_id,
                message: "Local session restored from backup".to_string(),
                undo_token: Some(token.to_string()),
                backup_path: None,
            })
        })();
        result.unwrap_or_else(|err| failed_with_undo("", err.to_string(), token, None))
    }

    pub fn find_archived_thread_by_title(&self, title: &str) -> Option<SessionRef> {
        let db = Connection::open(&self.db_path).ok()?;
        if schema_kind(&db).ok().flatten() != Some(SchemaKind::CodexThreads)
            || !has_columns(&db, "threads", &["archived"]).ok()?
        {
            return None;
        }
        let mut stmt = db
            .prepare(
                "SELECT id, title FROM threads
                 WHERE archived = 1 AND (title = ?1 OR title LIKE ?2 OR ?1 LIKE '%' || title || '%')
                 ORDER BY archived_at DESC LIMIT 1",
            )
            .ok()?;
        let mut rows = stmt.query((title, format!("%{title}%"))).ok()?;
        let row = rows.next().ok().flatten()?;
        let id: String = row.get(0).ok()?;
        let row_title: Option<String> = row.get(1).ok()?;
        SessionRef::new(id, row_title.unwrap_or_else(|| title.to_string())).ok()
    }

    pub fn remote_inventory(&self, max_threads: usize) -> CodexRemoteInventory {
        if !self.db_path.exists() {
            return CodexRemoteInventory {
                status: "failed".to_string(),
                message: format!("Database not found: {}", self.db_path.to_string_lossy()),
                db_path: self.db_path.to_string_lossy().to_string(),
                projects: Vec::new(),
                threads: Vec::new(),
            };
        }
        let result = (|| -> anyhow::Result<CodexRemoteInventory> {
            let db = Connection::open(&self.db_path)?;
            if schema_kind(&db)? != Some(SchemaKind::CodexThreads)
                || !has_columns(&db, "threads", &["id", "title", "cwd"])?
            {
                return Ok(CodexRemoteInventory {
                    status: "failed".to_string(),
                    message: "Unsupported local storage schema".to_string(),
                    db_path: self.db_path.to_string_lossy().to_string(),
                    projects: Vec::new(),
                    threads: Vec::new(),
                });
            }
            let workspace_state = load_codex_workspace_state(&default_codex_global_state_path());
            let mut threads = list_codex_threads(&db, max_threads)?;
            normalize_projectless_threads(&mut threads, &workspace_state.projectless_thread_ids);
            let projects = if workspace_state.workspace_roots.is_empty() {
                summarize_projects(&threads)
            } else {
                summarize_codex_projects(&threads, &workspace_state)
            };
            Ok(CodexRemoteInventory {
                status: "ok".to_string(),
                message: format!(
                    "已读取 {} 个项目、{} 个对话。",
                    projects.len(),
                    threads.len()
                ),
                db_path: self.db_path.to_string_lossy().to_string(),
                projects,
                threads,
            })
        })();
        result.unwrap_or_else(|err| CodexRemoteInventory {
            status: "failed".to_string(),
            message: err.to_string(),
            db_path: self.db_path.to_string_lossy().to_string(),
            projects: Vec::new(),
            threads: Vec::new(),
        })
    }

    pub fn move_codex_thread_workspace(
        &self,
        session: &SessionRef,
        target_cwd: &str,
    ) -> serde_json::Value {
        let target = target_cwd.trim();
        if target.is_empty() {
            return json!({"status": "failed", "session_id": session.session_id, "message": "目标项目路径为空"});
        }
        if !self.db_path.exists() {
            return json!({"status": "failed", "session_id": session.session_id, "message": format!("Database not found: {}", self.db_path.to_string_lossy())});
        }
        let result = (|| -> anyhow::Result<Value> {
            let db = Connection::open(&self.db_path)?;
            if schema_kind(&db)? != Some(SchemaKind::CodexThreads)
                || !has_columns(&db, "threads", &["cwd", "rollout_path"])?
            {
                return Ok(
                    json!({"status": "failed", "session_id": session.session_id, "message": "Unsupported local storage schema"}),
                );
            }
            let thread_id = normalize_codex_thread_id(&session.session_id);
            let timestamp_columns = codex_thread_timestamp_columns(&db)?;
            let mut columns = vec![
                "id".to_string(),
                "title".to_string(),
                "cwd".to_string(),
                "rollout_path".to_string(),
            ];
            columns.extend(timestamp_columns);
            let sql = format!("SELECT {} FROM threads WHERE id = ?1", columns.join(", "));
            let mut stmt = db.prepare(&sql)?;
            let row = stmt.query_row([&thread_id], |row| {
                let mut data = Map::new();
                for (index, column) in columns.iter().enumerate() {
                    data.insert(column.clone(), sql_value_to_json(row.get_ref(index)?));
                }
                Ok(data)
            });
            let row = match row {
                Ok(row) => row,
                Err(rusqlite::Error::QueryReturnedNoRows) => {
                    return Ok(
                        json!({"status": "failed", "session_id": thread_id, "message": "Thread not found in local storage"}),
                    );
                }
                Err(err) => return Err(err.into()),
            };
            let previous_cwd = row
                .get("cwd")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let rollout_path = row
                .get("rollout_path")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            db.execute(
                "UPDATE threads SET cwd = ?1 WHERE id = ?2",
                (target, thread_id.as_str()),
            )?;
            let rollout = update_rollout_session_meta_cwd(&rollout_path, &thread_id, target);
            let mut payload = json!({
                "status": "moved",
                "session_id": thread_id,
                "message": "已移动对话",
                "previous_cwd": previous_cwd,
                "target_cwd": target,
                "rollout_updated": rollout.0,
                "rollout_error": rollout.1,
            });
            if let Some(payload) = payload.as_object_mut() {
                add_timestamp_payload(payload, &row);
            }
            Ok(payload)
        })();
        result.unwrap_or_else(|err| json!({"status": "failed", "session_id": session.session_id, "message": err.to_string()}))
    }

    pub fn codex_thread_sort_key(&self, session: &SessionRef) -> serde_json::Value {
        if !self.db_path.exists() {
            return json!({"status": "failed", "session_id": session.session_id, "message": format!("Database not found: {}", self.db_path.to_string_lossy())});
        }
        let result = (|| -> anyhow::Result<Value> {
            let db = Connection::open(&self.db_path)?;
            if schema_kind(&db)? != Some(SchemaKind::CodexThreads) {
                return Ok(
                    json!({"status": "failed", "session_id": session.session_id, "message": "Unsupported local storage schema"}),
                );
            }
            let thread_id = normalize_codex_thread_id(&session.session_id);
            match fetch_thread_timestamp_payload(&db, &thread_id)? {
                Some(mut payload) => {
                    payload.insert("status".to_string(), json!("ok"));
                    payload.insert("session_id".to_string(), json!(thread_id));
                    Ok(Value::Object(payload))
                }
                None => Ok(
                    json!({"status": "failed", "session_id": thread_id, "message": "Thread not found in local storage"}),
                ),
            }
        })();
        result.unwrap_or_else(|err| json!({"status": "failed", "session_id": session.session_id, "message": err.to_string()}))
    }

    pub fn codex_thread_sort_keys(&self, sessions: &[SessionRef]) -> serde_json::Value {
        if !self.db_path.exists() {
            return json!({"status": "failed", "message": format!("Database not found: {}", self.db_path.to_string_lossy()), "sort_keys": []});
        }
        let thread_ids = sessions
            .iter()
            .filter(|session| !session.session_id.is_empty())
            .map(|session| normalize_codex_thread_id(&session.session_id))
            .fold(Vec::<String>::new(), |mut acc, id| {
                if !acc.contains(&id) && acc.len() < 200 {
                    acc.push(id);
                }
                acc
            });
        if thread_ids.is_empty() {
            return json!({"status": "ok", "sort_keys": []});
        }
        let result = (|| -> anyhow::Result<Value> {
            let db = Connection::open(&self.db_path)?;
            if schema_kind(&db)? != Some(SchemaKind::CodexThreads) {
                return Ok(
                    json!({"status": "failed", "message": "Unsupported local storage schema", "sort_keys": []}),
                );
            }
            let mut sort_keys = Vec::new();
            for thread_id in thread_ids {
                if let Some(mut payload) = fetch_thread_timestamp_payload(&db, &thread_id)? {
                    payload.insert("session_id".to_string(), json!(thread_id));
                    sort_keys.push(Value::Object(payload));
                }
            }
            Ok(json!({"status": "ok", "sort_keys": sort_keys}))
        })();
        result.unwrap_or_else(
            |err| json!({"status": "failed", "message": err.to_string(), "sort_keys": []}),
        )
    }

    fn delete_generic_session(
        &self,
        db: &mut Connection,
        session: &SessionRef,
    ) -> anyhow::Result<DeleteResult> {
        let sessions = select_dicts(
            db,
            "SELECT * FROM sessions WHERE id = ?1",
            &[&session.session_id],
        )?;
        if sessions.is_empty() {
            return Ok(failed(
                &session.session_id,
                "Session not found in local storage".to_string(),
            ));
        }
        let messages = if has_table(db, "messages")? {
            select_dicts(
                db,
                "SELECT * FROM messages WHERE session_id = ?1",
                &[&session.session_id],
            )?
        } else {
            Vec::new()
        };
        let token = self.backup_store.write_backup(
            &session.session_id,
            &self.db_path,
            json!({"sessions": sessions, "messages": messages}),
        )?;
        let backup_path = self.backup_store.path_for(&token);
        let delete_result = (|| -> anyhow::Result<()> {
            let tx = db.transaction()?;
            if has_table(&tx, "messages")? {
                tx.execute(
                    "DELETE FROM messages WHERE session_id = ?1",
                    [&session.session_id],
                )?;
            }
            tx.execute("DELETE FROM sessions WHERE id = ?1", [&session.session_id])?;
            tx.commit()?;
            Ok(())
        })();
        if let Err(err) = delete_result {
            return Ok(failed_with_undo(
                &session.session_id,
                err.to_string(),
                &token,
                Some(&backup_path),
            ));
        }
        Ok(local_deleted(&session.session_id, &token, &backup_path))
    }

    fn delete_codex_thread(
        &self,
        db: &mut Connection,
        session: &SessionRef,
    ) -> anyhow::Result<DeleteResult> {
        let thread_id = normalize_codex_thread_id(&session.session_id);
        let thread_rows = select_dicts(db, "SELECT * FROM threads WHERE id = ?1", &[&thread_id])?;
        if thread_rows.is_empty() {
            return Ok(failed(
                &session.session_id,
                "Thread not found in local storage".to_string(),
            ));
        }
        let mut tables = Map::new();
        tables.insert("threads".to_string(), Value::Array(thread_rows));
        backup_related_rows(
            db,
            &mut tables,
            "thread_dynamic_tools",
            "thread_id = ?1",
            &[&thread_id],
        )?;
        backup_related_rows(
            db,
            &mut tables,
            "thread_goals",
            "thread_id = ?1",
            &[&thread_id],
        )?;
        backup_related_rows(
            db,
            &mut tables,
            "thread_spawn_edges",
            "parent_thread_id = ?1 OR child_thread_id = ?1",
            &[&thread_id],
        )?;
        backup_related_rows(
            db,
            &mut tables,
            "stage1_outputs",
            "thread_id = ?1",
            &[&thread_id],
        )?;
        backup_related_rows(
            db,
            &mut tables,
            "agent_job_items",
            "assigned_thread_id = ?1",
            &[&thread_id],
        )?;
        let file_backups = rollout_file_backups(tables.get("threads").and_then(Value::as_array));
        if !file_backups.is_empty() {
            tables.insert("__files".to_string(), Value::Array(file_backups.clone()));
        }
        let token =
            self.backup_store
                .write_backup(&thread_id, &self.db_path, Value::Object(tables))?;
        let backup_path = self.backup_store.path_for(&token);
        let delete_result = (|| -> anyhow::Result<()> {
            let tx = db.transaction()?;
            delete_related_rows(&tx, "thread_dynamic_tools", "thread_id = ?1", &[&thread_id])?;
            delete_related_rows(&tx, "thread_goals", "thread_id = ?1", &[&thread_id])?;
            delete_related_rows(
                &tx,
                "thread_spawn_edges",
                "parent_thread_id = ?1 OR child_thread_id = ?1",
                &[&thread_id],
            )?;
            delete_related_rows(&tx, "stage1_outputs", "thread_id = ?1", &[&thread_id])?;
            if has_table(&tx, "agent_job_items")?
                && has_columns(&tx, "agent_job_items", &["assigned_thread_id"])?
            {
                tx.execute(
                    "UPDATE agent_job_items SET assigned_thread_id = NULL WHERE assigned_thread_id = ?1",
                    [&thread_id],
                )?;
            }
            tx.execute("DELETE FROM threads WHERE id = ?1", [&thread_id])?;
            tx.commit()?;
            Ok(())
        })();
        if let Err(err) = delete_result {
            return Ok(failed_with_undo(
                &thread_id,
                err.to_string(),
                &token,
                Some(&backup_path),
            ));
        }
        let mut file_errors = Vec::new();
        for file in file_backups {
            if let Some(path) = file.get("path").and_then(Value::as_str) {
                if let Err(err) = fs::remove_file(path) {
                    if err.kind() != std::io::ErrorKind::NotFound {
                        file_errors.push(format!("{path}: {err}"));
                    }
                }
            }
        }
        if !file_errors.is_empty() {
            return Ok(DeleteResult {
                status: DeleteStatus::Failed,
                session_id: thread_id,
                message: format!(
                    "本地数据库已删除，但文件删除失败：{}",
                    file_errors.join("; ")
                ),
                undo_token: Some(token.clone()),
                backup_path: Some(backup_path.to_string_lossy().to_string()),
            });
        }
        Ok(local_deleted(&thread_id, &token, &backup_path))
    }
}

fn failed(session_id: &str, message: String) -> DeleteResult {
    DeleteResult {
        status: DeleteStatus::Failed,
        session_id: session_id.to_string(),
        message,
        undo_token: None,
        backup_path: None,
    }
}

fn local_deleted(session_id: &str, token: &str, backup_path: &Path) -> DeleteResult {
    DeleteResult {
        status: DeleteStatus::LocalDeleted,
        session_id: session_id.to_string(),
        message: "已从本地存储删除".to_string(),
        undo_token: Some(token.to_string()),
        backup_path: Some(backup_path.to_string_lossy().to_string()),
    }
}

fn failed_with_undo(
    session_id: &str,
    message: String,
    token: &str,
    backup_path: Option<&Path>,
) -> DeleteResult {
    DeleteResult {
        status: DeleteStatus::Failed,
        session_id: session_id.to_string(),
        message,
        undo_token: Some(token.to_string()),
        backup_path: backup_path.map(|path| path.to_string_lossy().to_string()),
    }
}

fn normalize_codex_thread_id(session_id: &str) -> String {
    session_id
        .strip_prefix("local:")
        .unwrap_or(session_id)
        .to_string()
}

fn schema_kind(db: &Connection) -> anyhow::Result<Option<SchemaKind>> {
    if has_table(db, "sessions")? && has_columns(db, "sessions", &["id", "title"])? {
        if has_table(db, "messages")? && !has_columns(db, "messages", &["session_id"])? {
            return Ok(None);
        }
        return Ok(Some(SchemaKind::GenericSessions));
    }
    if has_table(db, "threads")? && has_columns(db, "threads", &["id", "title", "rollout_path"])? {
        return Ok(Some(SchemaKind::CodexThreads));
    }
    Ok(None)
}

fn has_table(db: &Connection, table: &str) -> anyhow::Result<bool> {
    Ok(db
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |_| Ok(()),
        )
        .is_ok())
}

fn has_columns(db: &Connection, table: &str, columns: &[&str]) -> anyhow::Result<bool> {
    let existing: HashSet<String> = table_columns(db, table)?.into_iter().collect();
    Ok(columns.iter().all(|column| existing.contains(*column)))
}

fn table_columns(db: &Connection, table: &str) -> anyhow::Result<Vec<String>> {
    let mut stmt = db.prepare(&format!(
        "PRAGMA table_info(\"{}\")",
        table.replace('"', "\"\"")
    ))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn list_codex_threads(
    db: &Connection,
    max_threads: usize,
) -> anyhow::Result<Vec<CodexThreadSummary>> {
    let columns: HashSet<String> = table_columns(db, "threads")?.into_iter().collect();
    let title_expr = if columns.contains("title") {
        "COALESCE(title, '') AS title"
    } else {
        "'' AS title"
    };
    let cwd_expr = if columns.contains("cwd") {
        "COALESCE(cwd, '') AS cwd"
    } else {
        "'' AS cwd"
    };
    let archived_expr = if columns.contains("archived") {
        "COALESCE(archived, 0) AS archived"
    } else {
        "0 AS archived"
    };
    let rollout_expr = if columns.contains("rollout_path") {
        "rollout_path"
    } else {
        "NULL AS rollout_path"
    };
    let updated_source = if columns.contains("updated_at_ms") {
        "updated_at_ms".to_string()
    } else if columns.contains("updated_at") {
        "updated_at * 1000".to_string()
    } else if columns.contains("created_at_ms") {
        "created_at_ms".to_string()
    } else {
        "0".to_string()
    };
    let updated_expr = format!("{updated_source} AS updated_at_ms");
    let limit = max_threads.clamp(1, 500) as i64;
    let sql = format!(
        "SELECT id, {title_expr}, {cwd_expr}, {archived_expr}, {rollout_expr}, {updated_expr}
         FROM threads
         ORDER BY {updated_source} DESC
         LIMIT ?1"
    );
    let mut stmt = db.prepare(&sql)?;
    let rows = stmt.query_map([limit], |row| {
        let id: String = row.get(0)?;
        let title: Option<String> = row.get(1)?;
        let cwd: Option<String> = row.get(2)?;
        let archived: i64 = row.get(3)?;
        let rollout_path: Option<String> = row.get(4)?;
        let updated_at_ms: Option<i64> = row.get(5)?;
        Ok(CodexThreadSummary {
            title: title
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| id.clone()),
            id,
            cwd: cwd.unwrap_or_default(),
            archived: archived != 0,
            rollout_path: rollout_path.filter(|value| !value.trim().is_empty()),
            updated_at_ms,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn summarize_projects(threads: &[CodexThreadSummary]) -> Vec<CodexProjectSummary> {
    let mut projects = Vec::<CodexProjectSummary>::new();
    for thread in threads {
        let cwd = thread.cwd.trim();
        if cwd.is_empty() {
            continue;
        }
        if let Some(project) = projects.iter_mut().find(|project| project.cwd == cwd) {
            project.thread_count += 1;
            project.latest_updated_at_ms =
                newest_timestamp(project.latest_updated_at_ms, thread.updated_at_ms);
        } else {
            projects.push(CodexProjectSummary {
                name: project_name_from_cwd(cwd),
                cwd: cwd.to_string(),
                thread_count: 1,
                latest_updated_at_ms: thread.updated_at_ms,
            });
        }
    }
    projects.sort_by(|left, right| {
        right
            .latest_updated_at_ms
            .cmp(&left.latest_updated_at_ms)
            .then_with(|| left.name.cmp(&right.name))
    });
    projects
}

fn summarize_codex_projects(
    threads: &[CodexThreadSummary],
    workspace_state: &CodexWorkspaceState,
) -> Vec<CodexProjectSummary> {
    let mut projects = Vec::new();
    for cwd in &workspace_state.workspace_roots {
        let thread_count = threads
            .iter()
            .filter(|thread| same_cwd(&thread.cwd, cwd))
            .count();
        let latest_updated_at_ms = threads
            .iter()
            .filter(|thread| same_cwd(&thread.cwd, cwd))
            .filter_map(|thread| thread.updated_at_ms)
            .max();
        projects.push(CodexProjectSummary {
            name: workspace_state
                .workspace_labels
                .get(&normalize_cwd_key(cwd))
                .cloned()
                .unwrap_or_else(|| project_name_from_cwd(cwd)),
            cwd: cwd.clone(),
            thread_count,
            latest_updated_at_ms,
        });
    }
    let projectless_count = threads
        .iter()
        .filter(|thread| thread.cwd.trim().is_empty())
        .count();
    if projectless_count > 0 || !workspace_state.projectless_thread_ids.is_empty() {
        let latest_updated_at_ms = threads
            .iter()
            .filter(|thread| thread.cwd.trim().is_empty())
            .filter_map(|thread| thread.updated_at_ms)
            .max();
        projects.push(CodexProjectSummary {
            name: "无项目对话".to_string(),
            cwd: String::new(),
            thread_count: projectless_count,
            latest_updated_at_ms,
        });
    }
    projects
}

fn newest_timestamp(left: Option<i64>, right: Option<i64>) -> Option<i64> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn project_name_from_cwd(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| cwd.to_string())
}

fn default_codex_global_state_path() -> PathBuf {
    directories::BaseDirs::new()
        .map(|dirs| {
            dirs.home_dir()
                .join(".codex")
                .join(".codex-global-state.json")
        })
        .unwrap_or_else(|| PathBuf::from(".codex").join(".codex-global-state.json"))
}

fn load_codex_workspace_state(path: &Path) -> CodexWorkspaceState {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(_) => return CodexWorkspaceState::default(),
    };
    let value: Value = match serde_json::from_str(&contents) {
        Ok(value) => value,
        Err(_) => return CodexWorkspaceState::default(),
    };
    let mut roots = string_array(value.get("project-order"));
    for root in string_array(value.get("electron-saved-workspace-roots")) {
        push_unique_cwd(&mut roots, root);
    }
    let labels = value
        .get("electron-workspace-root-labels")
        .and_then(Value::as_object)
        .map(|labels| {
            labels
                .iter()
                .filter_map(|(cwd, label)| {
                    label
                        .as_str()
                        .map(|label| (normalize_cwd_key(cwd), label.to_string()))
                })
                .collect()
        })
        .unwrap_or_default();
    CodexWorkspaceState {
        workspace_roots: roots,
        workspace_labels: labels,
        projectless_thread_ids: string_array(value.get("projectless-thread-ids"))
            .into_iter()
            .collect(),
    }
}

fn normalize_projectless_threads(
    threads: &mut [CodexThreadSummary],
    projectless_thread_ids: &HashSet<String>,
) {
    for thread in threads {
        if projectless_thread_ids.contains(thread.id.as_str()) {
            thread.cwd.clear();
        }
    }
}

fn string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn push_unique_cwd(values: &mut Vec<String>, value: String) {
    let key = normalize_cwd_key(&value);
    if values.iter().any(|item| normalize_cwd_key(item) == key) {
        return;
    }
    values.push(value);
}

fn same_cwd(left: &str, right: &str) -> bool {
    normalize_cwd_key(left) == normalize_cwd_key(right)
}

fn normalize_cwd_key(value: &str) -> String {
    value.trim().replace('\\', "/").to_lowercase()
}

fn select_dicts(db: &Connection, sql: &str, params: &[&dyn ToSql]) -> anyhow::Result<Vec<Value>> {
    let mut stmt = db.prepare(sql)?;
    let columns: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|name| name.to_string())
        .collect();
    let rows = stmt.query_map(params, |row| {
        let mut data = Map::new();
        for (index, column) in columns.iter().enumerate() {
            data.insert(column.clone(), sql_value_to_json(row.get_ref(index)?));
        }
        Ok(Value::Object(data))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn validate_restore_tables(tables: &Map<String, Value>) -> anyhow::Result<()> {
    let allowed = [
        "sessions",
        "messages",
        "threads",
        "thread_dynamic_tools",
        "thread_goals",
        "thread_spawn_edges",
        "stage1_outputs",
        "agent_job_items",
        "__files",
    ];
    for table in tables.keys() {
        if !allowed.contains(&table.as_str()) {
            anyhow::bail!("unknown restore table: {table}");
        }
    }
    Ok(())
}

fn detect_restore_conflicts(db: &Connection, tables: &Map<String, Value>) -> anyhow::Result<()> {
    for (table, rows) in tables {
        if table.starts_with("__") {
            continue;
        }
        let Some(rows) = rows.as_array() else {
            continue;
        };
        for row in rows {
            let Some(row) = row.as_object() else {
                continue;
            };
            if restore_row_conflicts(db, table, row)? {
                anyhow::bail!("restore conflict: {table} row already exists");
            }
        }
    }
    Ok(())
}

fn restore_row_conflicts(
    db: &Connection,
    table: &str,
    row: &Map<String, Value>,
) -> anyhow::Result<bool> {
    let key_columns = restore_conflict_key_columns(table, row);
    if key_columns.is_empty() || !has_table(db, table)? {
        return Ok(false);
    }
    let where_clause = key_columns
        .iter()
        .enumerate()
        .map(|(index, column)| format!("\"{}\" = ?{}", column.replace('"', "\"\""), index + 1))
        .collect::<Vec<_>>()
        .join(" AND ");
    let values = key_columns
        .iter()
        .map(|column| OwnedSqlValue(json_to_sql_value(&row[*column])))
        .collect::<Vec<_>>();
    let refs = values
        .iter()
        .map(|value| value as &dyn ToSql)
        .collect::<Vec<_>>();
    Ok(db
        .query_row(
            &format!("SELECT 1 FROM \"{table}\" WHERE {where_clause} LIMIT 1"),
            refs.as_slice(),
            |_| Ok(()),
        )
        .is_ok())
}

fn restore_conflict_key_columns<'a>(table: &str, row: &'a Map<String, Value>) -> Vec<&'a String> {
    let wanted: &[&str] = match table {
        "sessions" | "threads" => &["id"],
        "messages" => &["id"],
        "thread_dynamic_tools" => &["thread_id", "tool_name"],
        "thread_goals" => &["thread_id", "goal"],
        "thread_spawn_edges" => &["parent_thread_id", "child_thread_id"],
        "stage1_outputs" => &["thread_id"],
        _ => &[],
    };
    let keys = wanted
        .iter()
        .filter_map(|column| row.get_key_value(*column).map(|(key, _)| key))
        .collect::<Vec<_>>();
    if table == "messages" && keys.is_empty() {
        row.get_key_value("session_id")
            .map(|(key, _)| vec![key])
            .unwrap_or_default()
    } else {
        keys
    }
}

fn detect_file_restore_conflicts(tables: &Map<String, Value>) -> anyhow::Result<()> {
    let Some(files) = tables.get("__files").and_then(Value::as_array) else {
        return Ok(());
    };
    for file in files {
        if let Some(path) = file.get("path").and_then(Value::as_str) {
            if Path::new(path).exists() {
                anyhow::bail!("restore conflict: file already exists: {path}");
            }
        }
    }
    Ok(())
}

fn insert_row(db: &Connection, table: &str, row: &Map<String, Value>) -> anyhow::Result<()> {
    let columns: Vec<&String> = row.keys().collect();
    if columns.is_empty() {
        return Ok(());
    }
    let quoted = columns
        .iter()
        .map(|column| format!("\"{}\"", column.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(", ");
    let marks = (0..columns.len())
        .map(|index| format!("?{}", index + 1))
        .collect::<Vec<_>>()
        .join(", ");
    let values = columns
        .iter()
        .map(|column| OwnedSqlValue(json_to_sql_value(&row[*column])))
        .collect::<Vec<_>>();
    let refs = values
        .iter()
        .map(|value| value as &dyn ToSql)
        .collect::<Vec<_>>();
    db.execute(
        &format!("INSERT INTO \"{table}\" ({quoted}) VALUES ({marks})"),
        refs.as_slice(),
    )?;
    Ok(())
}

fn update_existing_agent_job_item(
    db: &Connection,
    row: &Map<String, Value>,
) -> anyhow::Result<bool> {
    let Some(id) = row.get("id") else {
        return Ok(false);
    };
    if !row.contains_key("assigned_thread_id") || !has_table(db, "agent_job_items")? {
        return Ok(false);
    }
    let id_value = OwnedSqlValue(json_to_sql_value(id));
    let current_assignment = db.query_row(
        "SELECT assigned_thread_id FROM agent_job_items WHERE id = ?1 LIMIT 1",
        [&id_value as &dyn ToSql],
        |row| row.get::<_, Option<String>>(0),
    );
    let current_assignment = match current_assignment {
        Ok(value) => value,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(false),
        Err(err) => return Err(err.into()),
    };
    if current_assignment.is_some() {
        anyhow::bail!("restore conflict: agent_job_items row already assigned");
    }
    let assigned = OwnedSqlValue(json_to_sql_value(&row["assigned_thread_id"]));
    db.execute(
        "UPDATE agent_job_items SET assigned_thread_id = ?1 WHERE id = ?2 AND assigned_thread_id IS NULL",
        [&assigned as &dyn ToSql, &id_value as &dyn ToSql],
    )?;
    Ok(true)
}

fn backup_related_rows(
    db: &Connection,
    tables: &mut Map<String, Value>,
    table: &str,
    where_clause: &str,
    params: &[&dyn ToSql],
) -> anyhow::Result<()> {
    if has_table(db, table)? {
        let rows = select_dicts(
            db,
            &format!("SELECT * FROM \"{table}\" WHERE {where_clause}"),
            params,
        )?;
        tables.insert(table.to_string(), Value::Array(rows));
    }
    Ok(())
}

fn delete_related_rows(
    db: &Connection,
    table: &str,
    where_clause: &str,
    params: &[&dyn ToSql],
) -> anyhow::Result<()> {
    if has_table(db, table)? {
        db.execute(
            &format!("DELETE FROM \"{table}\" WHERE {where_clause}"),
            params,
        )?;
    }
    Ok(())
}

fn rollout_file_backups(thread_rows: Option<&Vec<Value>>) -> Vec<Value> {
    thread_rows
        .into_iter()
        .flatten()
        .filter_map(|row| row.get("rollout_path").and_then(Value::as_str))
        .filter_map(|path| {
            let bytes = fs::read(path).ok()?;
            Some(json!({
                "path": path,
                "content_b64": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes),
            }))
        })
        .collect()
}

fn update_rollout_session_meta_cwd(
    rollout_path: &str,
    thread_id: &str,
    target_cwd: &str,
) -> (bool, String) {
    if rollout_path.is_empty() || !Path::new(rollout_path).is_file() {
        return (false, String::new());
    }
    let result = (|| -> anyhow::Result<bool> {
        let text = fs::read_to_string(rollout_path)?;
        let mut changed = false;
        let mut output = String::new();
        for line in text.split_inclusive('\n') {
            let (body, end) = line
                .strip_suffix('\n')
                .map_or((line, ""), |body| (body, "\n"));
            let mut raw = line.to_string();
            if let Ok(mut item) = serde_json::from_str::<Value>(body) {
                if item.get("type") == Some(&json!("session_meta"))
                    && item["payload"]["id"] == thread_id
                    && item["payload"]["cwd"] != target_cwd
                {
                    if let Some(payload) = item.get_mut("payload").and_then(Value::as_object_mut) {
                        payload.insert("cwd".to_string(), json!(target_cwd));
                        raw = serde_json::to_string(&item)? + end;
                        changed = true;
                    }
                }
            }
            output.push_str(&raw);
        }
        if changed {
            fs::write(rollout_path, output)?;
        }
        Ok(changed)
    })();
    match result {
        Ok(changed) => (changed, String::new()),
        Err(err) => (false, err.to_string()),
    }
}

fn codex_thread_timestamp_columns(db: &Connection) -> anyhow::Result<Vec<String>> {
    let existing: HashSet<String> = table_columns(db, "threads")?.into_iter().collect();
    Ok(["updated_at", "updated_at_ms", "created_at_ms"]
        .iter()
        .filter(|column| existing.contains(**column))
        .map(|column| column.to_string())
        .collect())
}

fn fetch_thread_timestamp_payload(
    db: &Connection,
    thread_id: &str,
) -> anyhow::Result<Option<Map<String, Value>>> {
    let timestamp_columns = codex_thread_timestamp_columns(db)?;
    let mut columns = vec!["id".to_string()];
    columns.extend(timestamp_columns);
    let sql = format!("SELECT {} FROM threads WHERE id = ?1", columns.join(", "));
    let mut stmt = db.prepare(&sql)?;
    let row = stmt.query_row([thread_id], |row| {
        let mut selected = Map::new();
        for (index, column) in columns.iter().enumerate() {
            selected.insert(column.clone(), sql_value_to_json(row.get_ref(index)?));
        }
        Ok(selected)
    });
    match row {
        Ok(row) => {
            let mut payload = Map::new();
            add_timestamp_payload(&mut payload, &row);
            Ok(Some(payload))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(err) => Err(err.into()),
    }
}

fn add_timestamp_payload(payload: &mut Map<String, Value>, row: &Map<String, Value>) {
    for column in ["updated_at", "updated_at_ms", "created_at_ms"] {
        payload.insert(
            column.to_string(),
            row.get(column).cloned().unwrap_or(Value::Null),
        );
    }
}

fn sql_value_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(value) => json!(value),
        ValueRef::Real(value) => json!(value),
        ValueRef::Text(value) => json!(String::from_utf8_lossy(value).to_string()),
        ValueRef::Blob(value) => json!(base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            value
        )),
    }
}

fn json_to_sql_value(value: &Value) -> SqlValue {
    match value {
        Value::Null => SqlValue::Null,
        Value::Bool(value) => SqlValue::Integer(i64::from(*value)),
        Value::Number(number) => {
            if let Some(value) = number.as_i64() {
                SqlValue::Integer(value)
            } else if let Some(value) = number.as_f64() {
                SqlValue::Real(value)
            } else {
                SqlValue::Text(number.to_string())
            }
        }
        Value::String(value) => SqlValue::Text(value.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_projects_follow_saved_workspace_order() {
        let threads = vec![
            thread("1", "D:\\temp\\files-mentioned-by-the-user-png", 1),
            thread("2", "D:\\Skye\\codex-enhance", 5),
            thread("3", "D:\\Skye\\Meta", 10),
        ];
        let state = CodexWorkspaceState {
            workspace_roots: vec![
                "D:\\Skye\\Meta".to_string(),
                "D:\\Skye\\codex-enhance".to_string(),
            ],
            workspace_labels: HashMap::new(),
            projectless_thread_ids: HashSet::new(),
        };

        let projects = summarize_codex_projects(&threads, &state);

        assert_eq!(
            projects
                .iter()
                .map(|project| project.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Meta", "codex-enhance"]
        );
    }

    #[test]
    fn workspace_labels_override_path_names() {
        let mut labels = HashMap::new();
        labels.insert(
            normalize_cwd_key("D:\\APP\\clawd-on-desk"),
            "桌宠".to_string(),
        );
        let state = CodexWorkspaceState {
            workspace_roots: vec!["D:\\APP\\clawd-on-desk".to_string()],
            workspace_labels: labels,
            projectless_thread_ids: HashSet::new(),
        };

        let projects = summarize_codex_projects(&[], &state);

        assert_eq!(projects[0].name, "桌宠");
    }

    #[test]
    fn projectless_threads_are_grouped_as_empty_cwd() {
        let mut threads = vec![
            thread("projectless", "D:\\ghost", 1),
            thread("normal", "D:\\Skye\\Meta", 2),
        ];
        let state = CodexWorkspaceState {
            workspace_roots: vec!["D:\\Skye\\Meta".to_string()],
            workspace_labels: HashMap::new(),
            projectless_thread_ids: HashSet::from(["projectless".to_string()]),
        };

        normalize_projectless_threads(&mut threads, &state.projectless_thread_ids);
        let projects = summarize_codex_projects(&threads, &state);

        assert!(
            projects
                .iter()
                .any(|project| project.name == "无项目对话" && project.cwd.is_empty())
        );
    }

    fn thread(id: &str, cwd: &str, updated_at_ms: i64) -> CodexThreadSummary {
        CodexThreadSummary {
            id: id.to_string(),
            title: id.to_string(),
            cwd: cwd.to_string(),
            archived: false,
            rollout_path: None,
            updated_at_ms: Some(updated_at_ms),
        }
    }
}
