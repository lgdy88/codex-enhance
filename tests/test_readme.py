from pathlib import Path


def test_readme_limits_discussion_group_qr_size():
    text = Path("README.md").read_text(encoding="utf-8")

    assert '<img src="docs/images/discussion-group-qr.jpg"' in text
    assert 'width="260"' in text
    assert '![Codex++ 交流群二维码](docs/images/discussion-group-qr.jpg)' not in text


def test_readme_includes_codex_plus_icon_and_toc():
    text = Path("README.md").read_text(encoding="utf-8")

    assert '<img src="docs/images/codex-plus-plus.png"' in text
    assert 'width="160"' in text
    assert "![Codex++ 设置面板](docs/images/settings-panel.png)" in text
    assert Path("docs/images/settings-panel.png").exists()
    assert "## 目录" in text
    assert "- [Windows 使用](#windows-使用)" in text
    assert "- [常见问题](#常见问题)" in text


def test_readme_has_badges_language_switch_and_project_charts():
    text = Path("README.md").read_text(encoding="utf-8")

    assert "[English](README_EN.md)" in text
    assert "img.shields.io/github/v/release/lgdy88/codex-enhance" in text
    assert "img.shields.io/github/stars/lgdy88/codex-enhance" in text
    assert "contrib.rocks/image?repo=lgdy88/codex-enhance" in text
    assert "api.star-history.com/svg?repos=lgdy88/codex-enhance" in text


def test_readme_documents_provider_sync_as_no_session_loss():
    text = Path("README.md").read_text(encoding="utf-8")

    assert "Provider 同步" in text
    assert "切换 model_provider" in text
    assert "不丢历史会话" in text


def test_readme_includes_sponsor_qr_codes_near_front():
    text = Path("README.md").read_text(encoding="utf-8")

    assert "## 赞赏支持" in text
    assert "请我喝杯咖啡" in text
    assert '<img src="docs/images/sponsor-alipay.jpg"' in text
    assert '<img src="docs/images/sponsor-wechat.jpg"' in text
    assert 'width="220"' in text
    assert Path("docs/images/sponsor-alipay.jpg").exists()
    assert Path("docs/images/sponsor-wechat.jpg").exists()
    assert text.index("## 赞赏支持") < text.index("## 功能亮点")


def test_english_readme_exists_and_matches_core_sections():
    text = Path("README_EN.md").read_text(encoding="utf-8")

    assert "# Codex++" in text
    assert "[中文](README.md)" in text
    assert "Provider Sync" in text
    assert "switch model_provider without losing historical conversations" in text
    assert "img.shields.io/github/v/release/lgdy88/codex-enhance" in text
    assert "contrib.rocks/image?repo=lgdy88/codex-enhance" in text
    assert "api.star-history.com/svg?repos=lgdy88/codex-enhance" in text


def test_readme_links_lINUX_do_without_image():
    text = Path("README.md").read_text(encoding="utf-8")

    assert "## 友情链接" in text
    assert "[LINUX DO](https://linux.do)" in text
    assert "docs/images/linux-do.png" not in text
