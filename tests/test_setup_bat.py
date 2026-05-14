from pathlib import Path


def test_setup_bat_offers_install_and_uninstall_choices():
    text = Path("setup.bat").read_text(encoding="utf-8")

    assert "Codex++" in text
    assert "[1]" in text and "install" in text.lower()
    assert "[2]" in text and "uninstall" in text.lower()
    assert "[3]" in text and "update" in text.lower()
    assert "[4]" in text and "mcp" in text.lower()
    assert "[5]" in text and "status" in text.lower()
    assert "pip install -e ." in text
    assert "codex_session_delete setup" in text
    assert "codex_session_delete remove" in text
    assert "codex_session_delete update" in text
    assert "codex_session_delete mcp-install all" in text
    assert "codex_session_delete mcp-status" in text
    assert "pause" in text.lower()
