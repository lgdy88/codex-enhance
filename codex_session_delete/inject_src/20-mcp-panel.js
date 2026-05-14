  function mcpServerLabel(name) {
    return { "chrome-devtools": "chrome-devtools", playwright: "playwright" }[name] || name;
  }

  function renderMcpStatus() {
    const list = document.querySelector("[data-codex-mcp-list]");
    if (!list) return;
    const servers = codexPlusMcpStatus.servers || [];
    if (!servers.length) {
      list.textContent = codexPlusMcpStatus.message || "正在读取 MCP 状态…";
      return;
    }
    list.innerHTML = servers.map((server) => `
      <div class="codex-plus-mcp-item">
        <div>
          <div class="codex-plus-mcp-name">${escapeHtml(mcpServerLabel(server.name))}</div>
          <div class="codex-plus-mcp-meta">${server.enabled ? "启用" : "停用"} · ${escapeHtml(server.serverType || "stdio")} · ${escapeHtml(server.mode || "default")}</div>
        </div>
        <button type="button" class="codex-plus-toggle" data-codex-mcp-server="${escapeHtml(server.name)}" data-enabled="${String(!!server.enabled)}"><span></span></button>
      </div>
    `).join("");
  }

  async function loadMcpStatus(path = "/mcp/status", payload = {}) {
    codexPlusMcpStatus = await postJson(path, payload);
    renderMcpStatus();
    if (path !== "/mcp/status") showToast(codexPlusMcpStatus.message || "MCP 配置已更新，请重启 Codex", null);
  }

  function setMcpEnabled(name, enabled) {
    loadMcpStatus("/mcp/set-enabled", { name, enabled });
  }

