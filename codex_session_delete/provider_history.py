from __future__ import annotations

import json
import sqlite3
from collections import Counter
from pathlib import Path

from codex_session_delete.provider_sync import (
    collect_session_changes,
    count_global_state_updates,
    count_sqlite_path_updates,
    count_sqlite_updates,
    default_codex_home,
    read_current_provider,
    rollout_files,
    table_columns,
    to_desktop_workspace_path,
)


def provider_status(codex_home: Path | None = None) -> dict[str, object]:
    home = codex_home or default_codex_home()
    config_path = home / "config.toml"
    stat = config_path.stat() if config_path.exists() else None
    return {
        "status": "ok" if home.exists() else "missing",
        "codex_home": str(home),
        "current_provider": read_current_provider(config_path),
        "config_mtime_ms": int(stat.st_mtime * 1000) if stat else 0,
    }


def provider_diagnostics(codex_home: Path | None = None, project_cwd: str | None = None) -> dict[str, object]:
    home = codex_home or default_codex_home()
    target_provider = read_current_provider(home / "config.toml")
    session_stats = scan_rollout_stats(home)
    sqlite_stats = scan_sqlite_stats(home / "state_5.sqlite", target_provider, project_cwd)
    path_repair = {
        "rollout_cwd_count": session_stats["escaped_cwd_count"],
        "sqlite_cwd_count": count_sqlite_path_updates(home / "state_5.sqlite"),
        "global_state_count": count_global_state_updates(home / ".codex-global-state.json"),
    }
    changes = collect_session_changes(home, target_provider) if home.exists() else []
    thread_ids_with_user_events = {change.thread_id for change in changes if change.thread_id and change.has_user_event}
    provider_repair = {
        "rollout_files": sum(1 for change in changes if change.provider_rewrite_needed),
        "sqlite_rows": count_sqlite_updates(home / "state_5.sqlite", target_provider, thread_ids_with_user_events),
    }
    return {
        "status": "ok" if home.exists() else "missing",
        "current_provider": target_provider,
        "codex_home": str(home),
        "project_cwd": project_cwd or "",
        "rollout": session_stats,
        "sqlite": sqlite_stats,
        "path_repair_pending": path_repair,
        "provider_converge_pending": provider_repair,
        "warning": "provider 收敛只保证列表可见，不保证跨账号/跨 provider 的 encrypted_content 能续聊。",
    }


def scan_rollout_stats(home: Path) -> dict[str, object]:
    provider_counts: Counter[str] = Counter()
    escaped_cwd_count = 0
    encrypted_content_count = 0
    files = rollout_files(home) if home.exists() else []
    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        first_line = text.split("\n", 1)[0]
        try:
            record = json.loads(first_line)
        except json.JSONDecodeError:
            provider_counts["unknown"] += 1
            continue
        payload = record.get("payload") if isinstance(record, dict) else None
        if not isinstance(payload, dict):
            provider_counts["unknown"] += 1
            continue
        provider_counts[str(payload.get("model_provider") or "unknown")] += 1
        cwd = payload.get("cwd")
        if isinstance(cwd, str) and cwd.startswith("\\\\?\\"):
            escaped_cwd_count += 1
        if '"encrypted_content"' in text:
            encrypted_content_count += 1
    return {
        "files": len(files),
        "provider_distribution": dict(sorted(provider_counts.items())),
        "escaped_cwd_count": escaped_cwd_count,
        "encrypted_content_files": encrypted_content_count,
    }


def scan_sqlite_stats(db_path: Path, current_provider: str, project_cwd: str | None) -> dict[str, object]:
    if not db_path.exists():
        return empty_sqlite_stats()
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        if "threads" not in tables:
            return empty_sqlite_stats()
        columns = table_columns(con, "threads")
        if not columns:
            return empty_sqlite_stats()
        provider_distribution = sqlite_provider_distribution(con, columns)
        recent_rows = sqlite_recent_rows(con, columns, 50)
        project_rows = sqlite_project_rows(con, columns, project_cwd) if project_cwd else []
        return {
            "threads": sqlite_thread_count(con),
            "provider_distribution": provider_distribution,
            "escaped_cwd_count": count_escaped_sqlite_cwds(con, columns),
            "recent50": recent_summary(recent_rows, current_provider, project_cwd),
            "project_visible": project_summary(project_rows, current_provider),
        }
    finally:
        con.close()


def empty_sqlite_stats() -> dict[str, object]:
    return {
        "threads": 0,
        "provider_distribution": {},
        "escaped_cwd_count": 0,
        "recent50": {"total": 0, "current_provider_count": 0, "provider_distribution": {}, "project_match_count": 0},
        "project_visible": {"total": 0, "current_provider_count": 0, "provider_distribution": {}},
    }


def sqlite_thread_count(con: sqlite3.Connection) -> int:
    return int(con.execute("SELECT COUNT(*) FROM threads").fetchone()[0])


def sqlite_provider_distribution(con: sqlite3.Connection, columns: set[str]) -> dict[str, int]:
    if "model_provider" not in columns:
        return {}
    rows = con.execute("SELECT COALESCE(model_provider, 'unknown') AS provider, COUNT(*) FROM threads GROUP BY provider").fetchall()
    return {str(row[0] or "unknown"): int(row[1]) for row in rows}


def count_escaped_sqlite_cwds(con: sqlite3.Connection, columns: set[str]) -> int:
    if "cwd" not in columns:
        return 0
    count = 0
    for row in con.execute("SELECT cwd FROM threads WHERE cwd IS NOT NULL AND cwd <> ''"):
        cwd = str(row[0] or "")
        normalized = to_desktop_workspace_path(cwd)
        if normalized and normalized != cwd:
            count += 1
    return count


def sqlite_recent_rows(con: sqlite3.Connection, columns: set[str], limit: int) -> list[sqlite3.Row]:
    select_columns = [column for column in ("id", "cwd", "model_provider", "updated_at_ms", "updated_at", "created_at_ms") if column in columns]
    if not select_columns:
        return []
    order_columns = [column for column in ("updated_at_ms", "updated_at", "created_at_ms") if column in columns]
    order_sql = "COALESCE(" + ", ".join(order_columns) + ", 0) DESC, id DESC" if order_columns else "id DESC"
    filters = []
    if "archived" in columns:
        filters.append("COALESCE(archived, 0) = 0")
    if "has_user_event" in columns:
        filters.append("COALESCE(has_user_event, 0) = 1")
    if "thread_source" in columns:
        filters.append("COALESCE(thread_source, '') <> 'subagent'")
    where_sql = " WHERE " + " AND ".join(filters) if filters else ""
    return con.execute(f"SELECT {', '.join(select_columns)} FROM threads{where_sql} ORDER BY {order_sql} LIMIT ?", (limit,)).fetchall()


def sqlite_project_rows(con: sqlite3.Connection, columns: set[str], project_cwd: str | None) -> list[sqlite3.Row]:
    if not project_cwd or "cwd" not in columns:
        return []
    rows = sqlite_recent_rows(con, columns, 1000)
    return [row for row in rows if workspace_contains(project_cwd, row["cwd"] if "cwd" in row.keys() else "")]


def recent_summary(rows: list[sqlite3.Row], current_provider: str, project_cwd: str | None) -> dict[str, object]:
    provider_counts = provider_counts_for_rows(rows)
    return {
        "total": len(rows),
        "current_provider_count": provider_counts.get(current_provider, 0),
        "provider_distribution": provider_counts,
        "project_match_count": sum(1 for row in rows if project_cwd and workspace_contains(project_cwd, row["cwd"] if "cwd" in row.keys() else "")),
    }


def project_summary(rows: list[sqlite3.Row], current_provider: str) -> dict[str, object]:
    provider_counts = provider_counts_for_rows(rows)
    return {
        "total": len(rows),
        "current_provider_count": provider_counts.get(current_provider, 0),
        "provider_distribution": provider_counts,
    }


def provider_counts_for_rows(rows: list[sqlite3.Row]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for row in rows:
        provider = row["model_provider"] if "model_provider" in row.keys() else "unknown"
        counts[str(provider or "unknown")] += 1
    return dict(sorted(counts.items()))


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
