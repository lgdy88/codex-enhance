from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Protocol

from codex_session_delete.bridge_routes import BridgeRoute, BridgeRouteContext, dispatch_route, route_for_path
from codex_session_delete.models import DeleteResult, DeleteStatus, ExportResult, ExportStatus, SessionRef

TRUSTED_BROWSER_ORIGIN = "http://127.0.0.1"


class DeleteService(Protocol):
    def delete(self, session: SessionRef) -> DeleteResult: ...
    def undo(self, token: str) -> DeleteResult: ...
    def find_archived_thread_by_title(self, title: str) -> SessionRef | None: ...
    def move_thread_workspace(self, session: SessionRef, target_cwd: str) -> dict[str, object]: ...
    def thread_sort_key(self, session: SessionRef) -> dict[str, object]: ...
    def thread_sort_keys(self, sessions: list[SessionRef]) -> dict[str, object]: ...
    def project_threads(self, project_cwd: str, limit: int = 30, cursor: str | None = None) -> dict[str, object]: ...
    def project_file_tree(self, project_cwd: str, relative_path: str = "", limit: int = 200) -> dict[str, object]: ...
    def provider_status(self) -> dict[str, object]: ...
    def provider_diagnostics(self, project_cwd: str = "") -> dict[str, object]: ...
    def provider_repair_paths(self) -> dict[str, object]: ...
    def provider_converge(self) -> dict[str, object]: ...
    def provider_quarantine_state(self) -> dict[str, object]: ...


class ExportService(Protocol):
    def export(self, session: SessionRef) -> ExportResult: ...


class HelperServer(ThreadingHTTPServer):
    def __init__(
        self,
        host: str,
        port: int,
        service: DeleteService,
        export_service: ExportService | None = None,
        *,
        allow_http_mutation: bool = False,
        http_mutation_token: str | None = None,
    ):
        self.service = service
        self.export_service = export_service
        self.allow_http_mutation = allow_http_mutation
        self.http_mutation_token = http_mutation_token
        super().__init__((host, port), _Handler)

    @property
    def port(self) -> int:
        return int(self.server_address[1])


class _Handler(BaseHTTPRequestHandler):
    server: HelperServer

    def do_OPTIONS(self) -> None:
        self._send_json({"ok": True})

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json({"ok": True})
            return
        self._send_json({"error": "not found"}, status=404)

    def do_POST(self) -> None:
        try:
            payload = self._read_json()
            route = route_for_path(self.path)
            if route is None:
                self._send_json({"error": "not found"}, status=404)
                return
            if not self._is_http_route_authorized(route):
                self._send_json({"error": "forbidden"}, status=403)
                return
            context = BridgeRouteContext(self.server.service, self.server.export_service)
            self._send_json(dispatch_route(context, self.path, payload, transport="http"))
        except Exception as exc:
            session_id = str(payload.get("session_id", "")) if "payload" in locals() else ""
            if self.path == "/export-markdown":
                result = ExportResult(ExportStatus.FAILED, session_id, str(exc))
                self._send_json(result.to_dict(), status=400)
                return
            result = DeleteResult(DeleteStatus.FAILED, session_id, str(exc))
            self._send_json(result.to_dict(), status=400)

    def log_message(self, format: str, *args: object) -> None:
        return

    def _read_json(self) -> dict[str, object]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw)

    def _is_mutation_authorized(self) -> bool:
        if self.server.allow_http_mutation:
            return True
        token = self.server.http_mutation_token
        return bool(token and self.headers.get("X-Codex-Session-Delete-Token") == token)

    def _is_http_route_authorized(self, route: BridgeRoute) -> bool:
        if route.http_access == "public":
            return True
        if route.http_access == "disabled":
            return False
        return self._is_mutation_authorized()

    def _send_json(self, payload: dict[str, object], status: int = 200) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", TRUSTED_BROWSER_ORIGIN)
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Codex-Session-Delete-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
