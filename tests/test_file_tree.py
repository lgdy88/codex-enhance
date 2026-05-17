from codex_session_delete.file_tree import project_file_tree


def test_project_file_tree_returns_direct_children(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("print('ok')", encoding="utf-8")
    (tmp_path / "README.md").write_text("# Demo", encoding="utf-8")

    result = project_file_tree(str(tmp_path))

    assert result["status"] == "ok"
    assert [entry["name"] for entry in result["entries"]] == ["src", "README.md"]
    assert result["entries"][0] == {
        "name": "src",
        "path": "src",
        "absolute_path": str(tmp_path / "src"),
        "type": "directory",
        "has_children": True,
    }
    assert result["entries"][1]["absolute_path"] == str(tmp_path / "README.md")


def test_project_file_tree_blocks_parent_traversal(tmp_path):
    result = project_file_tree(str(tmp_path), "..")

    assert result["status"] == "failed"
    assert result["message"] == "目录越界"
