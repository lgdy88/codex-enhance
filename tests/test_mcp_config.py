import platform

import pytest

from codex_session_delete import mcp_config
from codex_session_delete.mcp_config import (
    all_mcp_status,
    browser_mcp_status,
    install_browser_mcp_servers,
    remove_browser_mcp_servers,
    set_mcp_server_enabled,
    server_command_args,
)


def test_install_browser_mcp_servers_preserves_unrelated_config_and_backs_up(monkeypatch, tmp_path):
    monkeypatch.setattr(mcp_config.platform, "system", lambda: "Windows")
    config = tmp_path / "config.toml"
    config.write_text(
        'model_provider = "custom"\n\n[mcp_servers.context7]\ncommand = "npx"\nargs = ["-y", "@upstash/context7-mcp"]\n',
        encoding="utf-8",
    )

    result = install_browser_mcp_servers(["chrome-devtools"], config_path=config, chrome_mode="auto-connect")
    text = config.read_text(encoding="utf-8")

    assert result.status == "ok"
    assert result.backup_path and result.backup_path.exists()
    assert 'model_provider = "custom"' in text
    assert "[mcp_servers.context7]" in text
    assert "[mcp_servers.chrome-devtools]" in text
    assert 'command = "cmd"' in text
    assert '"chrome-devtools-mcp@latest"' in text
    assert '"--autoConnect"' in text
    assert browser_mcp_status(config)[0].installed is True


def test_install_browser_mcp_servers_replaces_existing_owned_block_only(monkeypatch, tmp_path):
    monkeypatch.setattr(mcp_config.platform, "system", lambda: "Linux")
    config = tmp_path / "config.toml"
    config.write_text(
        '[mcp_servers.chrome-devtools]\ncommand = "old"\nargs = ["old"]\n\n[mcp_servers.github]\ncommand = "npx"\n',
        encoding="utf-8",
    )

    install_browser_mcp_servers(["chrome-devtools"], config_path=config, chrome_mode="browser-url", browser_url="http://127.0.0.1:9222")
    text = config.read_text(encoding="utf-8")

    assert 'command = "old"' not in text
    assert '"--browserUrl", "http://127.0.0.1:9222"' in text
    assert "[mcp_servers.github]" in text


def test_install_all_browser_mcp_servers_uses_expected_packages(monkeypatch, tmp_path):
    monkeypatch.setattr(mcp_config.platform, "system", lambda: "Linux")
    config = tmp_path / "config.toml"

    install_browser_mcp_servers(["all"], config_path=config)
    text = config.read_text(encoding="utf-8")

    assert "[mcp_servers.chrome-devtools]" in text
    assert "[mcp_servers.playwright]" in text
    assert '"chrome-devtools-mcp@latest"' in text
    assert '"@playwright/mcp@latest"' in text
    assert '"--browser=chrome"' in text
    assert '"--caps=devtools"' in text


def test_remove_browser_mcp_servers_removes_nested_owned_tables(tmp_path):
    config = tmp_path / "config.toml"
    config.write_text(
        '[mcp_servers.chrome-devtools]\ncommand = "npx"\n\n[mcp_servers.chrome-devtools.env]\nFOO = "bar"\n\n[mcp_servers.other]\ncommand = "npx"\n',
        encoding="utf-8",
    )

    remove_browser_mcp_servers(["chrome-devtools"], config_path=config)
    text = config.read_text(encoding="utf-8")

    assert "chrome-devtools" not in text
    assert "[mcp_servers.other]" in text


def test_browser_mcp_status_marks_missing_servers(tmp_path):
    status = browser_mcp_status(tmp_path / "missing.toml")

    assert [server.name for server in status] == ["chrome-devtools", "playwright"]
    assert all(server.installed is False for server in status)


def test_browser_mcp_status_detects_camel_case_browser_url(tmp_path):
    config = tmp_path / "config.toml"
    config.write_text(
        '[mcp_servers.chrome-devtools]\ncommand = "npx"\nargs = ["-y", "chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:9222"]\n',
        encoding="utf-8",
    )

    status = browser_mcp_status(config)

    assert status[0].mode == "browser-url"


def test_all_mcp_status_lists_every_configured_server(tmp_path):
    config = tmp_path / "config.toml"
    config.write_text(
        '[mcp_servers.github]\ncommand = "npx"\nenabled = false\n\n[mcp_servers.context7]\ntype = "stdio"\ncommand = "cmd"\n',
        encoding="utf-8",
    )

    status = all_mcp_status(config)

    assert [server.name for server in status] == ["context7", "github"]
    assert status[0].enabled is True
    assert status[1].enabled is False


def test_set_mcp_server_enabled_updates_existing_value(tmp_path):
    config = tmp_path / "config.toml"
    config.write_text('[mcp_servers.github]\ncommand = "npx"\nenabled = true\nargs = ["-y", "pkg"]\n', encoding="utf-8")

    result = set_mcp_server_enabled("github", False, config_path=config)
    text = config.read_text(encoding="utf-8")

    assert result.status == "ok"
    assert "enabled = false" in text
    assert 'args = ["-y", "pkg"]' in text
    assert result.servers[0].enabled is False


def test_set_mcp_server_enabled_inserts_missing_value_before_next_table(tmp_path):
    config = tmp_path / "config.toml"
    config.write_text('[mcp_servers.github]\ncommand = "npx"\n\n[mcp_servers.github.env]\nTOKEN = "secret"\n', encoding="utf-8")

    set_mcp_server_enabled("github", False, config_path=config)
    text = config.read_text(encoding="utf-8")

    assert '[mcp_servers.github]\ncommand = "npx"\nenabled = false\n\n[mcp_servers.github.env]' in text


def test_set_mcp_server_enabled_rejects_unknown_name(tmp_path):
    config = tmp_path / "config.toml"
    config.write_text('[mcp_servers.github]\ncommand = "npx"\n', encoding="utf-8")

    with pytest.raises(ValueError, match="MCP server not found"):
        set_mcp_server_enabled("missing", False, config_path=config)


def test_rejects_unknown_mcp_server(tmp_path):
    with pytest.raises(ValueError, match="Unsupported MCP server"):
        install_browser_mcp_servers(["unknown"], config_path=tmp_path / "config.toml")


def test_server_command_args_use_windows_cmd_prefix(monkeypatch):
    monkeypatch.setattr(mcp_config.platform, "system", lambda: "Windows")

    command, args = server_command_args("playwright", chrome_mode="auto-connect", browser_url="http://127.0.0.1:9222")

    assert command == "cmd"
    assert args[:3] == ["/c", "npx", "-y"]


def test_platform_module_still_available_for_monkeypatch():
    assert platform.system()
