from __future__ import annotations

from pathlib import Path

from codex_session_delete.history_index import RepairPlanner
from codex_session_delete.provider_sync import default_codex_home, read_current_provider


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
    packet = RepairPlanner(home).diagnostics(project_cwd)
    return {
        "status": "ok" if home.exists() else "missing",
        "current_provider": target_provider,
        "codex_home": str(home),
        "project_cwd": project_cwd or "",
        "rollout": packet["rollout"],
        "sqlite": packet["sqlite"],
        "state_db": packet["state_db"],
        "global_state": packet["global_state"],
        "path_repair_pending": packet["path_repair_pending"],
        "provider_converge_pending": packet["provider_converge_pending"],
        "repair_plan": packet["repair_plan"],
        "warning": "provider 收敛只保证列表可见，不保证跨账号/跨 provider 的 encrypted_content 能续聊。",
    }
