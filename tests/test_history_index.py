import json
import sqlite3

from codex_session_delete.history_index import HistoryIndex, RepairPlanner, RolloutReader, StateDbReader, quarantine_state_db
from codex_session_delete.provider_sync import ProviderSyncStatus


def write_rollout(path, thread_id="t1", cwd=r"D:\Project\A", provider="openai"):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"type": "session_meta", "payload": {"id": thread_id, "cwd": cwd, "model_provider": provider, "title": "From Rollout"}})
        + "\n"
        + json.dumps({"type": "event_msg", "payload": {"type": "user_message"}})
        + "\n",
        encoding="utf-8",
    )


def create_state_db(path):
    con = sqlite3.connect(path)
    con.execute(
        "CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, cwd TEXT, model_provider TEXT, archived INTEGER, has_user_event INTEGER, updated_at_ms INTEGER, thread_source TEXT)"
    )
    con.execute("INSERT INTO threads VALUES ('t1', 'From SQLite', 'D:\\Project\\A', 'openai', 0, 1, 2000, NULL)")
    con.commit()
    con.close()


def test_state_db_reader_reports_quick_check_and_schema(tmp_path):
    db_path = tmp_path / "state_5.sqlite"
    create_state_db(db_path)

    health = StateDbReader(db_path).health()

    assert health["status"] == "ok"
    assert health["quick_check"] == "ok"
    assert health["schema"]["status"] == "ok"
    assert "cwd" in health["schema"]["thread_columns"]


def test_history_index_falls_back_to_rollout_when_sqlite_is_corrupt(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "state_5.sqlite").write_bytes(b"not sqlite")
    write_rollout(codex_home / "sessions" / "rollout-t1.jsonl")

    result = HistoryIndex(codex_home).project_threads(r"D:\Project\A")

    assert result["status"] == "ok"
    assert result["source"] == "rollout-jsonl"
    assert result["fallback_reason"]
    assert result["threads"][0]["session_id"] == "t1"


def test_history_index_falls_back_to_rollout_when_sqlite_project_is_empty(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    create_state_db(codex_home / "state_5.sqlite")
    write_rollout(codex_home / "sessions" / "rollout-t2.jsonl", thread_id="t2", cwd=r"D:\Project\B")

    result = HistoryIndex(codex_home).project_threads(r"D:\Project\B")

    assert result["status"] == "ok"
    assert result["source"] == "rollout-jsonl"
    assert result["fallback_reason"] == "SQLite bridge returned no project threads"
    assert result["threads"][0]["session_id"] == "t2"


def test_rollout_stats_counts_malformed_jsonl_as_unknown(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    write_rollout(codex_home / "sessions" / "rollout-t1.jsonl")
    bad = codex_home / "sessions" / "rollout-bad.jsonl"
    bad.write_text("{not json", encoding="utf-8")

    stats = RolloutReader(codex_home).stats()

    assert stats["files"] == 2
    assert stats["provider_distribution"]["openai"] == 1
    assert stats["provider_distribution"]["unknown"] == 1


def test_repair_planner_adds_quarantine_step_for_bad_schema(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    con = sqlite3.connect(codex_home / "state_5.sqlite")
    con.execute("CREATE TABLE unrelated (id TEXT)")
    con.commit()
    con.close()

    packet = RepairPlanner(codex_home).diagnostics()

    assert packet["state_db"]["schema"]["status"] == "unsupported"
    assert any(step["id"] == "state.quarantine" for step in packet["repair_plan"])


def test_quarantine_state_db_backs_up_and_moves_wal_shm(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    for name in ("state_5.sqlite", "state_5.sqlite-wal", "state_5.sqlite-shm"):
        (codex_home / name).write_text(name, encoding="utf-8")

    result = quarantine_state_db(codex_home)

    assert result.status == ProviderSyncStatus.SYNCED
    assert result.backup_dir is not None
    assert not (codex_home / "state_5.sqlite").exists()
    assert (result.backup_dir / "db" / "state_5.sqlite").exists()
    assert (result.backup_dir / "quarantine" / "state_5.sqlite-wal").exists()
