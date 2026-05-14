import json
import sqlite3

from codex_session_delete.provider_sync import ProviderSyncStatus, run_provider_path_repair, run_provider_sync


def write_rollout(path, provider="openai", thread_id="thread-1", cwd=r"C:\old"):
    path.parent.mkdir(parents=True, exist_ok=True)
    first = {
        "type": "session_meta",
        "payload": {
            "id": thread_id,
            "model_provider": provider,
            "cwd": cwd,
        },
    }
    path.write_text(json.dumps(first) + "\n" + json.dumps({"type": "event_msg", "payload": {"type": "user_message"}}) + "\n", encoding="utf-8")


def create_state_db(path, provider="old-provider", has_user_event=0, cwd=r"C:\old"):
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE threads (id TEXT PRIMARY KEY, model_provider TEXT, archived INTEGER, has_user_event INTEGER, cwd TEXT)")
    con.execute("INSERT INTO threads VALUES ('thread-1', ?, 0, ?, ?)", (provider, has_user_event, cwd))
    con.commit()
    con.close()


def test_provider_sync_updates_rollout_and_sqlite_to_current_provider(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "config.toml").write_text('model_provider = "apigather"\n', encoding="utf-8")
    rollout = codex_home / "sessions" / "2026" / "rollout-abc.jsonl"
    write_rollout(rollout, provider="openai", thread_id="thread-1", cwd=r"C:\workspace")
    create_state_db(codex_home / "state_5.sqlite", cwd=r"C:\workspace")

    result = run_provider_sync(codex_home)

    assert result.status == ProviderSyncStatus.SYNCED
    first = json.loads(rollout.read_text(encoding="utf-8").splitlines()[0])
    assert first["payload"]["model_provider"] == "apigather"
    con = sqlite3.connect(codex_home / "state_5.sqlite")
    row = con.execute("SELECT model_provider, has_user_event, cwd FROM threads WHERE id = 'thread-1'").fetchone()
    con.close()
    assert row == ("apigather", 1, r"C:\workspace")
    assert result.changed_session_files == 1
    assert result.sqlite_rows_updated == 2
    assert result.backup_dir is not None
    assert (result.backup_dir / "session-meta-backup.json").exists()


def test_provider_sync_repairs_sqlite_visibility_when_rollout_provider_already_matches(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "config.toml").write_text('model_provider = "apigather"\n', encoding="utf-8")
    write_rollout(codex_home / "sessions" / "rollout-current.jsonl", provider="apigather", thread_id="thread-1", cwd=r"C:\workspace")
    create_state_db(codex_home / "state_5.sqlite", provider="apigather", cwd=r"C:\workspace")

    result = run_provider_sync(codex_home)

    assert result.status == ProviderSyncStatus.SYNCED
    con = sqlite3.connect(codex_home / "state_5.sqlite")
    row = con.execute("SELECT model_provider, has_user_event, cwd FROM threads WHERE id = 'thread-1'").fetchone()
    con.close()
    assert row == ("apigather", 1, r"C:\workspace")
    assert result.changed_session_files == 0
    assert result.sqlite_rows_updated == 1


def test_provider_sync_normalizes_sqlite_cwd_to_desktop_path(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "config.toml").write_text('model_provider = "apigather"\n', encoding="utf-8")
    write_rollout(codex_home / "sessions" / "rollout-current.jsonl", provider="apigather", thread_id="thread-1", cwd="\\\\?\\C:\\workspace")
    create_state_db(codex_home / "state_5.sqlite", provider="apigather", has_user_event=1, cwd="\\\\?\\C:\\workspace")

    result = run_provider_sync(codex_home)

    assert result.status == ProviderSyncStatus.SYNCED
    first = json.loads((codex_home / "sessions" / "rollout-current.jsonl").read_text(encoding="utf-8").splitlines()[0])
    assert first["payload"]["cwd"] == r"C:\workspace"
    con = sqlite3.connect(codex_home / "state_5.sqlite")
    row = con.execute("SELECT cwd FROM threads WHERE id = 'thread-1'").fetchone()
    con.close()
    assert row == (r"C:\workspace",)
    assert result.changed_session_files == 1
    assert result.sqlite_rows_updated == 1


def test_provider_sync_normalizes_existing_global_state_roots_only(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "config.toml").write_text('model_provider = "apigather"\n', encoding="utf-8")
    (codex_home / ".codex-global-state.json").write_text(
        json.dumps(
            {
                "electron-saved-workspace-roots": ["\\\\?\\C:\\workspace"],
                "project-order": ["\\\\?\\C:\\workspace"],
                "active-workspace-roots": ["\\\\?\\C:\\workspace"],
                "electron-workspace-root-labels": {"\\\\?\\C:\\workspace": "Workspace"},
            }
        ),
        encoding="utf-8",
    )
    write_rollout(codex_home / "sessions" / "rollout-current.jsonl", provider="apigather", thread_id="thread-1", cwd=r"C:\workspace")
    create_state_db(codex_home / "state_5.sqlite", provider="apigather", has_user_event=1, cwd=r"C:\workspace")

    result = run_provider_sync(codex_home)

    assert result.status == ProviderSyncStatus.SYNCED
    state = json.loads((codex_home / ".codex-global-state.json").read_text(encoding="utf-8"))
    assert state["electron-saved-workspace-roots"] == [r"C:\workspace"]
    assert state["project-order"] == [r"C:\workspace"]
    assert state["active-workspace-roots"] == [r"C:\workspace"]
    assert state["electron-workspace-root-labels"] == {r"C:\workspace": "Workspace"}


def test_provider_sync_does_not_add_rollout_cwd_to_global_project_roots(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "config.toml").write_text('model_provider = "apigather"\n', encoding="utf-8")
    (codex_home / ".codex-global-state.json").write_text(
        json.dumps(
            {
                "electron-saved-workspace-roots": [r"C:\existing"],
                "project-order": [r"C:\existing"],
                "active-workspace-roots": [r"C:\existing"],
            }
        ),
        encoding="utf-8",
    )
    write_rollout(codex_home / "sessions" / "rollout-current.jsonl", provider="apigather", thread_id="thread-1", cwd=r"C:\new-project")
    create_state_db(codex_home / "state_5.sqlite", provider="apigather", has_user_event=1, cwd=r"C:\existing")

    result = run_provider_sync(codex_home)

    assert result.status == ProviderSyncStatus.SYNCED
    state = json.loads((codex_home / ".codex-global-state.json").read_text(encoding="utf-8"))
    assert state["electron-saved-workspace-roots"] == [r"C:\existing"]
    assert state["project-order"] == [r"C:\existing"]
    assert state["active-workspace-roots"] == [r"C:\existing"]


def test_provider_sync_does_not_move_sqlite_cwd_to_rollout_cwd(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "config.toml").write_text('model_provider = "apigather"\n', encoding="utf-8")
    write_rollout(codex_home / "sessions" / "rollout-current.jsonl", provider="apigather", thread_id="thread-1", cwd=r"D:\Project\AILIMS\backend")
    create_state_db(codex_home / "state_5.sqlite", provider="apigather", has_user_event=1, cwd=r"D:\Project\AILIMS")

    result = run_provider_sync(codex_home)

    assert result.status == ProviderSyncStatus.SYNCED
    con = sqlite3.connect(codex_home / "state_5.sqlite")
    row = con.execute("SELECT cwd FROM threads WHERE id = 'thread-1'").fetchone()
    con.close()
    assert row == (r"D:\Project\AILIMS",)


def test_provider_sync_normalizes_scalar_active_workspace_root(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "config.toml").write_text('model_provider = "apigather"\n', encoding="utf-8")
    (codex_home / ".codex-global-state.json").write_text(
        json.dumps(
            {
                "active-workspace-roots": "\\\\?\\C:\\workspace",
            }
        ),
        encoding="utf-8",
    )
    write_rollout(codex_home / "sessions" / "rollout-current.jsonl", provider="apigather", thread_id="thread-1", cwd=r"C:\workspace")
    create_state_db(codex_home / "state_5.sqlite", provider="apigather", has_user_event=1, cwd=r"C:\workspace")

    result = run_provider_sync(codex_home)

    assert result.status == ProviderSyncStatus.SYNCED
    state = json.loads((codex_home / ".codex-global-state.json").read_text(encoding="utf-8"))
    assert state["active-workspace-roots"] == r"C:\workspace"


def test_provider_path_repair_normalizes_paths_without_changing_provider(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "config.toml").write_text('model_provider = "apigather"\n', encoding="utf-8")
    rollout = codex_home / "sessions" / "rollout-current.jsonl"
    write_rollout(rollout, provider="openai", thread_id="thread-1", cwd="\\\\?\\C:\\workspace")
    create_state_db(codex_home / "state_5.sqlite", provider="openai", has_user_event=0, cwd="\\\\?\\C:\\workspace")

    result = run_provider_path_repair(codex_home)

    assert result.status == ProviderSyncStatus.SYNCED
    first = json.loads(rollout.read_text(encoding="utf-8").splitlines()[0])
    assert first["payload"]["model_provider"] == "openai"
    assert first["payload"]["cwd"] == r"C:\workspace"
    con = sqlite3.connect(codex_home / "state_5.sqlite")
    row = con.execute("SELECT model_provider, has_user_event, cwd FROM threads WHERE id = 'thread-1'").fetchone()
    con.close()
    assert row == ("openai", 0, r"C:\workspace")
    assert result.changed_session_files == 1
    assert result.sqlite_rows_updated == 1


def test_provider_sync_skips_when_lock_exists(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "tmp" / "provider-sync.lock").mkdir(parents=True)
    (codex_home / "config.toml").write_text('model_provider = "apigather"\n', encoding="utf-8")

    result = run_provider_sync(codex_home)

    assert result.status == ProviderSyncStatus.SKIPPED
    assert "lock" in result.message.lower()


def test_provider_sync_prunes_backups_to_five(tmp_path):
    codex_home = tmp_path / ".codex"
    codex_home.mkdir()
    (codex_home / "config.toml").write_text('model_provider = "apigather"\n', encoding="utf-8")
    backup_root = codex_home / "backups_state" / "provider-sync"
    for index in range(6):
        backup = backup_root / f"2000010100000{index}"
        backup.mkdir(parents=True)
        (backup / "metadata.json").write_text(json.dumps({"managedBy": "Codex++ provider sync"}), encoding="utf-8")
    write_rollout(codex_home / "sessions" / "rollout-new.jsonl", provider="openai")

    result = run_provider_sync(codex_home)

    assert result.status == ProviderSyncStatus.SYNCED
    backups = [path for path in backup_root.iterdir() if path.is_dir()]
    assert len(backups) == 5
