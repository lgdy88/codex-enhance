from pathlib import Path


def readme() -> str:
    return Path("README.md").read_text(encoding="utf-8")


def english_readme() -> str:
    return Path("README_EN.md").read_text(encoding="utf-8")


def test_readme_keeps_project_identity_without_social_noise():
    text = readme()
    english = english_readme()

    assert "[English](README_EN.md)" in text
    assert "[中文](README.md)" in english
    assert "维护者：`lgdy88`" in text
    assert "Maintainer: `lgdy88`" in english
    assert "https://github.com/lgdy88/codex-enhance" in text
    assert "https://github.com/lgdy88/codex-enhance" in english
    assert "img.shields.io/github/v/release/lgdy88/codex-enhance" in text
    assert "img.shields.io/github/license/lgdy88/codex-enhance" in text
    for readme_text in (text, english):
        assert "img.shields.io/github/stars" not in readme_text
        assert "discussion-group-qr.jpg" not in readme_text
        assert "交流群" not in readme_text
        assert "友情链接" not in readme_text
        assert "LINUX DO" not in readme_text
        assert "contrib.rocks" not in readme_text
        assert "star-history" not in readme_text


def test_readme_includes_icon_toc_and_release_installers():
    text = readme()
    english = english_readme()

    assert '<img src="docs/images/codex-plus-plus.png"' in text
    assert 'width="160"' in text
    assert "## 目录" in text
    assert "- [安装](#安装)" in text
    assert "- [常见问题](#常见问题)" in text
    assert "CodexPlusPlus-<version>-windows-x64-setup.exe" in text
    assert "CodexPlusPlus-<version>-macos-universal.dmg" in text
    assert "Public users should prefer the Release installer." in english


def test_readme_documents_provider_history_and_browser_mcp_boundaries():
    text = readme()
    english = english_readme()

    assert "Provider History Manager" in text
    assert "切换 `model_provider`" in text
    assert "不切换 provider" in text
    assert "Browser MCP" in text
    assert "mcp-install all" in text
    assert "chrome-devtools-mcp@latest" in text
    assert "@playwright/mcp@latest" in text
    assert "不会绕过官方 Computer Use" in text
    assert "does not bypass official Computer Use" in english


def test_readme_keeps_screenshots_and_public_risk_boundary():
    text = readme()
    english = english_readme()

    assert "![Codex++ 设置面板](docs/images/settings-panel.png)" in text
    assert Path("docs/images/settings-panel.png").exists()
    assert "不修改 Codex App 原始安装文件" in text
    assert "不绕过官方账号、地区、灰度或后端权限限制" in text
    assert "does not modify original Codex App files" in english
    assert "does not bypass official account, region, rollout, or backend permissions" in english


def test_readme_does_not_include_sponsor_qr_codes():
    text = readme()
    english = english_readme()

    assert "赞赏支持" not in text
    assert "请我喝杯咖啡" not in text
    assert "docs/images/sponsor-alipay.jpg" not in text
    assert "docs/images/sponsor-wechat.jpg" not in text
    assert "## Support" not in english
    assert "buy me a coffee" not in english
    assert "docs/images/sponsor-alipay.jpg" not in english
    assert "docs/images/sponsor-wechat.jpg" not in english
