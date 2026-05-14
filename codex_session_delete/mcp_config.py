from __future__ import annotations

import json
import platform
import re
import shutil
import tomllib
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


BROWSER_MCP_SERVERS = ("chrome-devtools", "playwright")
DEFAULT_BROWSER_URL = "http://127.0.0.1:9222"


@dataclass(frozen=True)
class McpServerStatus:
    name: str
    installed: bool
    enabled: bool
    command: str
    args: list[str]
    mode: str
    server_type: str = ""
    managed: bool = False

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "installed": self.installed,
            "enabled": self.enabled,
            "command": self.command,
            "args": self.args,
            "mode": self.mode,
            "serverType": self.server_type,
            "managed": self.managed,
        }


@dataclass(frozen=True)
class McpConfigResult:
    status: str
    message: str
    config_path: Path
    backup_path: Path | None = None
    servers: tuple[McpServerStatus, ...] = ()

    def to_dict(self) -> dict[str, object]:
        return {
            "status": self.status,
            "message": self.message,
            "configPath": str(self.config_path),
            "backupPath": str(self.backup_path) if self.backup_path else "",
            "servers": [server.to_dict() for server in self.servers],
        }


def default_config_path() -> Path:
    return Path.home() / ".codex" / "config.toml"


def install_browser_mcp_servers(
    names: list[str],
    *,
    config_path: Path | None = None,
    chrome_mode: str = "auto-connect",
    browser_url: str = DEFAULT_BROWSER_URL,
    backup: bool = True,
) -> McpConfigResult:
    path = config_path or default_config_path()
    normalized = normalize_server_names(names)
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    next_text = text
    for name in normalized:
        next_text = upsert_server_block(next_text, name, chrome_mode=chrome_mode, browser_url=browser_url)
    backup_path = write_config_if_changed(path, text, next_text, backup=backup)
    servers = browser_mcp_status(path)
    return McpConfigResult("ok", "浏览器 MCP 配置已写入，请重启 Codex 让 MCP 生效。", path, backup_path, servers)


def remove_browser_mcp_servers(
    names: list[str],
    *,
    config_path: Path | None = None,
    backup: bool = True,
) -> McpConfigResult:
    path = config_path or default_config_path()
    normalized = normalize_server_names(names)
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    next_text = text
    for name in normalized:
        next_text = remove_server_block(next_text, name)
    backup_path = write_config_if_changed(path, text, next_text, backup=backup)
    servers = browser_mcp_status(path)
    return McpConfigResult("ok", "浏览器 MCP 配置已移除，请重启 Codex 让 MCP 生效。", path, backup_path, servers)


def browser_mcp_status(config_path: Path | None = None) -> tuple[McpServerStatus, ...]:
    path = config_path or default_config_path()
    raw_servers = load_mcp_servers(path)
    return tuple(server_status(name, raw_servers.get(name, {})) for name in BROWSER_MCP_SERVERS)


def all_mcp_status(config_path: Path | None = None) -> tuple[McpServerStatus, ...]:
    path = config_path or default_config_path()
    raw_servers = load_mcp_servers(path)
    return tuple(server_status(name, raw_servers[name]) for name in sorted(raw_servers, key=str.lower))


def set_mcp_server_enabled(
    name: str,
    enabled: bool,
    *,
    config_path: Path | None = None,
    backup: bool = True,
) -> McpConfigResult:
    path = config_path or default_config_path()
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    raw_servers = load_mcp_servers(path)
    if name not in raw_servers:
        raise ValueError(f"MCP server not found: {name}")
    next_text = set_server_enabled_in_text(text, name, enabled)
    backup_path = write_config_if_changed(path, text, next_text, backup=backup)
    servers = all_mcp_status(path)
    return McpConfigResult("ok", "MCP 配置已更新；当前 Codex 会话通常需要重启或新会话才会重新加载。", path, backup_path, servers)


def normalize_server_names(names: list[str]) -> tuple[str, ...]:
    selected = BROWSER_MCP_SERVERS if not names or "all" in names else tuple(names)
    unknown = [name for name in selected if name not in BROWSER_MCP_SERVERS]
    if unknown:
        raise ValueError(f"Unsupported MCP server: {', '.join(unknown)}")
    return tuple(dict.fromkeys(selected))


def load_mcp_servers(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError:
        return {}
    servers = data.get("mcp_servers", {})
    return servers if isinstance(servers, dict) else {}


def server_status(name: str, raw: object) -> McpServerStatus:
    data = raw if isinstance(raw, dict) else {}
    args = data.get("args", [])
    normalized_args = [str(arg) for arg in args] if isinstance(args, list) else []
    installed = bool(data)
    enabled = bool(data.get("enabled", True)) if installed else False
    return McpServerStatus(
        name=name,
        installed=installed,
        enabled=enabled,
        command=str(data.get("command", "")) if installed else "",
        args=normalized_args,
        mode=detect_mode(name, normalized_args),
        server_type=str(data.get("type", "stdio")) if installed else "",
        managed=name in BROWSER_MCP_SERVERS,
    )


def detect_mode(name: str, args: list[str]) -> str:
    if name == "chrome-devtools":
        if any(arg == "--autoConnect" for arg in args):
            return "auto-connect"
        if "--browserUrl" in args or any(arg.startswith("--browser-url=") for arg in args):
            return "browser-url"
        return "default" if args else "missing"
    if name == "playwright":
        return "chrome" if any(arg == "--browser=chrome" for arg in args) else ("default" if args else "missing")
    return "unknown"


def upsert_server_block(text: str, name: str, *, chrome_mode: str, browser_url: str) -> str:
    cleaned = remove_server_block(text, name).rstrip()
    block = server_block(name, chrome_mode=chrome_mode, browser_url=browser_url)
    return f"{cleaned}\n\n{block}\n" if cleaned else f"{block}\n"


def remove_server_block(text: str, name: str) -> str:
    lines = text.splitlines(keepends=True)
    output: list[str] = []
    skipping = False
    for line in lines:
        header = parse_table_header(line)
        if header is not None:
            skipping = table_matches_server(header, name)
        if not skipping:
            output.append(line)
    return "".join(output).rstrip() + ("\n" if output else "")


def set_server_enabled_in_text(text: str, name: str, enabled: bool) -> str:
    lines = text.splitlines(keepends=True)
    output: list[str] = []
    pending_blank: list[str] = []
    inside_main = False
    found_table = False
    wrote_enabled = False
    for line in lines:
        header = parse_table_header(line)
        if header is not None:
            if inside_main and not wrote_enabled:
                output.append(enabled_line(enabled, line))
                wrote_enabled = True
            output.extend(pending_blank)
            pending_blank = []
            inside_main = table_is_server_main(header, name)
            found_table = found_table or inside_main
            wrote_enabled = False if inside_main else wrote_enabled
        if inside_main and not wrote_enabled and not line.strip():
            pending_blank.append(line)
            continue
        if inside_main and re.match(r"^\s*enabled\s*=", line):
            output.append(enabled_line(enabled, line))
            output.extend(pending_blank)
            pending_blank = []
            wrote_enabled = True
            continue
        output.extend(pending_blank)
        pending_blank = []
        output.append(line)
    if inside_main and not wrote_enabled:
        output.append(enabled_line(enabled, ""))
    output.extend(pending_blank)
    if not found_table:
        raise ValueError(f"MCP server not found: {name}")
    return "".join(output)


def enabled_line(enabled: bool, reference_line: str) -> str:
    newline = "\r\n" if reference_line.endswith("\r\n") else "\n"
    return f"enabled = {str(enabled).lower()}{newline}"


def parse_table_header(line: str) -> str | None:
    match = re.match(r"^\s*\[([^\]]+)]\s*(?:#.*)?$", line)
    return match.group(1).strip() if match else None


def table_matches_server(header: str, name: str) -> bool:
    bare = f"mcp_servers.{name}"
    quoted = f'mcp_servers."{name}"'
    return header == bare or header.startswith(f"{bare}.") or header == quoted or header.startswith(f"{quoted}.")


def table_is_server_main(header: str, name: str) -> bool:
    return header == f"mcp_servers.{name}" or header == f'mcp_servers."{name}"'


def server_block(name: str, *, chrome_mode: str, browser_url: str) -> str:
    command, args = server_command_args(name, chrome_mode=chrome_mode, browser_url=browser_url)
    lines = [
        f"[mcp_servers.{name}]",
        f"command = {toml_string(command)}",
        f"args = {toml_array(args)}",
        "enabled = true",
        "startup_timeout_sec = 20",
    ]
    if is_windows():
        lines.append('env = { SystemRoot = "C:\\\\Windows", PROGRAMFILES = "C:\\\\Program Files" }')
    return "\n".join(lines)


def server_command_args(name: str, *, chrome_mode: str, browser_url: str) -> tuple[str, list[str]]:
    prefix = windows_npx_prefix() if is_windows() else ("npx", ["-y"])
    if name == "chrome-devtools":
        return prefix[0], [*prefix[1], "chrome-devtools-mcp@latest", *chrome_mode_args(chrome_mode, browser_url)]
    if name == "playwright":
        return prefix[0], [*prefix[1], "@playwright/mcp@latest", "--browser=chrome", "--caps=devtools"]
    raise ValueError(f"Unsupported MCP server: {name}")


def chrome_mode_args(mode: str, browser_url: str) -> list[str]:
    if mode == "auto-connect":
        return ["--autoConnect"]
    if mode == "browser-url":
        return ["--browserUrl", browser_url or DEFAULT_BROWSER_URL]
    if mode == "default":
        return []
    raise ValueError(f"Unsupported chrome mode: {mode}")


def windows_npx_prefix() -> tuple[str, list[str]]:
    return "cmd", ["/c", "npx", "-y"]


def is_windows() -> bool:
    return platform.system().lower() == "windows"


def toml_string(value: str) -> str:
    return json.dumps(value)


def toml_array(values: list[str]) -> str:
    return "[" + ", ".join(toml_string(value) for value in values) + "]"


def write_config_if_changed(path: Path, current: str, next_text: str, *, backup: bool) -> Path | None:
    if current == next_text:
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    backup_path = backup_config(path) if backup and path.exists() else None
    temp_path = path.with_name(f"{path.name}.tmp")
    temp_path.write_text(next_text, encoding="utf-8")
    temp_path.replace(path)
    return backup_path


def backup_config(path: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    backup_path = path.with_name(f"{path.name}.codex-plus.{timestamp}.bak")
    shutil.copy2(path, backup_path)
    return backup_path
