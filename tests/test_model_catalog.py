from pathlib import Path

from codex_session_delete.model_catalog import read_codex_model_catalog_from_home


def test_model_catalog_reads_config_provider_and_redacts_auth(tmp_path: Path):
    (tmp_path / "config.toml").write_text(
        """
model = "qwen3-coder"
model_provider = "relay"

[model_providers.relay]
name = "Relay"
base_url = "https://token@example.test/root?secret=1"
experimental_bearer_token = "relay-key"
""".lstrip(),
        encoding="utf-8",
    )
    calls = []

    def request_json(method, url, api_key, payload):
        calls.append((method, url, api_key, payload))
        if url.endswith("/models"):
            return 200, {"data": [{"id": "qwen3-coder"}, {"id": "deepseek-coder"}]}
        return 200, {"id": "resp_1"}

    result = read_codex_model_catalog_from_home(tmp_path, {}, request_json)

    assert result["status"] == "ok"
    assert result["model_provider"] == "relay"
    assert result["provider_name"] == "Relay"
    assert result["default_model"] == "qwen3-coder"
    assert result["models"] == ["qwen3-coder", "deepseek-coder"]
    assert result["sources"][0]["auth"] == "present"
    assert result["sources"][0]["base_url"] == "https://example.test/root"
    assert "relay-key" not in str(result)
    assert calls[0][2] == "relay-key"


def test_model_catalog_uses_env_base_url_when_config_missing(tmp_path: Path):
    calls = []

    def request_json(method, url, api_key, payload):
        calls.append((method, url, api_key, payload))
        if method == "GET":
            return 200, {"models": ["env-model"]}
        return 404, {"error": {"message": "Not Found"}}

    result = read_codex_model_catalog_from_home(
        tmp_path,
        {"OPENAI_BASE_URL": "https://env.example/v1", "OPENAI_API_KEY": "env-key"},
        request_json,
    )

    assert result["status"] == "ok"
    assert result["models"] == ["env-model"]
    assert result["responses_api"]["status"] == "unsupported"
    assert calls[0][1] == "https://env.example/v1/models"
    assert calls[1][1] == "https://env.example/v1/responses"
    assert "env-key" not in str(result)


def test_model_catalog_reports_missing_without_network(tmp_path: Path):
    def request_json(method, url, api_key, payload):
        raise AssertionError("missing config without env should not call network")

    result = read_codex_model_catalog_from_home(tmp_path, {}, request_json)

    assert result["status"] == "missing"
    assert result["models"] == []
    assert result["sources"] == []
