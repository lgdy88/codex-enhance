from scripts.disposable_cdp_smoke import PROJECT_CWD, create_disposable_profile, run_local_smoke


def test_disposable_smoke_profile_exercises_history_and_http_guard(tmp_path):
    codex_home = create_disposable_profile(tmp_path)

    result = run_local_smoke(codex_home)

    assert result["diagnostics"]["quick_check"] == "ok"
    assert result["project_threads"]["project_cwd"] == PROJECT_CWD
