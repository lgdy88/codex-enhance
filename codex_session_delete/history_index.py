from __future__ import annotations

import json
import shutil
import sqlite3
import time
from collections import Counter
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

from codex_session_delete.provider_sync import (
    ProviderSyncResult,
    ProviderSyncStatus,
    collect_session_changes,
    count_global_state_updates,
    count_sqlite_path_updates,
    count_sqlite_updates,
    default_codex_home,
    prune_backups,
    read_current_provider,
    rollout_files,
    table_columns,
    to_desktop_workspace_path,
)


STATE_DB_FILES = ("state_5.sqlite", "state_5.sqlite-wal", "state_5.sqlite-shm")
HISTORY_INDEX_MANAGER = "Codex++ history doctor"


@dataclass(frozen=True)
class ThreadRecord:
    session_id: str
    title: str
    cwd: str
    model_provider: str
    source: str
    updated_at_ms: int = 0
    updated_at: object = None
    created_at_ms: object = None

    def sort_ms(self) -> int:
        return int(self.updated_at_ms or numeric_timestamp(self.updated_at) or numeric_timestamp(self.created_at_ms) or 0)

    def to_payload(self) -> dict[str, object]:
        return {
            "session_id": self.session_id,
            "title": self.title or "Untitled",
            "cwd": self.cwd,
            "model_provider": self.model_provider,
            "source": self.source,
            "updated_at": self.updated_at,
            "updated_at_ms": self.updated_at_ms,
            "created_at_ms": self.created_at_ms,
        }


class StateDbReader:
    def __init__(self, db_path: Path):
        self.db_path = db_path

    def health(self) -> dict[str, object]:
        if not self.db_path.exists():
            return {"status": "missing", "path": str(self.db_path), "quick_check": "missing", "schema": self.empty_schema()}
        try:
            with closing(self._connect()) as con:
                return {
                    "status": "ok",
                    "path": str(self.db_path),
                    "quick_check": self.quick_check(con),
                    "schema": self.schema(con),
                }
        except sqlite3.DatabaseError as exc:
            return {"status": "corrupt", "path": str(self.db_path), "quick_check": "failed", "schema": self.empty_schema(), "error": str(exc)}
        except OSError as exc:
            return {"status": "unavailable", "path": str(self.db_path), "quick_check": "failed", "schema": self.empty_schema(), "error": str(exc)}

    def quick_check(self, con: sqlite3.Connection) -> str:
        try:
            row = con.execute("PRAGMA quick_check").fetchone()
        except sqlite3.DatabaseError as exc:
            return f"failed: {exc}"
        return str(row[0] if row else "unknown")

    def schema(self, con: sqlite3.Connection) -> dict[str, object]:
        tables = sorted(row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'"))
        thread_columns = sorted(table_columns(con, "threads")) if "threads" in tables else []
        missing = [name for name in ("id", "cwd") if name not in thread_columns]
        status = "ok" if "threads" in tables and not missing else "unsupported"
        return {"status": status, "tables": tables, "thread_columns": thread_columns, "missing_thread_columns": missing}

    def project_threads(self, project_cwd: str, limit: int = 30, cursor: str | None = None) -> dict[str, object]:
        project = project_cwd.strip()
        if not project:
            return failed_project_threads("项目路径为空", source="sqlite")
        if not self.db_path.exists():
            return failed_project_threads(f"Database not found: {self.db_path}", source="sqlite")
        try:
            with closing(self._connect()) as con:
                con.row_factory = sqlite3.Row
                health = self.health()
                if health.get("quick_check") != "ok":
                    return failed_project_threads(str(health.get("error") or health.get("quick_check")), source="sqlite")
                schema = health.get("schema", {})
                if not isinstance(schema, dict) or schema.get("status") != "ok":
                    return failed_project_threads("Unsupported local storage schema", source="sqlite")
                bounded_limit = max(1, min(int(limit or 30), 100))
                offset = decode_cursor(cursor)
                rows = self._project_thread_rows(con, project, bounded_limit + 1, offset)
                match_kind = "project"
                if not rows:
                    parent = parent_workspace_path(project)
                    rows = self._project_thread_rows(con, parent, bounded_limit + 1, offset) if parent else []
                    match_kind = "parent" if rows else "project"
                return project_page(project, "sqlite", match_kind, [self._row_record(row) for row in rows], bounded_limit, offset)
        except (sqlite3.DatabaseError, OSError) as exc:
            return failed_project_threads(str(exc), source="sqlite")

    def stats(self, current_provider: str, project_cwd: str | None) -> dict[str, object]:
        if not self.db_path.exists():
            return empty_sqlite_stats()
        try:
            with closing(self._connect()) as con:
                con.row_factory = sqlite3.Row
                health = self.health()
                if health.get("quick_check") != "ok":
                    result = empty_sqlite_stats()
                    result.update({"quick_check": health.get("quick_check"), "schema": health.get("schema"), "error": health.get("error", "")})
                    return result
                tables = set(health.get("schema", {}).get("tables", [])) if isinstance(health.get("schema"), dict) else set()
                if "threads" not in tables:
                    return empty_sqlite_stats()
                columns = table_columns(con, "threads")
                rows = self.recent_rows(con, columns, 50)
                project_rows = self.project_rows(con, columns, project_cwd) if project_cwd else []
                result = {
                    "threads": int(con.execute("SELECT COUNT(*) FROM threads").fetchone()[0]),
                    "provider_distribution": self.provider_distribution(con, columns),
                    "escaped_cwd_count": self.escaped_cwd_count(con, columns),
                    "recent50": row_summary(rows, current_provider, project_cwd),
                    "project_visible": project_summary(project_rows, current_provider),
                    "quick_check": health.get("quick_check"),
                    "schema": health.get("schema"),
                }
                return result
        except (sqlite3.DatabaseError, OSError) as exc:
            result = empty_sqlite_stats()
            result.update({"quick_check": "failed", "error": str(exc), "schema": self.empty_schema()})
            return result

    def _connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.db_path)
        con.execute("PRAGMA query_only = ON")
        return con

    def _project_thread_rows(self, con: sqlite3.Connection, root: str | None, limit: int, offset: int) -> list[sqlite3.Row]:
        if not root:
            return []
        columns = table_columns(con, "threads")
        select_columns = [column for column in ("id", "title", "cwd", "updated_at", "updated_at_ms", "created_at_ms", "source", "model_provider") if column in columns]
        where_sql, params = workspace_scope_clause(root)
        filters = [f"({where_sql})"]
        if "archived" in columns:
            filters.append("COALESCE(archived, 0) = 0")
        if "has_user_event" in columns:
            filters.append("COALESCE(has_user_event, 0) = 1")
        if "thread_source" in columns:
            filters.append("COALESCE(thread_source, '') <> 'subagent'")
        order_sql = order_sql_for_columns(columns)
        return con.execute(
            f"SELECT {', '.join(select_columns)} FROM threads WHERE {' AND '.join(filters)} ORDER BY {order_sql} LIMIT ? OFFSET ?",
            (*params, limit, max(0, offset)),
        ).fetchall()

    def _row_record(self, row: sqlite3.Row) -> ThreadRecord:
        keys = set(row.keys())
        return ThreadRecord(
            session_id=str(row["id"]),
            title=str(row["title"] or "Untitled") if "title" in keys else "Untitled",
            cwd=str(row["cwd"] or "") if "cwd" in keys else "",
            model_provider=str(row["model_provider"] or "unknown") if "model_provider" in keys else "unknown",
            source="sqlite",
            updated_at_ms=int(row["updated_at_ms"] or 0) if "updated_at_ms" in keys and row["updated_at_ms"] is not None else 0,
            updated_at=row["updated_at"] if "updated_at" in keys else None,
            created_at_ms=row["created_at_ms"] if "created_at_ms" in keys else None,
        )

    def recent_rows(self, con: sqlite3.Connection, columns: set[str], limit: int) -> list[sqlite3.Row]:
        select_columns = [column for column in ("id", "cwd", "model_provider", "updated_at_ms", "updated_at", "created_at_ms") if column in columns]
        if not select_columns:
            return []
        filters = []
        if "archived" in columns:
            filters.append("COALESCE(archived, 0) = 0")
        if "has_user_event" in columns:
            filters.append("COALESCE(has_user_event, 0) = 1")
        if "thread_source" in columns:
            filters.append("COALESCE(thread_source, '') <> 'subagent'")
        where_sql = " WHERE " + " AND ".join(filters) if filters else ""
        return con.execute(f"SELECT {', '.join(select_columns)} FROM threads{where_sql} ORDER BY {order_sql_for_columns(columns)} LIMIT ?", (limit,)).fetchall()

    def project_rows(self, con: sqlite3.Connection, columns: set[str], project_cwd: str | None) -> list[sqlite3.Row]:
        rows = self.recent_rows(con, columns, 1000)
        return [row for row in rows if workspace_contains(project_cwd, row["cwd"] if "cwd" in row.keys() else "")]

    def provider_distribution(self, con: sqlite3.Connection, columns: set[str]) -> dict[str, int]:
        if "model_provider" not in columns:
            return {}
        rows = con.execute("SELECT COALESCE(model_provider, 'unknown') AS provider, COUNT(*) FROM threads GROUP BY provider").fetchall()
        return {str(row[0] or "unknown"): int(row[1]) for row in rows}

    def escaped_cwd_count(self, con: sqlite3.Connection, columns: set[str]) -> int:
        if "cwd" not in columns:
            return 0
        return sum(1 for row in con.execute("SELECT cwd FROM threads WHERE cwd IS NOT NULL AND cwd <> ''") if path_needs_desktop_repair(str(row[0] or "")))

    def empty_schema(self) -> dict[str, object]:
        return {"status": "missing", "tables": [], "thread_columns": [], "missing_thread_columns": ["id", "cwd"]}


class RolloutReader:
    def __init__(self, codex_home: Path):
        self.codex_home = codex_home

    def records(self) -> list[ThreadRecord]:
        records: list[ThreadRecord] = []
        for path in rollout_files(self.codex_home) if self.codex_home.exists() else []:
            record = self._record_from_file(path, require_user_event=True)
            if record is not None:
                records.append(record)
        return records

    def project_threads(self, project_cwd: str, limit: int = 30, cursor: str | None = None) -> dict[str, object]:
        project = project_cwd.strip()
        if not project:
            return failed_project_threads("项目路径为空", source="rollout-jsonl")
        bounded_limit = max(1, min(int(limit or 30), 100))
        offset = decode_cursor(cursor)
        rows = [record for record in self.records() if workspace_contains(project, record.cwd)]
        match_kind = "project"
        if not rows:
            parent = parent_workspace_path(project)
            rows = [record for record in self.records() if workspace_contains(parent, record.cwd)] if parent else []
            match_kind = "parent" if rows else "project"
        rows.sort(key=lambda record: (record.sort_ms(), record.session_id), reverse=True)
        return project_page(project, "rollout-jsonl", match_kind, rows[offset: offset + bounded_limit + 1], bounded_limit, offset)

    def stats(self) -> dict[str, object]:
        files = rollout_files(self.codex_home) if self.codex_home.exists() else []
        records = [record for path in files for record in [self._record_from_file(path, require_user_event=False)] if record is not None]
        provider_counts = Counter(record.model_provider or "unknown" for record in records)
        if len(records) < len(files):
            provider_counts["unknown"] += len(files) - len(records)
        escaped_count = sum(1 for path in files if rollout_cwd_needs_repair(path))
        encrypted_count = 0
        for path in files:
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                text = ""
            if '"encrypted_content"' in text:
                encrypted_count += 1
        return {
            "files": len(files),
            "provider_distribution": dict(sorted(provider_counts.items())),
            "escaped_cwd_count": escaped_count,
            "encrypted_content_files": encrypted_count,
        }

    def _record_from_file(self, path: Path, *, require_user_event: bool) -> ThreadRecord | None:
        try:
            text = path.read_text(encoding="utf-8")
            first_line, rest = split_first_line(text)
            raw = json.loads(first_line)
        except (OSError, json.JSONDecodeError):
            return None
        payload = raw.get("payload") if isinstance(raw, dict) else None
        if not isinstance(payload, dict):
            return None
        thread_id = payload.get("id")
        if not isinstance(thread_id, str) or not thread_id:
            return None
        if require_user_event and "archived_sessions" in {part.lower() for part in path.parts}:
            return None
        if require_user_event and '"user_message"' not in rest and '"user_input"' not in rest:
            return None
        try:
            stat_mtime = path.stat().st_mtime
        except OSError:
            stat_mtime = 0
        return ThreadRecord(
            session_id=thread_id,
            title=str(payload.get("title") or payload.get("name") or "Untitled"),
            cwd=to_desktop_workspace_path(payload.get("cwd") if isinstance(payload.get("cwd"), str) else "") or "",
            model_provider=str(payload.get("model_provider") or "unknown"),
            source="rollout-jsonl",
            updated_at_ms=int(numeric_timestamp(payload.get("updated_at_ms")) or numeric_timestamp(payload.get("created_at_ms")) or stat_mtime * 1000),
            updated_at=payload.get("updated_at"),
            created_at_ms=payload.get("created_at_ms"),
        )


class GlobalStateStore:
    def __init__(self, path: Path):
        self.path = path

    def snapshot(self) -> dict[str, object]:
        if not self.path.exists():
            return {"status": "missing", "path": str(self.path), "path_repair_count": 0, "keys": []}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            return {"status": "failed", "path": str(self.path), "path_repair_count": 0, "keys": [], "error": str(exc)}
        keys = sorted(data.keys()) if isinstance(data, dict) else []
        return {"status": "ok", "path": str(self.path), "path_repair_count": count_global_state_updates(self.path), "keys": keys}


class RepairPlanner:
    def __init__(self, codex_home: Path | None = None):
        self.codex_home = codex_home or default_codex_home()

    def diagnostics(self, project_cwd: str | None = None) -> dict[str, object]:
        current_provider = read_current_provider(self.codex_home / "config.toml")
        state_reader = StateDbReader(self.codex_home / "state_5.sqlite")
        state_health = state_reader.health()
        rollout_reader = RolloutReader(self.codex_home)
        rollout_stats = rollout_reader.stats()
        sqlite_stats = state_reader.stats(current_provider, project_cwd)
        path_counts = self.path_repair_counts(rollout_stats)
        provider_counts = self.provider_converge_counts(current_provider)
        return {
            "state_db": state_health,
            "rollout": rollout_stats,
            "sqlite": sqlite_stats,
            "global_state": GlobalStateStore(self.codex_home / ".codex-global-state.json").snapshot(),
            "path_repair_pending": path_counts,
            "provider_converge_pending": provider_counts,
            "repair_plan": self.plan(state_health, path_counts, provider_counts),
        }

    def path_repair_counts(self, rollout_stats: dict[str, object]) -> dict[str, int]:
        return {
            "rollout_cwd_count": int(rollout_stats.get("escaped_cwd_count", 0) or 0),
            "sqlite_cwd_count": safe_count(lambda: count_sqlite_path_updates(self.codex_home / "state_5.sqlite")),
            "global_state_count": safe_count(lambda: count_global_state_updates(self.codex_home / ".codex-global-state.json")),
        }

    def provider_converge_counts(self, current_provider: str) -> dict[str, int]:
        if not self.codex_home.exists():
            return {"rollout_files": 0, "sqlite_rows": 0}
        changes = collect_session_changes(self.codex_home, current_provider)
        thread_ids = {change.thread_id for change in changes if change.thread_id and change.has_user_event}
        return {
            "rollout_files": sum(1 for change in changes if change.provider_rewrite_needed),
            "sqlite_rows": safe_count(lambda: count_sqlite_updates(self.codex_home / "state_5.sqlite", current_provider, thread_ids)),
        }

    def plan(self, state_health: dict[str, object], path_counts: dict[str, int], provider_counts: dict[str, int]) -> list[dict[str, object]]:
        steps: list[dict[str, object]] = []
        if any(path_counts.values()):
            steps.append({"id": "provider.repair_paths", "kind": "mutation", "writes": True, "reason": "发现等价 Windows 路径格式不一致", "counts": path_counts})
        if any(provider_counts.values()):
            steps.append({"id": "provider.converge", "kind": "dangerous", "writes": True, "reason": "发现 provider metadata 与当前 model_provider 不一致", "counts": provider_counts})
        schema = state_health.get("schema") if isinstance(state_health.get("schema"), dict) else {}
        if state_health.get("status") == "corrupt" or state_health.get("quick_check") not in {"ok", "missing"} or schema.get("status") == "unsupported":
            steps.append({"id": "state.quarantine", "kind": "dangerous", "writes": True, "reason": "state_5.sqlite quick_check 或 schema 检测未通过"})
        if not steps:
            steps.append({"id": "history.readonly", "kind": "read", "writes": False, "reason": "当前诊断未发现需要自动写入的修复项"})
        return steps


class HistoryIndex:
    def __init__(self, codex_home: Path | None = None):
        self.codex_home = codex_home or default_codex_home()
        self.state_reader = StateDbReader(self.codex_home / "state_5.sqlite")
        self.rollout_reader = RolloutReader(self.codex_home)

    def project_threads(self, project_cwd: str, limit: int = 30, cursor: str | None = None) -> dict[str, object]:
        sqlite_result = self.state_reader.project_threads(project_cwd, limit, cursor)
        if sqlite_result.get("status") == "ok" and sqlite_result.get("threads") and sqlite_result.get("match_kind") == "project":
            return sqlite_result
        fallback = self.rollout_reader.project_threads(project_cwd, limit, cursor)
        if fallback.get("status") == "ok" and fallback.get("threads") and fallback.get("match_kind") == "project":
            fallback["fallback_reason"] = sqlite_result.get("message", "SQLite bridge returned no project threads")
            fallback["sqlite_status"] = sqlite_result
            return fallback
        if sqlite_result.get("status") == "ok" and sqlite_result.get("threads"):
            return sqlite_result
        if fallback.get("status") == "ok" and fallback.get("threads"):
            fallback["fallback_reason"] = sqlite_result.get("message", "SQLite bridge unavailable")
            fallback["sqlite_status"] = sqlite_result
            return fallback
        return sqlite_result if sqlite_result.get("status") == "ok" else fallback


def quarantine_state_db(codex_home: Path | None = None) -> ProviderSyncResult:
    home = codex_home or default_codex_home()
    current_provider = read_current_provider(home / "config.toml")
    if not home.exists():
        return ProviderSyncResult(ProviderSyncStatus.SKIPPED, f"Codex home not found: {home}", current_provider)
    present = [home / name for name in STATE_DB_FILES if (home / name).exists()]
    if not present:
        return ProviderSyncResult(ProviderSyncStatus.SKIPPED, "No state_5.sqlite files to quarantine", current_provider)
    backup_dir = create_history_backup(home, current_provider, "Codex++ state DB quarantine")
    quarantine_dir = backup_dir / "quarantine"
    quarantine_dir.mkdir(exist_ok=True)
    try:
        for source in present:
            shutil.move(str(source), str(quarantine_dir / source.name))
    except OSError as exc:
        return ProviderSyncResult(ProviderSyncStatus.SKIPPED, f"State DB quarantine skipped: {exc}", current_provider, backup_dir)
    prune_backups(home)
    return ProviderSyncResult(ProviderSyncStatus.SYNCED, "State DB quarantined; restart Codex to rebuild local index.", current_provider, backup_dir, sqlite_rows_updated=len(present))


def create_history_backup(home: Path, target_provider: str, operation: str) -> Path:
    backup_root = home / "backups_state" / "provider-sync"
    backup_dir = backup_root / time.strftime("%Y%m%d%H%M%S")
    suffix = 0
    while backup_dir.exists():
        suffix += 1
        backup_dir = backup_root / f"{time.strftime('%Y%m%d%H%M%S')}-{suffix}"
    backup_dir.mkdir(parents=True)
    for name in ("config.toml", ".codex-global-state.json", ".codex-global-state.json.bak", *STATE_DB_FILES):
        source = home / name
        if source.exists():
            target_dir = backup_dir / "db" if name in STATE_DB_FILES else backup_dir
            target_dir.mkdir(exist_ok=True)
            shutil.copy2(source, target_dir / name)
    (backup_dir / "metadata.json").write_text(
        json.dumps({"managedBy": operation, "targetProvider": target_provider}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return backup_dir


def split_first_line(text: str) -> tuple[str, str]:
    if "\n" not in text:
        return text, ""
    first, rest = text.split("\n", 1)
    return first, "\n" + rest


def rollout_cwd_needs_repair(path: Path) -> bool:
    try:
        first_line = path.read_text(encoding="utf-8").split("\n", 1)[0]
        record = json.loads(first_line)
    except (OSError, json.JSONDecodeError):
        return False
    payload = record.get("payload") if isinstance(record, dict) else None
    cwd = payload.get("cwd") if isinstance(payload, dict) else None
    return path_needs_desktop_repair(cwd if isinstance(cwd, str) else None)


def empty_sqlite_stats() -> dict[str, object]:
    return {
        "threads": 0,
        "provider_distribution": {},
        "escaped_cwd_count": 0,
        "recent50": {"total": 0, "current_provider_count": 0, "provider_distribution": {}, "project_match_count": 0},
        "project_visible": {"total": 0, "current_provider_count": 0, "provider_distribution": {}},
        "quick_check": "missing",
        "schema": {"status": "missing", "tables": [], "thread_columns": [], "missing_thread_columns": ["id", "cwd"]},
    }


def row_summary(rows: list[sqlite3.Row], current_provider: str, project_cwd: str | None) -> dict[str, object]:
    counts = provider_counts_for_rows(rows)
    return {
        "total": len(rows),
        "current_provider_count": counts.get(current_provider, 0),
        "provider_distribution": counts,
        "project_match_count": sum(1 for row in rows if project_cwd and workspace_contains(project_cwd, row["cwd"] if "cwd" in row.keys() else "")),
    }


def project_summary(rows: list[sqlite3.Row], current_provider: str) -> dict[str, object]:
    counts = provider_counts_for_rows(rows)
    return {"total": len(rows), "current_provider_count": counts.get(current_provider, 0), "provider_distribution": counts}


def provider_counts_for_rows(rows: list[sqlite3.Row]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for row in rows:
        provider = row["model_provider"] if "model_provider" in row.keys() else "unknown"
        counts[str(provider or "unknown")] += 1
    return dict(sorted(counts.items()))


def project_page(project: str, source: str, match_kind: str, records: list[ThreadRecord], limit: int, offset: int) -> dict[str, object]:
    has_more = len(records) > limit
    page = records[:limit]
    return {
        "status": "ok",
        "project_cwd": project,
        "source": source,
        "match_kind": match_kind,
        "threads": [record.to_payload() for record in page],
        "next_cursor": str(offset + limit) if has_more else "",
        "has_more": has_more,
        "sort_key": "updated_at",
    }


def failed_project_threads(message: str, source: str) -> dict[str, object]:
    return {"status": "failed", "source": source, "message": message, "threads": []}


def decode_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        return max(0, int(cursor))
    except (TypeError, ValueError):
        return 0


def workspace_scope_clause(root: str) -> tuple[str, list[str]]:
    clauses: list[str] = []
    params: list[str] = []
    for variant in workspace_path_variants(root):
        clauses.append("cwd = ?")
        params.append(variant)
        clauses.append("cwd LIKE ?")
        params.append(child_workspace_pattern(variant))
    return " OR ".join(clauses), params


def workspace_path_variants(value: str) -> list[str]:
    raw = value.strip()
    normalized = raw.replace("/", "\\") if is_windows_like_path(raw) else raw
    variants = [normalized]
    if normalized.startswith("\\\\?\\"):
        variants.append(normalized[4:])
    elif is_windows_drive_path(normalized):
        variants.append("\\\\?\\" + normalized)
    return list(dict.fromkeys(item.rstrip("\\") for item in variants if item.strip()))


def child_workspace_pattern(value: str) -> str:
    separator = "\\" if "\\" in value or is_windows_drive_path(value) else "/"
    return value.rstrip("\\/") + separator + "%"


def parent_workspace_path(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().replace("/", "\\") if is_windows_like_path(value) else value.strip()
    if normalized.startswith("\\\\?\\"):
        normalized = normalized[4:]
    if not is_windows_drive_path(normalized):
        return None
    parent = normalized.rstrip("\\").rsplit("\\", 1)[0]
    return parent if len(parent) > 3 else None


def order_sql_for_columns(columns: set[str]) -> str:
    sort_columns = [column for column in ("updated_at_ms", "updated_at", "created_at_ms") if column in columns]
    if not sort_columns:
        return "id DESC"
    return "COALESCE(" + ", ".join(sort_columns) + ", 0) DESC, id DESC"


def workspace_contains(root: str | None, cwd: str | None) -> bool:
    root_key = comparable_workspace_path(root)
    cwd_key = comparable_workspace_path(cwd)
    if not root_key or not cwd_key:
        return False
    return cwd_key == root_key or cwd_key.startswith(root_key.rstrip("\\") + "\\")


def comparable_workspace_path(value: str | None) -> str:
    normalized = to_desktop_workspace_path(value)
    if not normalized:
        return ""
    return normalized.replace("/", "\\").rstrip("\\").lower()


def path_needs_desktop_repair(value: str | None) -> bool:
    normalized = to_desktop_workspace_path(value)
    return bool(value and normalized and normalized != value)


def is_windows_drive_path(value: str) -> bool:
    return len(value) >= 3 and value[1] == ":" and value[0].isalpha() and value[2] in {"\\", "/"}


def is_windows_like_path(value: str) -> bool:
    return value.startswith("\\\\") or is_windows_drive_path(value)


def numeric_timestamp(value: object) -> int:
    try:
        return int(value) if value is not None else 0
    except (TypeError, ValueError):
        return 0


def safe_count(action) -> int:
    try:
        return int(action())
    except (sqlite3.DatabaseError, OSError, json.JSONDecodeError):
        return 0
