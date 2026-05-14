import json
import sys
from pathlib import Path

from codex_session_delete import chrome_native_host


def make_codex_app(tmp_path: Path) -> Path:
    app = tmp_path / "OpenAI.Codex_26.506.3741.0_x64__abc" / "app"
    scripts = app / "resources" / "plugins" / "openai-bundled" / "plugins" / "chrome" / "scripts"
    host_dir = app / "resources" / "plugins" / "openai-bundled" / "plugins" / "chrome" / "extension-host" / "windows" / "x64"
    scripts.mkdir(parents=True)
    host_dir.mkdir(parents=True)
    (scripts / "extension-id.json").write_text(
        json.dumps({"extensionId": "abc123", "extensionHostName": "com.openai.codexextension"}),
        encoding="utf-8",
    )
    (host_dir / "extension-host.exe").write_bytes(b"native-host")
    return app


def test_repair_chrome_native_host_writes_manifest_and_copies_host(monkeypatch, tmp_path):
    app = make_codex_app(tmp_path)
    local = tmp_path / "LocalAppData"
    reg_calls = []
    monkeypatch.setattr(chrome_native_host.sys, "platform", "win32")
    monkeypatch.setattr(chrome_native_host, "_architecture_name", lambda: "x64")
    monkeypatch.setenv("LOCALAPPDATA", str(local))
    monkeypatch.setattr(
        chrome_native_host.subprocess,
        "run",
        lambda command, **kwargs: reg_calls.append((command, kwargs)),
    )

    result = chrome_native_host.repair_chrome_native_host(app)

    assert result.status == "repaired"
    assert result.host_path == local / "OpenAI" / "Codex" / "chrome-native-host" / "extension-host.exe"
    assert result.host_path.read_bytes() == b"native-host"
    assert result.manifest_path == local / "OpenAI" / "extension" / "com.openai.codexextension.json"
    manifest = json.loads(result.manifest_path.read_text(encoding="utf-8"))
    assert manifest["name"] == "com.openai.codexextension"
    assert manifest["path"] == str(result.host_path)
    assert manifest["allowed_origins"] == ["chrome-extension://abc123/"]
    assert reg_calls[0][0][:4] == [
        "reg",
        "add",
        r"HKCU\Software\Google\Chrome\NativeMessagingHosts\com.openai.codexextension",
        "/ve",
    ]
    assert str(result.manifest_path) in reg_calls[0][0]


def test_repair_chrome_native_host_accepts_custom_host_path(monkeypatch, tmp_path):
    app = make_codex_app(tmp_path)
    custom_host = tmp_path / "host" / "extension-host.exe"
    monkeypatch.setattr(chrome_native_host.sys, "platform", "win32")
    monkeypatch.setattr(chrome_native_host, "_architecture_name", lambda: "x64")
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    monkeypatch.setattr(chrome_native_host.subprocess, "run", lambda *args, **kwargs: None)

    result = chrome_native_host.repair_chrome_native_host(app, custom_host)

    assert result.host_path == custom_host
    assert custom_host.read_bytes() == b"native-host"


def test_copy_host_binary_reuses_matching_existing_host(monkeypatch, tmp_path):
    source = tmp_path / "source.exe"
    destination = tmp_path / "destination.exe"
    source.write_bytes(b"same")
    destination.write_bytes(b"same")
    monkeypatch.setattr(
        chrome_native_host.shutil,
        "copyfile",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("copy should be skipped")),
    )

    assert chrome_native_host.copy_host_binary(source, destination) == chrome_native_host.sha256_file(source)


def test_copy_host_binary_reports_locked_destination(monkeypatch, tmp_path):
    source = tmp_path / "source.exe"
    destination = tmp_path / "destination.exe"
    source.write_bytes(b"new")
    destination.write_bytes(b"old")
    monkeypatch.setattr(
        chrome_native_host.shutil,
        "copyfile",
        lambda *args, **kwargs: (_ for _ in ()).throw(PermissionError("locked")),
    )

    try:
        chrome_native_host.copy_host_binary(source, destination)
    except RuntimeError as exc:
        assert "close Chrome and Codex" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")


def test_repair_chrome_native_host_skips_when_codex_app_missing(monkeypatch):
    monkeypatch.setattr(chrome_native_host, "resolve_codex_app_dir", lambda app_dir=None: None)

    result = chrome_native_host.repair_chrome_native_host()

    assert result.status == "skipped"


def test_default_manifest_path_uses_platform_locations(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "Local"))
    monkeypatch.setattr(chrome_native_host.sys, "platform", "win32")
    assert chrome_native_host.default_manifest_path("host") == tmp_path / "Local" / "OpenAI" / "extension" / "host.json"

    monkeypatch.setattr(chrome_native_host.sys, "platform", "darwin")
    assert chrome_native_host.default_manifest_path("host") == Path.home() / "Library/Application Support/Google/Chrome/NativeMessagingHosts" / "host.json"

    monkeypatch.setattr(chrome_native_host.sys, "platform", "linux")
    assert chrome_native_host.default_manifest_path("host") == Path.home() / ".config/google-chrome/NativeMessagingHosts" / "host.json"


def test_platform_name_rejects_unknown_platform(monkeypatch):
    monkeypatch.setattr(chrome_native_host.sys, "platform", "plan9")

    try:
        chrome_native_host._platform_name()
    except RuntimeError as exc:
        assert "Unsupported platform" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")
