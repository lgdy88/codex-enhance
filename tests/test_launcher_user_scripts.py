from codex_session_delete.launcher import handle_bridge_request
from codex_session_delete.models import ExportResult, ExportStatus
from codex_session_delete.settings_store import SettingsStore
from codex_session_delete.user_scripts import UserScriptManager


class FakeDeleteService:
    def delete(self, session):
        raise AssertionError("delete should not be called")

    def undo(self, undo_token):
        raise AssertionError("undo should not be called")

    def find_archived_thread_by_title(self, title):
        return None

    def project_threads(self, project_cwd, limit=30, cursor=None):
        return {"status": "ok", "project_cwd": project_cwd, "cursor": cursor or "", "threads": []}

    def project_file_tree(self, project_cwd, relative_path="", limit=200):
        return {"status": "ok", "project_cwd": project_cwd, "path": relative_path, "entries": []}

    def provider_status(self):
        return {"status": "ok", "current_provider": "custom", "config_mtime_ms": 1}

    def provider_diagnostics(self, project_cwd=""):
        return {"status": "ok", "project_cwd": project_cwd, "current_provider": "custom"}

    def provider_repair_paths(self):
        return {"status": "synced", "message": "Provider path repair complete"}

    def provider_converge(self):
        return {"status": "synced", "message": "Provider sync complete"}

    def provider_quarantine_state(self):
        return {"status": "synced", "message": "State DB quarantined"}


class FakeExportService:
    def export(self, session):
        return ExportResult(ExportStatus.EXPORTED, session.session_id, "Exported", filename="thread.md", markdown="# Thread\n")


class FakeRuntime:
    def __init__(self, manager):
        self.user_scripts = manager
        self.injected = []
        self.devtools_opened = False
        self.repaired = False

    def reload_user_scripts(self):
        bundle = self.user_scripts.build_enabled_bundle()
        self.injected.append(bundle)
        return self.user_scripts.inventory()

    def open_devtools(self):
        self.devtools_opened = True
        return {"status": "ok"}

    def backend_status(self):
        return {"status": "ok", "message": "后端已连接"}

    def repair_backend(self):
        self.repaired = True
        return {"status": "ok", "message": "后端已修复"}


def test_handle_bridge_request_lists_user_scripts(tmp_path):
    builtin = tmp_path / "builtin"
    user = tmp_path / "user"
    builtin.mkdir()
    (builtin / "demo.js").write_text("window.demo = true;", encoding="utf-8")
    manager = UserScriptManager(builtin, user, tmp_path / "config.json")
    runtime = FakeRuntime(manager)

    result = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/user-scripts/list", {}, runtime)

    assert result["enabled"] is False
    assert result["scripts"][0]["key"] == "builtin:demo.js"


def test_handle_bridge_request_updates_user_script_toggles(tmp_path):
    manager = UserScriptManager(tmp_path / "builtin", tmp_path / "user", tmp_path / "config.json")
    runtime = FakeRuntime(manager)

    global_result = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/user-scripts/set-enabled", {"enabled": False}, runtime)
    script_result = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/user-scripts/set-script-enabled", {"key": "user:a.js", "enabled": False}, runtime)

    assert global_result["enabled"] is False
    assert script_result["scripts"] == []
    assert manager.load_config().scripts["user:a.js"] is False


def test_handle_bridge_request_reports_and_repairs_backend_status(tmp_path):
    manager = UserScriptManager(tmp_path / "builtin", tmp_path / "user", tmp_path / "config.json")
    runtime = FakeRuntime(manager)

    status = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/backend/status", {}, runtime)
    repaired = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/backend/repair", {}, runtime)

    assert status == {"status": "ok", "message": "后端已连接"}
    assert runtime.repaired is True
    assert repaired == {"status": "ok", "message": "后端已修复"}


def test_handle_bridge_request_gets_backend_settings(monkeypatch, tmp_path):
    store = SettingsStore(tmp_path / "settings.json")
    store.update({"providerSyncEnabled": True})
    monkeypatch.setattr("codex_session_delete.bridge_routes.SettingsStore", lambda: store)
    manager = UserScriptManager(tmp_path / "builtin", tmp_path / "user", tmp_path / "config.json")
    runtime = FakeRuntime(manager)

    result = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/settings/get", {}, runtime)

    assert result == {"providerSyncEnabled": True}


def test_handle_bridge_request_sets_backend_settings(monkeypatch, tmp_path):
    store = SettingsStore(tmp_path / "settings.json")
    monkeypatch.setattr("codex_session_delete.bridge_routes.SettingsStore", lambda: store)
    manager = UserScriptManager(tmp_path / "builtin", tmp_path / "user", tmp_path / "config.json")
    runtime = FakeRuntime(manager)

    result = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/settings/set", {"providerSyncEnabled": True}, runtime)

    assert result == {"providerSyncEnabled": True}
    assert store.load().provider_sync_enabled is True


def test_handle_bridge_request_installs_browser_mcp(monkeypatch, tmp_path):
    manager = UserScriptManager(tmp_path / "builtin", tmp_path / "user", tmp_path / "config.json")
    runtime = FakeRuntime(manager)
    calls = []

    class Result:
        def to_dict(self):
            return {"status": "ok", "message": "written", "servers": []}

    monkeypatch.setattr(
        "codex_session_delete.bridge_routes.install_browser_mcp_servers",
        lambda servers, chrome_mode, browser_url: calls.append((servers, chrome_mode, browser_url)) or Result(),
    )

    result = handle_bridge_request(
        FakeDeleteService(),
        FakeExportService(),
        "/mcp/install",
        {"servers": ["chrome-devtools"], "chromeMode": "browser-url", "browserUrl": "http://127.0.0.1:9222"},
        runtime,
    )

    assert result["status"] == "ok"
    assert calls == [(["chrome-devtools"], "browser-url", "http://127.0.0.1:9222")]


def test_handle_bridge_request_sets_mcp_enabled(monkeypatch, tmp_path):
    manager = UserScriptManager(tmp_path / "builtin", tmp_path / "user", tmp_path / "config.json")
    runtime = FakeRuntime(manager)
    calls = []

    class Result:
        def to_dict(self):
            return {"status": "ok", "message": "updated", "servers": [{"name": "github", "enabled": False}]}

    monkeypatch.setattr("codex_session_delete.bridge_routes.set_mcp_server_enabled", lambda name, enabled: calls.append((name, enabled)) or Result())

    result = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/mcp/set-enabled", {"name": "github", "enabled": False}, runtime)

    assert result["message"] == "updated"
    assert calls == [("github", False)]


def test_handle_bridge_request_removes_browser_mcp(monkeypatch, tmp_path):
    manager = UserScriptManager(tmp_path / "builtin", tmp_path / "user", tmp_path / "config.json")
    runtime = FakeRuntime(manager)
    calls = []

    class Result:
        def to_dict(self):
            return {"status": "ok", "message": "removed", "servers": []}

    monkeypatch.setattr("codex_session_delete.bridge_routes.remove_browser_mcp_servers", lambda servers: calls.append(servers) or Result())

    result = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/mcp/remove", {"servers": ["all"]}, runtime)

    assert result["message"] == "removed"
    assert calls == [["all"]]


def test_handle_bridge_request_exports_markdown(tmp_path):
    manager = UserScriptManager(tmp_path / "builtin", tmp_path / "user", tmp_path / "config.json")
    runtime = FakeRuntime(manager)

    exported = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/export-markdown", {"session_id": "s1", "title": "First"}, runtime)

    assert exported["status"] == "exported"
    assert exported["filename"] == "thread.md"


def test_handle_bridge_request_returns_project_file_tree(tmp_path):
    manager = UserScriptManager(tmp_path / "builtin", tmp_path / "user", tmp_path / "config.json")
    runtime = FakeRuntime(manager)

    result = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/project-file-tree", {"project_cwd": str(tmp_path), "path": ""}, runtime)

    assert result == {"status": "ok", "project_cwd": str(tmp_path), "path": "", "entries": []}


def test_handle_bridge_request_returns_provider_history_endpoints(tmp_path):
    manager = UserScriptManager(tmp_path / "builtin", tmp_path / "user", tmp_path / "config.json")
    runtime = FakeRuntime(manager)

    status = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/provider/status", {}, runtime)
    diagnostics = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/provider/diagnostics", {"project_cwd": str(tmp_path)}, runtime)
    repaired = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/provider/repair-paths", {}, runtime)
    converged = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/provider/converge", {}, runtime)
    quarantined = handle_bridge_request(FakeDeleteService(), FakeExportService(), "/provider/quarantine-state", {}, runtime)

    assert status["current_provider"] == "custom"
    assert diagnostics["project_cwd"] == str(tmp_path)
    assert repaired["status"] == "synced"
    assert converged["message"] == "Provider sync complete"
    assert quarantined["message"] == "State DB quarantined"

