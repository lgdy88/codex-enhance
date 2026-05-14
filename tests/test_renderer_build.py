from pathlib import Path

from scripts.build_renderer_inject import build_renderer


def test_renderer_inject_is_generated_from_source_modules():
    target = Path("codex_session_delete/inject/renderer-inject.js").read_text(encoding="utf-8")

    assert target == build_renderer()


def test_renderer_source_modules_cover_feature_boundaries():
    source_dir = Path("codex_session_delete/inject_src")
    names = {path.name for path in source_dir.glob("*.js")}

    assert {
        "20-mcp-panel.js",
        "30-provider-history.js",
        "40-settings-menu.js",
        "50-plugin-unlock.js",
        "55-bridge-client.js",
        "60-project-move.js",
        "70-timeline.js",
        "80-dom-scan-runtime.js",
    }.issubset(names)
