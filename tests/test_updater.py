import json
from pathlib import Path

import pytest

from codex_session_delete import updater


def test_parse_version_tag_accepts_v_prefix_and_suffix():
    assert updater.parse_version_tag("v1.2.3") == (1, 2, 3)
    assert updater.parse_version_tag("1.2.3") == (1, 2, 3)
    assert updater.parse_version_tag("v1.2.3-beta.1") == (1, 2, 3)


def test_is_newer_version_compares_numeric_segments():
    assert updater.is_newer_version("v1.0.10", "1.0.4") is True
    assert updater.is_newer_version("v1.0.4", "1.0.4") is False
    assert updater.is_newer_version("v1.0.3", "1.0.4") is False


def test_release_from_github_payload_selects_wheel_asset():
    release = updater.Release.from_github_payload(
        {
            "tag_name": "v1.0.5",
            "html_url": "https://github.com/lgdy88/codex-enhance/releases/tag/v1.0.5",
            "body": "fixes",
            "prerelease": False,
            "draft": False,
            "assets": [
                {"name": "CodexPlusPlus.zip", "browser_download_url": "https://example.test/source.zip"},
                {"name": "codex_session_delete-1.0.5-py3-none-any.whl", "browser_download_url": "https://example.test/pkg.whl"},
            ],
        }
    )

    assert release.version == "v1.0.5"
    assert release.asset_name == "codex_session_delete-1.0.5-py3-none-any.whl"
    assert release.asset_url == "https://example.test/pkg.whl"


def test_release_from_github_payload_selects_matching_sha256(monkeypatch):
    seen = {}

    def fake_download_digest(url, asset_name=""):
        seen["url"] = url
        seen["asset_name"] = asset_name
        return "a" * 64

    monkeypatch.setattr(updater, "download_digest", fake_download_digest)

    release = updater.Release.from_github_payload(
        {
            "tag_name": "v1.0.5",
            "assets": [
                {"name": "pkg.whl", "browser_download_url": "https://example.test/pkg.whl"},
                {"name": "pkg.whl.sha256", "browser_download_url": "https://example.test/pkg.whl.sha256"},
            ],
        }
    )

    assert release.asset_name == "pkg.whl"
    assert release.asset_sha256 == "a" * 64
    assert seen["url"] == "https://example.test/pkg.whl.sha256"
    assert seen["asset_name"] == "pkg.whl"


def test_parse_sha256_digest_prefers_matching_asset_line():
    digest = updater.parse_sha256_digest(
        "\n".join([
            "b" * 64 + "  other.whl",
            "a" * 64 + "  pkg.whl",
        ]),
        "pkg.whl",
    )

    assert digest == "a" * 64


def test_latest_release_url_parser_accepts_redirect_target():
    assert (
        updater.parse_latest_release_tag_url(
            "https://github.com/lgdy88/codex-enhance/releases/tag/v1.0.12"
        )
        == "v1.0.12"
    )
    assert (
        updater.parse_latest_release_tag_url(
            "https://github.com/lgdy88/codex-enhance/releases/tag/v1.0.12?expanded_assets=true"
        )
        == "v1.0.12"
    )
    with pytest.raises(updater.UpdateError, match="无法从 GitHub Release 地址解析版本"):
        updater.parse_latest_release_tag_url("https://github.com/lgdy88/codex-enhance/releases/latest")


def test_release_from_latest_release_url_uses_source_archive_asset(monkeypatch):
    seen = {}

    def fake_download_digest(url, asset_name=""):
        seen["url"] = url
        seen["asset_name"] = asset_name
        return "a" * 64

    monkeypatch.setattr(updater, "download_digest", fake_download_digest)

    release = updater.Release.from_latest_release_url(
        "https://github.com/lgdy88/codex-enhance/releases/tag/v1.0.12"
    )

    assert release.version == "v1.0.12"
    assert release.url == "https://github.com/lgdy88/codex-enhance/releases/tag/v1.0.12"
    assert release.asset_name == "CodexPlusPlus.zip"
    assert release.asset_url == "https://github.com/lgdy88/codex-enhance/releases/download/v1.0.12/CodexPlusPlus.zip"
    assert release.asset_sha256 == "a" * 64
    assert seen == {
        "url": "https://github.com/lgdy88/codex-enhance/releases/download/v1.0.12/CodexPlusPlus.zip.sha256",
        "asset_name": "CodexPlusPlus.zip",
    }


def test_fetch_latest_release_uses_github_release_redirect(monkeypatch):
    requested = []

    class Response:
        url = "https://github.com/lgdy88/codex-enhance/releases/tag/v1.0.12"

        def raise_for_status(self):
            pass

    monkeypatch.setattr(updater.requests, "get", lambda url, **kwargs: requested.append((url, kwargs)) or Response())
    monkeypatch.setattr(updater, "download_digest", lambda *args: "a" * 64)

    release = updater.fetch_latest_release()

    assert release.version == "v1.0.12"
    assert requested[0][0] == updater.DEFAULT_LATEST_RELEASE_URL
    assert requested[0][1]["timeout"] == 10
    assert "Codex++" in requested[0][1]["headers"]["User-Agent"]
    assert "Accept" not in requested[0][1]["headers"]


def test_download_asset_writes_release_file(monkeypatch, tmp_path):
    class Response:
        headers = {"content-length": "7"}

        def raise_for_status(self):
            pass

        def iter_content(self, chunk_size):
            yield b"abc"
            yield b"defg"

    monkeypatch.setattr(updater.requests, "get", lambda *args, **kwargs: Response())

    path = updater.download_asset("https://example.test/pkg.whl", "pkg.whl", tmp_path)

    assert path == tmp_path / "pkg.whl"
    assert path.read_bytes() == b"abcdefg"


def test_verify_asset_digest_rejects_missing_digest(tmp_path):
    wheel = tmp_path / "pkg.whl"
    wheel.write_bytes(b"wheel")

    with pytest.raises(updater.UpdateError, match="缺少 SHA-256"):
        updater.verify_asset_digest(wheel, None)


def test_perform_update_installs_downloaded_wheel_and_reruns_setup(monkeypatch, tmp_path):
    commands = []
    release = updater.Release(
        version="v1.0.5",
        url="https://github.com/lgdy88/codex-enhance/releases/tag/v1.0.5",
        body="fixes",
        asset_name="pkg.whl",
        asset_url="https://example.test/pkg.whl",
        asset_sha256="ba59926159d2aa256eb8739b8da7e2b574b960e1202c6d624cbe981cef996c91",
    )
    wheel = tmp_path / "pkg.whl"
    wheel.write_bytes(b"wheel")
    monkeypatch.setattr(updater, "download_asset", lambda *args: wheel)
    monkeypatch.setattr(updater.subprocess, "run", lambda command, **kwargs: commands.append((command, kwargs)))

    result = updater.perform_update(release, python_executable="python.exe", download_dir=tmp_path)

    assert result.installed_path == wheel
    assert commands == [
        (["python.exe", "-m", "pip", "install", "--upgrade", str(wheel)], {"check": True}),
        (["python.exe", "-m", "codex_session_delete", "setup"], {"check": True, "cwd": updater.safe_setup_cwd()}),
    ]


def test_perform_update_rejects_release_without_asset(tmp_path):
    release = updater.Release(version="v1.0.5", url="https://example.test", body="")

    with pytest.raises(updater.UpdateError, match="没有可下载的 Release asset"):
        updater.perform_update(release, python_executable="python.exe", download_dir=tmp_path)


def test_source_tree_root_detects_git_clone_project(tmp_path):
    project = tmp_path / "CodexPlusPlus"
    package = project / "codex_session_delete"
    package.mkdir(parents=True)
    (project / ".git").mkdir()
    (project / "pyproject.toml").write_text("[project]\n", encoding="utf-8")
    module_file = package / "updater.py"
    module_file.write_text("", encoding="utf-8")

    assert updater.source_tree_root(module_file) == project


def test_source_tree_root_ignores_non_source_install(tmp_path):
    package = tmp_path / "site-packages" / "codex_session_delete"
    package.mkdir(parents=True)
    module_file = package / "updater.py"
    module_file.write_text("", encoding="utf-8")

    assert updater.source_tree_root(module_file) is None


def test_check_for_update_skips_source_tree_mode(monkeypatch, tmp_path):
    project = tmp_path / "CodexPlusPlus"
    package = project / "codex_session_delete"
    package.mkdir(parents=True)
    (project / ".git").mkdir()
    (project / "pyproject.toml").write_text("[project]\n", encoding="utf-8")
    module_file = package / "updater.py"
    module_file.write_text("", encoding="utf-8")
    fetched = []
    monkeypatch.setattr(updater, "PACKAGE_MODULE_FILE", module_file)
    monkeypatch.setattr(updater, "fetch_latest_release", lambda: fetched.append(True))

    assert updater.check_for_update() is None
    assert fetched == []
