from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "codex_session_delete" / "inject_src"
TARGET = ROOT / "codex_session_delete" / "inject" / "renderer-inject.js"


def module_paths() -> list[Path]:
    return sorted(path for path in SOURCE_DIR.glob("*.js") if path.is_file())


def build_renderer() -> str:
    parts = []
    for path in module_paths():
        text = path.read_text(encoding="utf-8").rstrip()
        parts.append(text)
    return "\n\n".join(parts) + "\n"


def main() -> int:
    if not SOURCE_DIR.exists():
        raise SystemExit(f"renderer source directory not found: {SOURCE_DIR}")
    TARGET.write_text(build_renderer(), encoding="utf-8")
    print(f"built {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
