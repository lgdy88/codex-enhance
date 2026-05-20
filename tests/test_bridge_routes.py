from codex_session_delete.bridge_routes import ROUTES_BY_PATH, BridgeRouteContext, dispatch_route


def test_bridge_routes_classify_read_mutation_and_dangerous_paths():
    assert ROUTES_BY_PATH["/codex-model-catalog"].kind == "read"
    assert ROUTES_BY_PATH["/codex-config-model"].kind == "read"
    assert ROUTES_BY_PATH["/provider/diagnostics"].kind == "read"
    assert ROUTES_BY_PATH["/provider/repair-paths"].kind == "mutation"
    assert ROUTES_BY_PATH["/provider/converge"].kind == "dangerous"
    assert ROUTES_BY_PATH["/provider/quarantine-state"].kind == "dangerous"


def test_bridge_routes_keep_http_token_gate_by_default():
    for path in ["/project-threads", "/delete", "/provider/quarantine-state"]:
        assert ROUTES_BY_PATH[path].http_access == "token"
        assert ROUTES_BY_PATH[path].cdp_allowed is True


def test_bridge_routes_declare_payload_validators():
    for route in ROUTES_BY_PATH.values():
        assert callable(route.payload_validator)


def test_bridge_routes_reject_invalid_session_payload_before_handler():
    class Service:
        def delete(self, session):
            raise AssertionError("delete handler should not run")

    result = dispatch_route(BridgeRouteContext(Service()), "/delete", {"title": "Missing ID"}, transport="cdp")

    assert result["status"] == "failed"
    assert "session_id is required" in result["message"]
