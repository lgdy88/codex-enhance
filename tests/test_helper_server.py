import json
import threading
import urllib.error
import urllib.request
from importlib import resources

from codex_session_delete.helper_server import HelperServer
from codex_session_delete.models import DeleteResult, DeleteStatus, ExportResult, ExportStatus, SessionRef


class FakeDeleteService:
    def __init__(self):
        self.deleted = []
        self.undone = []
        self.archived_title_queries = []

    def delete(self, session: SessionRef):
        self.deleted.append(session)
        return DeleteResult(DeleteStatus.LOCAL_DELETED, session.session_id, "Deleted locally", undo_token="u1")

    def undo(self, token: str):
        self.undone.append(token)
        return DeleteResult(DeleteStatus.UNDONE, "s1", "Restored", undo_token=token)

    def find_archived_thread_by_title(self, title: str):
        self.archived_title_queries.append(title)
        return SessionRef(session_id="archived-t1", title=title)

    def move_thread_workspace(self, session: SessionRef, target_cwd: str):
        return {"status": "moved", "session_id": session.session_id, "target_cwd": target_cwd}

    def thread_sort_key(self, session: SessionRef):
        return {"status": "ok", "session_id": session.session_id, "updated_at_ms": 123}

    def thread_sort_keys(self, sessions: list[SessionRef]):
        return {"status": "ok", "sort_keys": [{"session_id": session.session_id, "updated_at_ms": index + 1} for index, session in enumerate(sessions)]}

    def project_threads(self, project_cwd: str, limit: int = 30, cursor: str | None = None):
        return {"status": "ok", "project_cwd": project_cwd, "cursor": cursor or "", "threads": [{"session_id": "s1", "title": "First", "cwd": project_cwd}]}

    def project_file_tree(self, project_cwd: str, relative_path: str = "", limit: int = 200):
        return {
            "status": "ok",
            "project_cwd": project_cwd,
            "path": relative_path,
            "entries": [{"name": "src", "path": "src", "type": "directory", "has_children": True}],
        }

    def provider_status(self):
        return {"status": "ok", "current_provider": "custom", "config_mtime_ms": 1}

    def provider_diagnostics(self, project_cwd: str = ""):
        return {"status": "ok", "project_cwd": project_cwd, "current_provider": "custom"}

    def provider_repair_paths(self):
        return {"status": "synced", "message": "Provider path repair complete"}

    def provider_converge(self):
        return {"status": "synced", "message": "Provider sync complete"}

    def provider_quarantine_state(self):
        return {"status": "synced", "message": "State DB quarantined"}


class FakeExportService:
    def __init__(self):
        self.exported = []

    def export(self, session: SessionRef):
        self.exported.append(session)
        return ExportResult(ExportStatus.EXPORTED, session.session_id, "Exported", filename="thread.md", markdown="# Thread\n")


def post_json(url, payload, headers=None):
    data = json.dumps(payload).encode("utf-8")
    request_headers = {"Content-Type": "application/json", **(headers or {})}
    request = urllib.request.Request(url, data=data, headers=request_headers, method="POST")
    with urllib.request.urlopen(request, timeout=3) as response:
        return json.loads(response.read().decode("utf-8"))


def test_helper_server_delete_and_undo():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service, allow_http_mutation=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.port}"
        deleted = post_json(base + "/delete", {"session_id": "s1", "title": "First"})
        undone = post_json(base + "/undo", {"undo_token": "u1"})
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert deleted["status"] == "local_deleted"
    assert deleted["undo_token"] == "u1"
    assert undone["status"] == "undone"
    assert service.deleted[0].session_id == "s1"
    assert service.undone == ["u1"]


def test_helper_server_resolves_archived_thread_by_title():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service, allow_http_mutation=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.port}"
        resolved = post_json(base + "/archived-thread", {"title": "Codex Thread"})
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert resolved == {"session_id": "archived-t1", "title": "Codex Thread"}
    assert service.archived_title_queries == ["Codex Thread"]


def test_helper_server_exports_markdown_when_authorized():
    delete_service = FakeDeleteService()
    export_service = FakeExportService()
    server = HelperServer("127.0.0.1", 0, delete_service, export_service, allow_http_mutation=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.port}"
        exported = post_json(base + "/export-markdown", {"session_id": "s1", "title": "First"})
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert exported["status"] == "exported"
    assert exported["filename"] == "thread.md"
    assert export_service.exported[0].session_id == "s1"


def test_helper_server_rejects_http_mutation_by_default():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.port}"
        try:
            post_json(base + "/delete", {"session_id": "s1", "title": "First"})
            assert False, "expected forbidden response"
        except urllib.error.HTTPError as exc:
            assert exc.code == 403
        try:
            post_json(base + "/export-markdown", {"session_id": "s1", "title": "First"})
            assert False, "expected forbidden response"
        except urllib.error.HTTPError as exc:
            assert exc.code == 403
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert service.deleted == []


def test_helper_server_accepts_http_mutation_token():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service, http_mutation_token="test-token")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.port}"
        try:
            post_json(base + "/delete", {"session_id": "s1", "title": "First"})
            assert False, "expected forbidden response"
        except urllib.error.HTTPError as exc:
            assert exc.code == 403
        deleted = post_json(base + "/delete", {"session_id": "s1", "title": "First"}, {"X-Codex-Session-Delete-Token": "test-token"})
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert deleted["status"] == "local_deleted"
    assert service.deleted[0].session_id == "s1"


def test_helper_server_rejects_state_endpoints_without_http_mutation_token():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.port}"
        for path, payload in [
            ("/move-thread-workspace", {"session_id": "s1", "title": "First", "target_cwd": "/project/a"}),
            ("/thread-sort-key", {"session_id": "s1", "title": "First"}),
            ("/thread-sort-keys", {"sessions": [{"session_id": "s1", "title": "First"}]}),
        ]:
            try:
                post_json(base + path, payload)
                assert False, f"expected forbidden response for {path}"
            except urllib.error.HTTPError as exc:
                assert exc.code == 403
    finally:
        server.shutdown()
        thread.join(timeout=3)

def test_helper_server_moves_thread_workspace_with_http_mutation_token():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service, http_mutation_token="test-token")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.port}"
        moved = post_json(
            base + "/move-thread-workspace",
            {"session_id": "s1", "title": "First", "target_cwd": "/project/a"},
            {"X-Codex-Session-Delete-Token": "test-token"},
        )
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert moved == {"status": "moved", "session_id": "s1", "target_cwd": "/project/a"}


def test_helper_server_returns_thread_sort_key():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service, allow_http_mutation=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.port}"
        sort_key = post_json(base + "/thread-sort-key", {"session_id": "s1", "title": "First"})
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert sort_key == {"status": "ok", "session_id": "s1", "updated_at_ms": 123}


def test_helper_server_returns_thread_sort_keys():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service, allow_http_mutation=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.port}"
        sort_keys = post_json(base + "/thread-sort-keys", {"sessions": [{"session_id": "s1", "title": "First"}, {"session_id": "s2", "title": "Second"}]})
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert sort_keys == {"status": "ok", "sort_keys": [{"session_id": "s1", "updated_at_ms": 1}, {"session_id": "s2", "updated_at_ms": 2}]}


def test_helper_server_returns_project_threads():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service, allow_http_mutation=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.port}"
        threads = post_json(base + "/project-threads", {"project_cwd": "/project/a", "limit": 10, "cursor": "10"})
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert threads == {"status": "ok", "project_cwd": "/project/a", "cursor": "10", "threads": [{"session_id": "s1", "title": "First", "cwd": "/project/a"}]}


def test_helper_server_returns_provider_history_endpoints():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service, allow_http_mutation=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.port}"
        status = post_json(base + "/provider/status", {})
        diagnostics = post_json(base + "/provider/diagnostics", {"project_cwd": "/project/a"})
        repaired = post_json(base + "/provider/repair-paths", {})
        converged = post_json(base + "/provider/converge", {})
        quarantined = post_json(base + "/provider/quarantine-state", {})
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert status["current_provider"] == "custom"
    assert diagnostics["project_cwd"] == "/project/a"
    assert repaired["status"] == "synced"
    assert converged["message"] == "Provider sync complete"
    assert quarantined["message"] == "State DB quarantined"


def test_helper_server_returns_project_file_tree():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service, allow_http_mutation=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.port}"
        tree = post_json(base + "/project-file-tree", {"project_cwd": "/project/a", "path": "", "limit": 20})
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert tree == {
        "status": "ok",
        "project_cwd": "/project/a",
        "path": "",
        "entries": [{"name": "src", "path": "src", "type": "directory", "has_children": True}],
    }


def test_helper_server_serves_packaged_sponsor_assets():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with resources.files("codex_session_delete").joinpath("assets/sponsor-alipay.jpg").open("rb") as asset:
            expected = asset.read()
        request = urllib.request.Request(f"http://127.0.0.1:{server.port}/assets/sponsor-alipay.jpg", method="GET")
        with urllib.request.urlopen(request, timeout=3) as response:
            body = response.read()
            content_type = response.headers.get("Content-Type")
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert body == expected
    assert content_type == "image/jpeg"


def test_helper_server_preflight_omits_private_network_access():
    service = FakeDeleteService()
    server = HelperServer("127.0.0.1", 0, service)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        request = urllib.request.Request(
            f"http://127.0.0.1:{server.port}/delete",
            method="OPTIONS",
            headers={
                "Origin": "file://",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
                "Access-Control-Request-Private-Network": "true",
            },
        )
        with urllib.request.urlopen(request, timeout=3) as response:
            private_network = response.headers.get("Access-Control-Allow-Private-Network")
            allow_headers = response.headers.get("Access-Control-Allow-Headers")
    finally:
        server.shutdown()
        thread.join(timeout=3)

    assert private_network is None
    assert "X-Codex-Session-Delete-Token" in allow_headers
