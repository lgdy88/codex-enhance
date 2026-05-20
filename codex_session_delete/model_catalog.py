from __future__ import annotations

import json
import os
import tomllib
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable


BASE_URL_ENV_KEYS = (
    "CODEX_PLUS_OPENAI_BASE_URL",
    "CODEX_PLUS_BASE_URL",
    "OPENAI_BASE_URL",
    "OPENAI_API_BASE_URL",
    "OPENAI_API_BASE",
    "OPENAI_API_URL",
)
API_KEY_ENV_KEYS = (
    "CODEX_PLUS_OPENAI_API_KEY",
    "CODEX_PLUS_API_KEY",
    "OPENAI_API_KEY",
)

JsonRequester = Callable[[str, str, str, dict[str, object] | None], tuple[int, object]]


def read_codex_model_catalog() -> dict[str, object]:
    return read_codex_model_catalog_from_home(default_codex_home(), dict(os.environ))


def read_codex_model_catalog_from_home(
    home: Path,
    env: dict[str, str] | None = None,
    request_json: JsonRequester | None = None,
) -> dict[str, object]:
    env = env or {}
    requester = request_json or request_json_urlopen
    config_path = home / "config.toml"
    auth_api_key = read_codex_auth_api_key(home / "auth.json")
    config, effective, error = load_codex_config(config_path)
    model = string_value(effective.get("model"))
    model_provider = string_value(effective.get("model_provider"))
    resolved_provider, provider_config = provider_config_for_model_provider(config, model_provider)
    if not model_provider and resolved_provider:
        model_provider = resolved_provider
    provider_name = string_value((provider_config or {}).get("name")) or model_provider

    if error and error != "missing":
        return empty_catalog(
            status="failed",
            path=config_path,
            message=error,
            model=model,
            model_provider=model_provider,
            provider_name=provider_name,
        )

    sources = model_sources_from_environment(env, auth_api_key)
    if not error:
        source = model_source_from_config(config, effective, env, auth_api_key)
        if source and all(trim_url(existing["base_url"]) != trim_url(source["base_url"]) for existing in sources):
            sources.append(source)

    source_statuses: list[dict[str, object]] = []
    models: list[str] = []
    for source in sources:
        source_models, status = fetch_models_from_source(requester, source)
        probe_model = preferred_probe_model(model, source_models)
        status["responses_api"] = (
            probe_responses_api_support(requester, source, probe_model)
            if status.get("status") == "ok"
            else responses_api_status("unknown", responses_endpoint(source["base_url"]), "")
        )
        source_statuses.append(status)
        models.extend(source_models)

    models = unique_strings(models)
    if not model:
        model = string_value(effective.get("default_model"))
    default_model = model if model in models else (models[0] if models else "")
    if models:
        status = "ok"
    elif any(source.get("status") == "failed" for source in source_statuses):
        status = "failed"
    elif error == "missing":
        status = "missing"
    else:
        status = "not_configured"

    return {
        "status": status,
        "path": str(config_path),
        "model": model,
        "model_provider": model_provider,
        "provider_name": provider_name,
        "default_model": default_model,
        "models": models,
        "sources": source_statuses,
        "responses_api": preferred_responses_api_status(source_statuses),
    }


def default_codex_home() -> Path:
    configured = os.environ.get("CODEX_HOME", "").strip()
    return Path(configured) if configured else Path.home() / ".codex"


def empty_catalog(
    *,
    status: str,
    path: Path,
    message: str = "",
    model: str = "",
    model_provider: str = "",
    provider_name: str = "",
) -> dict[str, object]:
    payload: dict[str, object] = {
        "status": status,
        "path": str(path),
        "model": model,
        "model_provider": model_provider,
        "provider_name": provider_name,
        "default_model": "",
        "models": [],
        "sources": [],
        "responses_api": responses_api_status("unknown", "", ""),
    }
    if message:
        payload["message"] = message
    return payload


def load_codex_config(path: Path) -> tuple[dict[str, Any], dict[str, str], str | None]:
    try:
        parsed = tomllib.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}, {}, "missing"
    except (OSError, tomllib.TOMLDecodeError) as exc:
        return {}, {}, str(exc)

    root = {key: value for key, value in parsed.items() if not isinstance(value, dict)}
    effective = flatten_values(root)
    profile_name = effective.get("profile", "")
    profiles = parsed.get("profiles", {})
    if isinstance(profiles, dict) and profile_name and isinstance(profiles.get(profile_name), dict):
        effective.update(flatten_values(profiles[profile_name]))
    return parsed, effective, None


def flatten_values(values: dict[str, Any]) -> dict[str, str]:
    return {key: str(value).strip() for key, value in values.items() if not isinstance(value, dict)}


def provider_config_for_model_provider(config: dict[str, Any], model_provider: str) -> tuple[str, dict[str, str] | None]:
    providers = config.get("model_providers", {})
    if not isinstance(providers, dict):
        return model_provider, None
    if model_provider:
        provider = providers.get(model_provider)
        return model_provider, flatten_values(provider) if isinstance(provider, dict) else None
    if len(providers) == 1:
        name, provider = next(iter(providers.items()))
        return str(name), flatten_values(provider) if isinstance(provider, dict) else None
    return model_provider, None


def read_codex_auth_api_key(path: Path) -> str:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    if not isinstance(payload, dict):
        return ""
    for key in ("OPENAI_API_KEY", "api_key", "apikey", "access_token", "token"):
        value = string_value(payload.get(key))
        if value:
            return value
    return ""


def model_sources_from_environment(env: dict[str, str], auth_api_key: str) -> list[dict[str, str]]:
    base_url = first_env_value(env, BASE_URL_ENV_KEYS)
    if not base_url:
        return []
    api_key = first_env_value(env, API_KEY_ENV_KEYS) or auth_api_key
    return [{
        "source_id": "env:openai-compatible",
        "source_type": "environment",
        "name": "Environment",
        "base_url": base_url,
        "api_key": api_key,
    }]


def model_source_from_config(
    config: dict[str, Any],
    effective: dict[str, str],
    env: dict[str, str],
    auth_api_key: str,
) -> dict[str, str] | None:
    resolved_provider, provider = provider_config_for_model_provider(config, effective.get("model_provider", ""))
    if not provider:
        return None
    base_url = string_value(provider.get("base_url"))
    if not base_url:
        return None
    name = string_value(provider.get("name"))
    return {
        "source_id": f"config:{resolved_provider or name}",
        "source_type": "config",
        "name": name or resolved_provider,
        "base_url": base_url,
        "api_key": provider_api_key(provider, env, auth_api_key),
    }


def provider_api_key(provider: dict[str, str], env: dict[str, str], auth_api_key: str) -> str:
    for key in ("experimental_bearer_token", "api_key", "apikey", "bearer_token", "token"):
        value = string_value(provider.get(key))
        if value:
            return value
    for key in ("env_key", "api_key_env", "api_key_env_var", "key_env", "bearer_token_env"):
        env_name = string_value(provider.get(key))
        if env_name:
            value = first_env_value(env, (env_name,))
            if value:
                return value
    return first_env_value(env, API_KEY_ENV_KEYS) or auth_api_key


def fetch_models_from_source(
    request_json: JsonRequester,
    source: dict[str, str],
) -> tuple[list[str], dict[str, object]]:
    endpoint = models_endpoint(source["base_url"])
    status: dict[str, object] = {
        "id": source["source_id"],
        "type": source["source_type"],
        "name": source["name"],
        "base_url": safe_url_for_status(source["base_url"]),
        "endpoint": safe_url_for_status(endpoint),
        "auth": "present" if source["api_key"] else "missing",
    }
    if not endpoint:
        return failed_source(status, "Missing base URL")
    try:
        code, payload = request_json("GET", endpoint, source["api_key"], None)
    except Exception as exc:
        return failed_source(status, redact_secret(str(exc), source["api_key"]))
    if code < 200 or code >= 300:
        return failed_source(status, f"HTTP {code}")
    models = unique_strings(parse_model_payload(payload))
    status.update({"status": "ok", "models": len(models)})
    return models, status


def failed_source(source: dict[str, object], message: str) -> tuple[list[str], dict[str, object]]:
    source.update({"status": "failed", "message": message, "models": 0, "responses_api": responses_api_status("unknown", "", "")})
    return [], source


def preferred_probe_model(model: str, source_models: list[str]) -> str:
    return model if model and model in source_models else (source_models[0] if source_models else "")


def probe_responses_api_support(request_json: JsonRequester, source: dict[str, str], model: str) -> dict[str, object]:
    endpoint = responses_endpoint(source["base_url"])
    if not endpoint or not model:
        return responses_api_status("unknown", endpoint, "")
    try:
        code, payload = request_json("POST", endpoint, source["api_key"], {"model": model, "input": "ping", "max_output_tokens": 1})
    except Exception as exc:
        return responses_api_status("failed", endpoint, redact_secret(str(exc), source["api_key"]))
    if code < 400:
        return responses_api_status("supported", endpoint, "")
    message = error_message_from_body(payload)
    detail = redact_secret(http_error_message(code, message), source["api_key"])
    return responses_api_status("unsupported" if looks_like_unsupported_responses_api(code, message) else "failed", endpoint, detail)


def request_json_urlopen(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> tuple[int, object]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers={"Accept": "application/json"})
    if data is not None:
        request.add_header("Content-Type", "application/json")
    if api_key:
        request.add_header("Authorization", f"Bearer {api_key}")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            body = response.read().decode("utf-8", errors="replace")
            return int(response.status), json.loads(body) if body.strip() else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body) if body.strip() else {}
        except json.JSONDecodeError:
            payload = body
        return int(exc.code), payload


def responses_api_status(status: str, endpoint: str, message: str) -> dict[str, object]:
    return {"status": status, "endpoint": endpoint, "message": message}


def preferred_responses_api_status(sources: list[dict[str, object]]) -> dict[str, object]:
    statuses = [source.get("responses_api") for source in sources if isinstance(source.get("responses_api"), dict)]
    for wanted in ("unsupported", "supported", "failed"):
        match = next((status for status in statuses if status.get("status") == wanted), None)
        if isinstance(match, dict):
            return match
    return responses_api_status("unknown", "", "")


def models_endpoint(base_url: str) -> str:
    cleaned = safe_url_for_status(base_url).rstrip("/")
    if not cleaned:
        return ""
    if cleaned.endswith("/models"):
        return cleaned
    if cleaned.endswith("/v1"):
        return f"{cleaned}/models"
    return f"{cleaned}/v1/models"


def responses_endpoint(base_url: str) -> str:
    cleaned = safe_url_for_status(base_url).rstrip("/")
    if not cleaned:
        return ""
    if cleaned.endswith("/responses"):
        return cleaned
    if cleaned.endswith("/models"):
        return f"{cleaned.removesuffix('/models')}/responses"
    if cleaned.endswith("/v1"):
        return f"{cleaned}/responses"
    return f"{cleaned}/v1/responses"


def error_message_from_body(body: object) -> str:
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            return string_value(error.get("message"))
        return string_value(body.get("message"))
    return string_value(body)


def http_error_message(status: int, message: str) -> str:
    return f"HTTP {status}: {message.strip()}" if message.strip() else f"HTTP {status}"


def looks_like_unsupported_responses_api(status: int, message: str) -> bool:
    if status in {404, 405, 410, 501}:
        return True
    lowered = message.lower()
    return "/v1/responses" in lowered and any(token in lowered for token in ("not found", "unsupported", "not support", "does not support", "unknown endpoint"))


def parse_model_payload(payload: object) -> list[str]:
    if isinstance(payload, list):
        result = []
        for item in payload:
            if isinstance(item, str):
                result.append(item)
            elif isinstance(item, dict):
                result.extend(string_value(item.get(key)) for key in ("id", "model", "name") if string_value(item.get(key)))
        return result
    if not isinstance(payload, dict):
        return []
    for key in ("data", "models", "items"):
        nested = parse_model_payload(payload.get(key))
        if nested:
            return nested
    for key in ("id", "model", "name"):
        value = string_value(payload.get(key))
        if value:
            return [value]
    return []


def unique_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        value = value.strip()
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def first_env_value(env: dict[str, str], names: tuple[str, ...]) -> str:
    return next((string_value(env.get(name)) for name in names if string_value(env.get(name))), "")


def safe_url_for_status(url: str) -> str:
    raw = string_value(url).split("?", 1)[0].split("#", 1)[0]
    parsed = urllib.parse.urlsplit(raw)
    if not parsed.scheme or not parsed.hostname:
        return raw
    host = parsed.hostname
    if parsed.port:
        host = f"{host}:{parsed.port}"
    return urllib.parse.urlunsplit((parsed.scheme, host, parsed.path, "", ""))


def trim_url(url: str) -> str:
    return string_value(url).rstrip("/")


def string_value(value: object) -> str:
    return str(value).strip() if value is not None else ""


def redact_secret(message: str, secret: str) -> str:
    secret = secret.strip()
    return message.replace(secret, "[redacted]") if len(secret) >= 4 else message
