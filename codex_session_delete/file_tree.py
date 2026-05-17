from __future__ import annotations

from pathlib import Path

IGNORED_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".venv",
    "__pycache__",
    "node_modules",
}


def project_file_tree(project_cwd: str, relative_path: str = "", limit: int = 200) -> dict[str, object]:
    root = Path(project_cwd).expanduser()
    if not str(project_cwd or "").strip():
        return _failed("项目路径为空", project_cwd, relative_path)

    try:
        root = root.resolve(strict=True)
        directory = _resolve_child(root, relative_path)
        if not directory.is_dir():
            return _failed("目标不是目录", str(root), relative_path)
        return {
            "status": "ok",
            "project_cwd": str(root),
            "path": _relative_posix(root, directory),
            "entries": _directory_entries(root, directory, limit),
        }
    except OSError as exc:
        return _failed(str(exc), project_cwd, relative_path)
    except ValueError:
        return _failed("目录越界", str(root), relative_path)


def _resolve_child(root: Path, relative_path: str) -> Path:
    target = (root / str(relative_path or "")).resolve(strict=True)
    target.relative_to(root)
    return target


def _directory_entries(root: Path, directory: Path, limit: int) -> list[dict[str, object]]:
    bounded_limit = max(1, min(int(limit or 200), 500))
    entries = [_entry_payload(root, entry) for entry in directory.iterdir() if _is_visible_entry(entry)]
    entries.sort(key=lambda item: (item["type"] != "directory", str(item["name"]).lower()))
    return entries[:bounded_limit]


def _entry_payload(root: Path, entry: Path) -> dict[str, object]:
    is_dir = entry.is_dir()
    return {
        "name": entry.name,
        "path": _relative_posix(root, entry),
        "absolute_path": str(entry),
        "type": "directory" if is_dir else "file",
        "has_children": _has_children(entry) if is_dir else False,
    }


def _has_children(directory: Path) -> bool:
    try:
        return any(_is_visible_entry(entry) for entry in directory.iterdir())
    except OSError:
        return False


def _is_visible_entry(entry: Path) -> bool:
    return entry.name not in IGNORED_DIRS


def _relative_posix(root: Path, path: Path) -> str:
    relative = path.relative_to(root)
    return "" if str(relative) == "." else relative.as_posix()


def _failed(message: str, project_cwd: str, relative_path: str) -> dict[str, object]:
    return {
        "status": "failed",
        "message": message,
        "project_cwd": str(project_cwd or ""),
        "path": str(relative_path or ""),
        "entries": [],
    }
