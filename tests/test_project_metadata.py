import json
import tomllib
from pathlib import Path


PROJECT_OWNER = "lgdy88"
PROJECT_REPOSITORY = "https://github.com/lgdy88/codex-enhance"


def read_toml(path: str) -> dict:
    return tomllib.loads(Path(path).read_text(encoding="utf-8"))


def test_python_package_public_metadata_uses_project_owner():
    text = Path("pyproject.toml").read_text(encoding="utf-8")
    project = read_toml("pyproject.toml")["project"]

    assert project["authors"] == [{"name": PROJECT_OWNER}]
    assert project["urls"]["Homepage"] == PROJECT_REPOSITORY
    assert project["urls"]["Repository"] == PROJECT_REPOSITORY
    assert project["urls"]["Issues"] == f"{PROJECT_REPOSITORY}/issues"
    assert "BigPizzaV3" not in text


def test_rust_workspace_public_metadata_uses_project_owner():
    text = Path("Cargo.toml").read_text(encoding="utf-8")
    workspace_package = read_toml("Cargo.toml")["workspace"]["package"]

    assert workspace_package["authors"] == [PROJECT_OWNER]
    assert workspace_package["repository"] == PROJECT_REPOSITORY
    assert "BigPizzaV3" not in text


def test_rust_packages_inherit_public_author_metadata():
    manifests = [
        "apps/codex-plus-launcher/Cargo.toml",
        "apps/codex-plus-manager/src-tauri/Cargo.toml",
        "crates/codex-plus-core/Cargo.toml",
        "crates/codex-plus-data/Cargo.toml",
    ]

    for manifest in manifests:
        package = read_toml(manifest)["package"]
        assert package["authors"]["workspace"] is True
        assert package["repository"]["workspace"] is True


def test_manager_package_is_private_and_has_no_public_noise():
    text = Path("apps/codex-plus-manager/package.json").read_text(encoding="utf-8")
    package = json.loads(text)

    assert package["private"] is True
    assert "BigPizzaV3" not in text
    assert "discussion-group-qr" not in text
