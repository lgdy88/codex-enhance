from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from codex_session_delete.markdown_exporter import MarkdownExportService
from codex_session_delete.mcp_config import all_mcp_status, install_browser_mcp_servers, remove_browser_mcp_servers, set_mcp_server_enabled
from codex_session_delete.models import DeleteStatus, SessionRef
from codex_session_delete.settings_store import SettingsStore


RouteHandler = Callable[["BridgeRouteContext", dict[str, object]], dict[str, object]]
PayloadValidator = Callable[[dict[str, object]], str]


@dataclass(frozen=True)
class BridgeRoute:
    path: str
    kind: str
    payload_validator: PayloadValidator
    handler: RouteHandler
    http_access: str = "token"
    cdp_allowed: bool = True
    runtime_required: bool = False


@dataclass(frozen=True)
class BridgeRouteContext:
    service: Any
    export_service: MarkdownExportService | None = None
    runtime: Any = None


def dispatch_route(context: BridgeRouteContext, path: str, payload: dict[str, object], *, transport: str) -> dict[str, object]:
    route = ROUTES_BY_PATH.get(path)
    if route is None:
        return unknown_route(path, payload)
    if transport == "cdp" and not route.cdp_allowed:
        return forbidden_route(path)
    if route.runtime_required and context.runtime is None:
        return unknown_route(path, payload)
    validation_error = route.payload_validator(payload)
    if validation_error:
        return validation_failed(path, payload, validation_error)
    return route.handler(context, payload)


def route_for_path(path: str) -> BridgeRoute | None:
    return ROUTES_BY_PATH.get(path)


def unknown_route(path: str, payload: dict[str, object]) -> dict[str, object]:
    return {"status": DeleteStatus.FAILED.value, "session_id": str(payload.get("session_id", "")), "message": f"Unknown bridge path: {path}"}


def forbidden_route(path: str) -> dict[str, object]:
    return {"status": DeleteStatus.FAILED.value, "message": f"Bridge path not allowed: {path}"}


def validation_failed(path: str, payload: dict[str, object], message: str) -> dict[str, object]:
    return {"status": DeleteStatus.FAILED.value, "session_id": str(payload.get("session_id", "")), "message": f"Invalid payload for {path}: {message}"}


def validate_any(payload: dict[str, object]) -> str:
    return ""


def validate_session(payload: dict[str, object]) -> str:
    return require_non_empty_string(payload, "session_id")


def validate_undo(payload: dict[str, object]) -> str:
    return require_non_empty_string(payload, "undo_token")


def validate_move_thread_workspace(payload: dict[str, object]) -> str:
    return validate_session(payload) or require_non_empty_string(payload, "target_cwd")


def validate_thread_sort_keys(payload: dict[str, object]) -> str:
    sessions = payload.get("sessions")
    if not isinstance(sessions, list):
        return "sessions must be a list"
    for index, item in enumerate(sessions):
        if not isinstance(item, dict):
            return f"sessions[{index}] must be an object"
        message = require_non_empty_string(item, "session_id")
        if message:
            return f"sessions[{index}].{message}"
    return ""


def validate_mcp_name(payload: dict[str, object]) -> str:
    return require_non_empty_string(payload, "name")


def require_non_empty_string(payload: dict[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        return f"{key} is required"
    return ""


def route_settings_get(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return SettingsStore().load().to_dict()


def route_settings_set(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return SettingsStore().update(payload).to_dict()


def route_user_scripts_list(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.runtime.user_scripts.inventory()


def route_user_scripts_set_enabled(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    context.runtime.user_scripts.set_global_enabled(bool(payload.get("enabled", True)))
    return context.runtime.user_scripts.inventory()


def route_user_scripts_set_script_enabled(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    context.runtime.user_scripts.set_script_enabled(str(payload.get("key", "")), bool(payload.get("enabled", True)))
    return context.runtime.user_scripts.inventory()


def route_user_scripts_reload(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.runtime.reload_user_scripts()


def route_devtools_open(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.runtime.open_devtools()


def route_backend_status(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.runtime.backend_status()


def route_backend_repair(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.runtime.repair_backend()


def route_mcp_status(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return {"status": "ok", "message": "MCP 配置已读取", "servers": [server.to_dict() for server in all_mcp_status()]}


def route_mcp_set_enabled(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return set_mcp_server_enabled(str(payload.get("name", "")), bool(payload.get("enabled", True))).to_dict()


def route_mcp_install(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    servers = payload.get("servers", ["all"])
    selected = [str(item) for item in servers] if isinstance(servers, list) else ["all"]
    return install_browser_mcp_servers(
        selected,
        chrome_mode=str(payload.get("chromeMode", "auto-connect")),
        browser_url=str(payload.get("browserUrl", "http://127.0.0.1:9222")),
    ).to_dict()


def route_mcp_remove(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    servers = payload.get("servers", ["all"])
    selected = [str(item) for item in servers] if isinstance(servers, list) else ["all"]
    return remove_browser_mcp_servers(selected).to_dict()


def route_delete(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.service.delete(session_ref(payload)).to_dict()


def route_undo(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.service.undo(str(payload.get("undo_token", ""))).to_dict()


def route_export_markdown(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    if context.export_service is None:
        return {"status": "failed", "session_id": str(payload.get("session_id", "")), "message": "Markdown 导出不可用"}
    return context.export_service.export(session_ref(payload)).to_dict()


def route_archived_thread(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    session = context.service.find_archived_thread_by_title(str(payload.get("title", "")))
    return {"session_id": session.session_id, "title": session.title} if session else {"session_id": "", "title": ""}


def route_move_thread_workspace(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.service.move_thread_workspace(session_ref(payload), str(payload.get("target_cwd", "")))


def route_thread_sort_key(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.service.thread_sort_key(session_ref(payload))


def route_thread_sort_keys(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    raw_sessions = payload.get("sessions", [])
    sessions = [session_ref(item) for item in raw_sessions if isinstance(item, dict)] if isinstance(raw_sessions, list) else []
    return context.service.thread_sort_keys(sessions)


def route_project_threads(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    cursor = payload.get("cursor")
    return context.service.project_threads(str(payload.get("project_cwd", "")), bounded_int(payload.get("limit"), 30), str(cursor) if cursor else None)


def route_project_file_tree(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.service.project_file_tree(str(payload.get("project_cwd", "")), str(payload.get("path", "")), bounded_int(payload.get("limit"), 200))


def route_provider_status(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.service.provider_status()


def route_provider_diagnostics(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.service.provider_diagnostics(str(payload.get("project_cwd", "")))


def route_provider_repair_paths(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.service.provider_repair_paths()


def route_provider_converge(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.service.provider_converge()


def route_provider_quarantine_state(context: BridgeRouteContext, payload: dict[str, object]) -> dict[str, object]:
    return context.service.provider_quarantine_state()


def session_ref(payload: dict[str, object]) -> SessionRef:
    return SessionRef(session_id=str(payload.get("session_id", "")), title=str(payload.get("title", "")))


def bounded_int(value: object, default: int) -> int:
    try:
        return int(value or default)
    except (TypeError, ValueError):
        return default


ROUTES: tuple[BridgeRoute, ...] = (
    BridgeRoute("/settings/get", "read", validate_any, route_settings_get, runtime_required=True),
    BridgeRoute("/settings/set", "mutation", validate_any, route_settings_set, runtime_required=True),
    BridgeRoute("/user-scripts/list", "read", validate_any, route_user_scripts_list, runtime_required=True),
    BridgeRoute("/user-scripts/set-enabled", "mutation", validate_any, route_user_scripts_set_enabled, runtime_required=True),
    BridgeRoute("/user-scripts/set-script-enabled", "mutation", validate_any, route_user_scripts_set_script_enabled, runtime_required=True),
    BridgeRoute("/user-scripts/reload", "mutation", validate_any, route_user_scripts_reload, runtime_required=True),
    BridgeRoute("/devtools/open", "mutation", validate_any, route_devtools_open, runtime_required=True),
    BridgeRoute("/backend/status", "read", validate_any, route_backend_status, runtime_required=True),
    BridgeRoute("/backend/repair", "mutation", validate_any, route_backend_repair, runtime_required=True),
    BridgeRoute("/mcp/status", "read", validate_any, route_mcp_status, runtime_required=True),
    BridgeRoute("/mcp/set-enabled", "mutation", validate_mcp_name, route_mcp_set_enabled, runtime_required=True),
    BridgeRoute("/mcp/install", "mutation", validate_any, route_mcp_install, runtime_required=True),
    BridgeRoute("/mcp/remove", "mutation", validate_any, route_mcp_remove, runtime_required=True),
    BridgeRoute("/delete", "dangerous", validate_session, route_delete),
    BridgeRoute("/undo", "dangerous", validate_undo, route_undo),
    BridgeRoute("/export-markdown", "mutation", validate_session, route_export_markdown),
    BridgeRoute("/archived-thread", "read", validate_any, route_archived_thread),
    BridgeRoute("/move-thread-workspace", "mutation", validate_move_thread_workspace, route_move_thread_workspace),
    BridgeRoute("/thread-sort-key", "read", validate_session, route_thread_sort_key),
    BridgeRoute("/thread-sort-keys", "read", validate_thread_sort_keys, route_thread_sort_keys),
    BridgeRoute("/project-threads", "read", validate_any, route_project_threads),
    BridgeRoute("/project-file-tree", "read", validate_any, route_project_file_tree),
    BridgeRoute("/provider/status", "read", validate_any, route_provider_status),
    BridgeRoute("/provider/diagnostics", "read", validate_any, route_provider_diagnostics),
    BridgeRoute("/provider/repair-paths", "mutation", validate_any, route_provider_repair_paths),
    BridgeRoute("/provider/converge", "dangerous", validate_any, route_provider_converge),
    BridgeRoute("/provider/quarantine-state", "dangerous", validate_any, route_provider_quarantine_state),
)

ROUTES_BY_PATH = {route.path: route for route in ROUTES}
