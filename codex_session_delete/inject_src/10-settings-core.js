  function renderCodexPlusMenu() {
    document.querySelectorAll(".codex-plus-toggle[data-codex-plus-setting]").forEach((button) => {
      const key = button.getAttribute("data-codex-plus-setting");
      button.dataset.enabled = String(!!codexPlusSettings()[key]);
    });
  }

  let codexPlusBackendSettings = { providerSyncEnabled: true };

  async function loadBackendSettings() {
    try {
      const settings = await postJson("/settings/get", {});
      codexPlusBackendSettings = { ...codexPlusBackendSettings, ...settings };
      refreshCodexPlusBackendToggles();
    } catch (_) {
      refreshCodexPlusBackendToggles();
    }
  }

  async function setBackendSetting(key, value) {
    codexPlusBackendSettings = { ...codexPlusBackendSettings, [key]: value };
    refreshCodexPlusBackendToggles();
    try {
      const settings = await postJson("/settings/set", { [key]: value });
      codexPlusBackendSettings = { ...codexPlusBackendSettings, ...settings };
    } finally {
      refreshCodexPlusBackendToggles();
    }
  }

  function refreshCodexPlusBackendToggles() {
    document.querySelectorAll(".codex-plus-toggle[data-codex-backend-setting]").forEach((button) => {
      const key = button.getAttribute("data-codex-backend-setting");
      button.dataset.enabled = String(!!codexPlusBackendSettings[key]);
    });
  }

  let codexPlusUserScripts = { enabled: true, builtin_dir: "", user_dir: "", scripts: [] };
  let codexPlusMcpStatus = { status: "checking", servers: [] };
  let codexPlusBackendStatus = { status: "checking", message: "正在检查后端…" };
  let codexPlusProviderStatus = { status: "checking", current_provider: "", config_mtime_ms: 0 };
  let codexPlusProviderDiagnostics = { status: "checking" };
  let codexProviderHistoryTransport = { mode: "local-sqlite", appServer: "not_checked", message: "本地 SQLite bridge 优先" };
  let codexPlusBackendStatusInFlight = false;
  let codexPlusProviderStatusInFlight = false;
  let codexPlusProviderDiagnosticsInFlight = false;

  function renderBackendStatus() {
    const status = codexPlusBackendStatus.status || "failed";
    const label = document.querySelector("[data-codex-backend-status]");
    if (label) {
      label.dataset.status = status;
      label.textContent = codexPlusBackendStatus.message || (status === "ok" ? "后端已连接" : "后端已断开");
    }
    document.querySelectorAll("[data-codex-backend-indicator]").forEach((indicator) => {
      indicator.dataset.status = status;
      indicator.title = status === "ok" ? "后端已连接" : status === "checking" ? "正在检查后端" : "后端已断开";
    });
    const repair = document.querySelector("[data-codex-backend-repair]");
    if (repair) repair.hidden = status === "ok" || status === "checking";
  }

  function withBackendTimeout(request) {
    return Promise.race([
      request,
      new Promise((resolve) => setTimeout(() => resolve({ status: "failed", message: "后端已断开" }), 2000)),
    ]);
  }

  async function checkBackendStatus() {
    if (codexPlusBackendStatusInFlight) return;
    codexPlusBackendStatusInFlight = true;
    try {
      codexPlusBackendStatus = await withBackendTimeout(postJson("/backend/status", {}));
      renderBackendStatus();
    } finally {
      codexPlusBackendStatusInFlight = false;
    }
  }

  async function repairBackend() {
    codexPlusBackendStatus = { status: "checking", message: "正在修复后端…" };
    renderBackendStatus();
    try {
      codexPlusBackendStatus = await postJson("/backend/repair", {});
    } catch (error) {
      codexPlusBackendStatus = { status: "failed", message: "后端修复失败" };
    }
    renderBackendStatus();
  }

  function scheduleBackendHeartbeat() {
    if (window.__codexPlusBackendHeartbeat) return;
    window.__codexPlusBackendHeartbeat = setInterval(checkBackendStatus, 5000);
    checkBackendStatus();
  }

  function scheduleProviderWatcher() {
    if (window.__codexPlusProviderWatcher) return;
    window.__codexPlusProviderWatcher = setInterval(loadProviderStatus, 2500);
    loadProviderStatus();
  }

  function userScriptStatusLabel(status) {
    return { loaded: "已加载", failed: "失败", disabled: "已禁用", not_loaded: "未加载", loading: "加载中" }[status] || status || "未知";
  }

  function renderUserScripts() {
    const enabledToggle = document.querySelector("[data-codex-user-scripts-enabled]");
    if (enabledToggle) enabledToggle.dataset.enabled = String(!!codexPlusUserScripts.enabled);
    const dirs = document.querySelector("[data-codex-user-script-dirs]");
    if (dirs) dirs.textContent = `内置：${codexPlusUserScripts.builtin_dir || "未找到"}  用户：${codexPlusUserScripts.user_dir || "未找到"}`;
    const list = document.querySelector("[data-codex-user-script-list]");
    if (!list) return;
    if (!codexPlusUserScripts.scripts?.length) {
      list.textContent = "未发现用户脚本。";
      return;
    }
    list.innerHTML = codexPlusUserScripts.scripts.map((script) => `
      <div class="codex-plus-user-script-item">
        <div>
          <div class="codex-plus-user-script-name">${escapeHtml(script.name || script.key)}</div>
          <div class="codex-plus-user-script-meta">${script.source === "builtin" ? "内置" : "用户"} · ${userScriptStatusLabel(script.status)}</div>
          ${script.error ? `<div class="codex-plus-user-script-error">${escapeHtml(script.error)}</div>` : ""}
        </div>
        <button type="button" class="codex-plus-toggle" data-codex-user-script-key="${escapeHtml(script.key)}" data-enabled="${String(!!script.enabled)}"><span></span></button>
      </div>
    `).join("");
  }

  async function loadUserScripts(path = "/user-scripts/list", payload = {}) {
    const result = await postJson(path, payload);
    if (result?.scripts) {
      codexPlusUserScripts = result;
      renderUserScripts();
    }
  }

