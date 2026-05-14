import json
import sqlite3

from codex_session_delete.provider_history import provider_diagnostics, provider_status


def test_provider_status_reads_current_provider_and_config_mtime(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "config.toml").write_text('model_provider = "custom"\n', encoding="utf-8")

    result = provider_status(codex_home)

    assert result["status"] == "ok"
    assert result["current_provider"] == "custom"
    assert result["config_mtime_ms"] > 0


def test_provider_diagnostics_reports_provider_distribution_and_repair_counts(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "config.toml").write_text('model_provider = "custom"\n', encoding="utf-8")
    sessions = codex_home / "sessions"
    sessions.mkdir()
    (sessions / "rollout-a.jsonl").write_text(
        json.dumps({"type": "session_meta", "payload": {"id": "t1", "model_provider": "openai", "cwd": "\\\\?\\D:\\Project\\A"}})
        + "\n"
        + json.dumps({"type": "event_msg", "payload": {"type": "user_message", "encrypted_content": "x"}})
        + "\n",
        encoding="utf-8",
    )
    (sessions / "rollout-b.jsonl").write_text(
        json.dumps({"type": "session_meta", "payload": {"id": "t2", "model_provider": "custom", "cwd": "D:\\Project\\A"}}) + "\n",
        encoding="utf-8",
    )
    con = sqlite3.connect(codex_home / "state_5.sqlite")
    con.execute(
        "CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, rollout_path TEXT, cwd TEXT, model_provider TEXT, archived INTEGER, has_user_event INTEGER, updated_at_ms INTEGER, thread_source TEXT)"
    )
    con.execute("INSERT INTO threads VALUES ('t1', 'One', 'r1', '\\\\?\\D:\\Project\\A', 'openai', 0, 1, 2000, NULL)")
    con.execute("INSERT INTO threads VALUES ('t2', 'Two', 'r2', 'D:\\Project\\A', 'custom', 0, 1, 1000, NULL)")
    con.commit()
    con.close()

    result = provider_diagnostics(codex_home, "D:\\Project\\A")

    assert result["status"] == "ok"
    assert result["rollout"]["provider_distribution"] == {"custom": 1, "openai": 1}
    assert result["rollout"]["escaped_cwd_count"] == 1
    assert result["rollout"]["encrypted_content_files"] == 1
    assert result["sqlite"]["provider_distribution"] == {"custom": 1, "openai": 1}
    assert result["path_repair_pending"]["sqlite_cwd_count"] == 1
    assert result["provider_converge_pending"]["rollout_files"] == 1
    assert result["sqlite"]["project_visible"]["total"] == 2
    assert "encrypted_content" in result["warning"]
