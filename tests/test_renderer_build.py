from pathlib import Path

import pytest

from scripts.build_renderer_inject import assert_csp_safe_source, build_renderer, validate_csp_safe_source


def test_renderer_inject_is_generated_from_source_modules():
    target = Path("codex_session_delete/inject/renderer-inject.js").read_text(encoding="utf-8")

    assert target == build_renderer()


def test_renderer_source_modules_cover_feature_boundaries():
    source_dir = Path("codex_session_delete/inject_src")
    names = {path.name for path in source_dir.glob("*.js")}

    assert {
        "30-provider-history.js",
        "40-settings-menu.js",
        "50-plugin-unlock.js",
        "55-bridge-client.js",
        "60-project-move.js",
        "70-timeline.js",
        "80-dom-scan-runtime.js",
    }.issubset(names)
    assert "20-mcp-panel.js" not in names


def test_renderer_source_modules_avoid_csp_unsafe_patterns():
    assert validate_csp_safe_source() == []


def test_renderer_csp_guard_rejects_string_evaluation(tmp_path):
    unsafe = tmp_path / "unsafe.js"
    unsafe.write_text('setTimeout("window.bad = true", 1);\n', encoding="utf-8")

    with pytest.raises(RuntimeError, match="string-timer"):
        assert_csp_safe_source([unsafe])


def test_renderer_csp_guard_rejects_external_src_fallbacks(tmp_path):
    unsafe = tmp_path / "unsafe.js"
    unsafe.write_text('img.src = `${helperBase}/assets/sponsor-alipay.jpg`;\n', encoding="utf-8")

    with pytest.raises(RuntimeError, match="external-src-resource"):
        assert_csp_safe_source([unsafe])
