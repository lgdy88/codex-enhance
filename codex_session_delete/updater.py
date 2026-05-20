from __future__ import annotations

import re
import hashlib
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

from codex_session_delete import __version__

DEFAULT_REPOSITORY = "lgdy88/codex-enhance"
DEFAULT_LATEST_RELEASE_URL = f"https://github.com/{DEFAULT_REPOSITORY}/releases/latest"
USER_AGENT = f"Codex++/{__version__}"
PACKAGE_MODULE_FILE = Path(__file__).resolve()


class UpdateError(RuntimeError):
    pass


@dataclass(frozen=True)
class Release:
    version: str
    url: str
    body: str
    asset_name: str | None = None
    asset_url: str | None = None
    asset_sha256: str | None = None

    @classmethod
    def from_github_payload(cls, payload: dict[str, Any]) -> "Release":
        asset = select_update_asset(payload.get("assets", []))
        asset_name = asset.get("name") if asset else ""
        digest_asset = select_digest_asset(payload.get("assets", []), asset_name)
        return cls(
            version=str(payload["tag_name"]),
            url=str(payload.get("html_url") or ""),
            body=str(payload.get("body") or ""),
            asset_name=asset.get("name") if asset else None,
            asset_url=asset.get("browser_download_url") if asset else None,
            asset_sha256=download_digest(digest_asset["browser_download_url"], asset_name) if digest_asset else None,
        )

    @classmethod
    def from_latest_release_url(cls, url: str) -> "Release":
        version = parse_latest_release_tag_url(url)
        asset = source_archive_asset_for_version(version)
        digest_url = f"{asset['browser_download_url']}.sha256"
        return cls(
            version=version,
            url=release_page_url(version),
            body="",
            asset_name=asset["name"],
            asset_url=asset["browser_download_url"],
            asset_sha256=download_digest(digest_url, asset["name"]),
        )


@dataclass(frozen=True)
class UpdateResult:
    release: Release
    installed_path: Path


def parse_version_tag(value: str) -> tuple[int, ...]:
    normalized = value.strip().lstrip("vV")
    match = re.match(r"^(\d+(?:\.\d+)*)", normalized)
    if not match:
        raise ValueError(f"Invalid version tag: {value}")
    return tuple(int(part) for part in match.group(1).split("."))


def is_newer_version(candidate: str, current: str = __version__) -> bool:
    left = parse_version_tag(candidate)
    right = parse_version_tag(current)
    length = max(len(left), len(right))
    left += (0,) * (length - len(left))
    right += (0,) * (length - len(right))
    return left > right


def parse_latest_release_tag_url(value: str) -> str:
    path = value.split("#", 1)[0].split("?", 1)[0].rstrip("/")
    marker = "/releases/tag/"
    if marker not in path:
        raise UpdateError(f"无法从 GitHub Release 地址解析版本：{value}")
    tag = path.split(marker, 1)[1].split("/", 1)[0]
    if not tag:
        raise UpdateError(f"无法从 GitHub Release 地址解析版本：{value}")
    parse_version_tag(tag)
    return tag


def normalized_release_tag(version: str) -> str:
    value = version.strip()
    if value.startswith(("v", "V")):
        return value
    return f"v{value}"


def release_page_url(version: str) -> str:
    return f"https://github.com/{DEFAULT_REPOSITORY}/releases/tag/{normalized_release_tag(version)}"


def source_archive_asset_for_version(version: str) -> dict[str, str]:
    parse_version_tag(version)
    tag = normalized_release_tag(version)
    name = "CodexPlusPlus.zip"
    return {
        "name": name,
        "browser_download_url": f"https://github.com/{DEFAULT_REPOSITORY}/releases/download/{tag}/{name}",
    }


def select_update_asset(assets: list[dict[str, Any]]) -> dict[str, str] | None:
    named_assets = [asset for asset in assets if asset.get("name") and asset.get("browser_download_url")]
    for asset in named_assets:
        if str(asset["name"]).endswith(".whl"):
            return {"name": str(asset["name"]), "browser_download_url": str(asset["browser_download_url"])}
    for asset in named_assets:
        name = str(asset["name"]).lower()
        if name.endswith((".zip", ".tar.gz", ".tgz")):
            return {"name": str(asset["name"]), "browser_download_url": str(asset["browser_download_url"])}
    return None


def select_digest_asset(assets: list[dict[str, Any]], asset_name: str) -> dict[str, str] | None:
    if not asset_name:
        return None
    expected_names = {f"{asset_name}.sha256", "SHA256SUMS", "sha256sums.txt"}
    for asset in assets:
        name = str(asset.get("name") or "")
        url = asset.get("browser_download_url")
        if name in expected_names and url:
            return {"name": name, "browser_download_url": str(url)}
    return None


def download_digest(url: str, asset_name: str = "") -> str:
    response = requests.get(url, timeout=30, headers={"User-Agent": USER_AGENT})
    response.raise_for_status()
    return parse_sha256_digest(response.text, asset_name)


def parse_sha256_digest(text: str, asset_name: str = "") -> str:
    if asset_name:
        for line in text.splitlines():
            if asset_name in line:
                match = re.search(r"\b[0-9a-fA-F]{64}\b", line)
                if match:
                    return match.group(0).lower()
    match = re.search(r"\b[0-9a-fA-F]{64}\b", text)
    if not match:
        raise UpdateError("Release 校验文件中没有合法 SHA-256 摘要。")
    return match.group(0).lower()


def fetch_latest_release(latest_release_url: str = DEFAULT_LATEST_RELEASE_URL, timeout: int = 10) -> Release:
    response = requests.get(latest_release_url, timeout=timeout, headers={"User-Agent": USER_AGENT})
    response.raise_for_status()
    return Release.from_latest_release_url(response.url)


def source_tree_root(module_file: Path = PACKAGE_MODULE_FILE) -> Path | None:
    package_dir = module_file.resolve().parent
    project_root = package_dir.parent
    if package_dir.name != "codex_session_delete":
        return None
    if not (project_root / ".git").exists():
        return None
    if not ((project_root / "pyproject.toml").exists() or (project_root / "setup.py").exists()):
        return None
    return project_root


def is_source_tree_mode() -> bool:
    return source_tree_root(PACKAGE_MODULE_FILE) is not None


def check_for_update(current_version: str = __version__) -> Release | None:
    if is_source_tree_mode():
        return None
    release = fetch_latest_release()
    if is_newer_version(release.version, current_version):
        return release
    return None


def safe_asset_name(name: str) -> str:
    cleaned = Path(name).name
    if cleaned in {"", ".", ".."}:
        raise UpdateError(f"非法 Release asset 文件名: {name}")
    return cleaned


def download_asset(url: str, name: str, download_dir: Path) -> Path:
    download_dir.mkdir(parents=True, exist_ok=True)
    path = download_dir / safe_asset_name(name)
    response = requests.get(url, stream=True, timeout=60, headers={"User-Agent": USER_AGENT})
    try:
        response.raise_for_status()
        with path.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 256):
                if chunk:
                    file.write(chunk)
    finally:
        close = getattr(response, "close", None)
        if close is not None:
            close()
    return path


def verify_asset_digest(path: Path, expected_sha256: str | None) -> None:
    if not expected_sha256:
        raise UpdateError("Release asset 缺少 SHA-256 校验文件，已拒绝自动安装。")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest.lower() != expected_sha256.lower():
        raise UpdateError("Release asset SHA-256 校验失败，已拒绝自动安装。")


def perform_update(
    release: Release,
    *,
    python_executable: str = sys.executable,
    download_dir: Path | None = None,
) -> UpdateResult:
    if not release.asset_name or not release.asset_url:
        raise UpdateError("没有可下载的 Release asset；请在 GitHub Release 中附加 wheel 或源码包。")
    if download_dir is None:
        with tempfile.TemporaryDirectory(prefix="codex-plus-update-") as temp_dir:
            return _perform_update_in_dir(release, python_executable, Path(temp_dir))
    return _perform_update_in_dir(release, python_executable, download_dir)


def _perform_update_in_dir(release: Release, python_executable: str, download_dir: Path) -> UpdateResult:
    package_path = download_asset(release.asset_url or "", release.asset_name or "", download_dir)
    verify_asset_digest(package_path, release.asset_sha256)
    subprocess.run([python_executable, "-m", "pip", "install", "--upgrade", str(package_path)], check=True)
    subprocess.run([python_executable, "-m", "codex_session_delete", "setup"], check=True, cwd=safe_setup_cwd())
    return UpdateResult(release=release, installed_path=package_path)


def safe_setup_cwd() -> Path:
    return Path.home()
