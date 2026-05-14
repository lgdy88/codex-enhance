from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from codex_session_delete import cdp
from codex_session_delete.helper_server import HelperServer
from codex_session_delete.history_index import HistoryIndex, quarantine_state_db
from codex_session_delete.models import DeleteResult, DeleteStatus, SessionRef
from codex_session_delete.provider_history import provider_diagnostics, provider_status
from codex_session_delete.provider_sync import run_provider_path_repair, run_provider_sync


PROJECT_CWD = r"D:\Smoke\Project"


class SmokeService:
    def __init__(self, codex_home: Path):
        self.codex_home = codex_home
        self.index = HistoryIndex(codex_home)

    def delete(self, session: SessionRef):
        return DeleteResult(DeleteStatus.FAILED, session.session_id, "smoke blocks delete")

    def undo(self, token: str):
        return DeleteResult(DeleteStatus.FAILED, "", "smoke blocks undo", undo_token=token)

    def find_archived_thread_by_title(self, title: str):
        return None

    def move_thread_workspace(self, session: SessionRef, target_cwd: str):
        return {"status": "failed", "message": "smoke blocks move", "session_id": session.session_id}

    def thread_sort_key(self, session: SessionRef):
        return {"status": "ok", "session_id": session.session_id, "updated_at_ms": 1}

    def thread_sort_keys(self, sessions: list[SessionRef]):
        return {"status": "ok", "sort_keys": [self.thread_sort_key(session) for session in sessions]}

    def project_threads(self, project_cwd: str, limit: int = 30, cursor: str | None = None):
        return self.index.project_threads(project_cwd, limit, cursor)

    def project_file_tree(self, project_cwd: str, relative_path: str = "", limit: int = 200):
        return {"status": "ok", "project_cwd": project_cwd, "path": relative_path, "entries": []}

    def provider_status(self):
        return provider_status(self.codex_home)

    def provider_diagnostics(self, project_cwd: str = ""):
        return provider_diagnostics(self.codex_home, project_cwd)

    def provider_repair_paths(self):
        result = run_provider_path_repair(self.codex_home)
        return provider_payload(result)

    def provider_converge(self):
        result = run_provider_sync(self.codex_home)
        return provider_payload(result)

    def provider_quarantine_state(self):
        result = quarantine_state_db(self.codex_home)
        return provider_payload(result)


def provider_payload(result) -> dict[str, object]:
    return {
        "status": result.status.value if hasattr(result.status, "value") else str(result.status),
        "message": result.message,
        "target_provider": result.target_provider,
        "backup_dir": str(result.backup_dir) if result.backup_dir else "",
        "changed_session_files": result.changed_session_files,
        "sqlite_rows_updated": result.sqlite_rows_updated,
    }


def create_disposable_profile(root: Path) -> Path:
    codex_home = root / ".codex"
    codex_home.mkdir()
    (codex_home / "config.toml").write_text('model_provider = "smoke"\n', encoding="utf-8")
    write_rollout(codex_home / "sessions" / "rollout-smoke.jsonl")
    write_state_db(codex_home / "state_5.sqlite")
    return codex_home


def write_rollout(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"type": "session_meta", "payload": {"id": "smoke-thread", "cwd": PROJECT_CWD, "model_provider": "smoke", "title": "Smoke Thread"}})
        + "\n"
        + json.dumps({"type": "event_msg", "payload": {"type": "user_message", "text": "hello"}})
        + "\n",
        encoding="utf-8",
    )


def write_state_db(path: Path) -> None:
    con = sqlite3.connect(path)
    con.execute(
        "CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, cwd TEXT, model_provider TEXT, archived INTEGER, has_user_event INTEGER, updated_at_ms INTEGER, thread_source TEXT)"
    )
    con.execute("INSERT INTO threads VALUES ('smoke-thread', 'Smoke Thread', ?, 'smoke', 0, 1, 1000, NULL)", (PROJECT_CWD,))
    con.commit()
    con.close()


def post_json(url: str, payload: dict[str, object], headers: dict[str, str] | None = None) -> dict[str, object]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", **(headers or {})}, method="POST")
    with urllib.request.urlopen(request, timeout=3) as response:
        return json.loads(response.read().decode("utf-8"))


def assert_http_mutation_blocked(service: SmokeService) -> None:
    server = HelperServer("127.0.0.1", 0, service)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        try:
            post_json(f"http://127.0.0.1:{server.port}/provider/quarantine-state", {})
            raise AssertionError("dangerous route was not blocked")
        except urllib.error.HTTPError as exc:
            if exc.code != 403:
                raise
    finally:
        server.shutdown()
        thread.join(timeout=3)


def run_local_smoke(codex_home: Path) -> dict[str, object]:
    service = SmokeService(codex_home)
    diagnostics = service.provider_diagnostics(PROJECT_CWD)
    project_threads = service.project_threads(PROJECT_CWD)
    assert diagnostics["state_db"]["quick_check"] == "ok"
    assert project_threads["threads"][0]["session_id"] == "smoke-thread"
    assert_http_mutation_blocked(service)
    return {"diagnostics": diagnostics["state_db"], "project_threads": project_threads}


def run_guarded_cdp_smoke(debug_port: int) -> None:
    target = cdp.pick_page_target(cdp.list_targets(debug_port))
    script = Path("codex_session_delete/inject/renderer-inject.js").read_text(encoding="utf-8")
    guarded = """
(() => {
  const __codexSessionDeleteBridge = async (path, payload) => ({ status: "ok", message: "smoke", path, payload, threads: [] });
  window.__CODEX_SESSION_DELETE_HELPER__ = "http://127.0.0.1:0";
""" + script + "\n})();"
    cdp.evaluate_script(str(target["webSocketDebuggerUrl"]), guarded)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a disposable Codex++ history/bridge/CDP smoke check")
    parser.add_argument("--debug-port", type=int, default=0, help="Optional existing Codex CDP port for guarded renderer injection")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="codex-plus-smoke-") as temp_dir:
        codex_home = create_disposable_profile(Path(temp_dir))
        result = run_local_smoke(codex_home)
        if args.debug_port:
            run_guarded_cdp_smoke(args.debug_port)
        print(json.dumps({"status": "ok", "codex_home": str(codex_home), "result": result}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
