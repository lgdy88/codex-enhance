from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from codex_session_delete.app_paths import codex_user_data_dir, resolve_codex_app_dir


EXTENSION_ID_FILE = Path("resources/plugins/openai-bundled/plugins/chrome/scripts/extension-id.json")
HOST_RELATIVE_DIR = Path("resources/plugins/openai-bundled/plugins/chrome/extension-host")
MANIFEST_DIR = Path("OpenAI/extension")
HOST_INSTALL_DIR_NAME = "chrome-native-host"


@dataclass(frozen=True)
class ChromeNativeHostRepairResult:
    status: str
    message: str
    manifest_path: Path | None = None
    host_path: Path | None = None
    extension_id: str | None = None
    extension_host_name: str | None = None
    source_host_path: Path | None = None
    host_sha256: str | None = None


def _platform_name() -> str:
    if sys.platform == "win32":
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    if sys.platform.startswith("linux"):
        return "linux"
    raise RuntimeError(f"Unsupported platform for Chrome native host repair: {sys.platform}")


def _host_executable_name() -> str:
    return "extension-host.exe" if sys.platform == "win32" else "extension-host"


def _architecture_name() -> str:
    machine = getattr(sys, "maxsize", 0)
    # The Codex bundle currently ships x64 and arm64 hosts. Windows on ARM can
    # still report AMD64 when running an x64 Python, so prefer PROCESSOR_ARCHITECTURE.
    arch = ""
    if sys.platform == "win32":
        import os

        arch = (os.environ.get("PROCESSOR_ARCHITECTURE") or "").lower()
    if "arm64" in arch or "aarch64" in arch:
        return "arm64"
    if machine > 2**32:
        return "x64"
    raise RuntimeError("Unsupported architecture for Chrome native host repair")


def load_extension_metadata(app_dir: Path) -> dict[str, str]:
    path = app_dir / EXTENSION_ID_FILE
    data = json.loads(path.read_text(encoding="utf-8"))
    extension_id = data.get("extensionId")
    extension_host_name = data.get("extensionHostName")
    if not isinstance(extension_id, str) or not extension_id:
        raise RuntimeError(f"Missing extensionId in {path}")
    if not isinstance(extension_host_name, str) or not extension_host_name:
        raise RuntimeError(f"Missing extensionHostName in {path}")
    return {"extensionId": extension_id, "extensionHostName": extension_host_name}


def bundled_host_path(app_dir: Path) -> Path:
    return app_dir / HOST_RELATIVE_DIR / _platform_name() / _architecture_name() / _host_executable_name()


def default_installed_host_path() -> Path:
    return codex_user_data_dir() / HOST_INSTALL_DIR_NAME / _host_executable_name()


def default_manifest_path(extension_host_name: str) -> Path:
    if sys.platform == "win32":
        import os

        local = os.environ.get("LOCALAPPDATA")
        root = Path(local) if local else Path.home() / "AppData" / "Local"
        return root / MANIFEST_DIR / f"{extension_host_name}.json"
    if sys.platform == "darwin":
        return Path.home() / "Library/Application Support/Google/Chrome/NativeMessagingHosts" / f"{extension_host_name}.json"
    return Path.home() / ".config/google-chrome/NativeMessagingHosts" / f"{extension_host_name}.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_host_binary(source: Path, destination: Path) -> str:
    if not source.is_file():
        raise RuntimeError(f"Bundled Chrome native host not found: {source}")
    source_hash = sha256_file(source)
    if destination.is_file():
        destination_hash = sha256_file(destination)
        if source_hash == destination_hash:
            return destination_hash
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copyfile(source, destination)
    except PermissionError as exc:
        raise RuntimeError("Unable to replace Chrome native host; close Chrome and Codex, then retry") from exc
    if sys.platform != "win32":
        destination.chmod(destination.stat().st_mode | 0o755)
    destination_hash = sha256_file(destination)
    if source_hash != destination_hash:
        raise RuntimeError("Copied Chrome native host hash mismatch")
    return destination_hash


def write_manifest(manifest_path: Path, extension_host_name: str, extension_id: str, host_path: Path) -> None:
    manifest = {
        "name": extension_host_name,
        "description": "Codex chrome native messaging host",
        "type": "stdio",
        "path": str(host_path),
        "allowed_origins": [f"chrome-extension://{extension_id}/"],
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def register_windows_manifest(extension_host_name: str, manifest_path: Path) -> None:
    if sys.platform != "win32":
        return
    key = rf"HKCU\Software\Google\Chrome\NativeMessagingHosts\{extension_host_name}"
    subprocess.run(
        ["reg", "add", key, "/ve", "/t", "REG_SZ", "/d", str(manifest_path), "/f"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def repair_chrome_native_host(app_dir: Path | None = None, host_path: Path | None = None) -> ChromeNativeHostRepairResult:
    resolved_app_dir = resolve_codex_app_dir(app_dir)
    if resolved_app_dir is None:
        return ChromeNativeHostRepairResult("skipped", "Codex App installation was not found")

    metadata = load_extension_metadata(resolved_app_dir)
    source_host = bundled_host_path(resolved_app_dir)
    installed_host = host_path or default_installed_host_path()
    host_hash = copy_host_binary(source_host, installed_host)
    manifest_path = default_manifest_path(metadata["extensionHostName"])
    write_manifest(manifest_path, metadata["extensionHostName"], metadata["extensionId"], installed_host)
    register_windows_manifest(metadata["extensionHostName"], manifest_path)

    return ChromeNativeHostRepairResult(
        "repaired",
        "Chrome native messaging host manifest repaired",
        manifest_path=manifest_path,
        host_path=installed_host,
        extension_id=metadata["extensionId"],
        extension_host_name=metadata["extensionHostName"],
        source_host_path=source_host,
        host_sha256=host_hash,
    )
