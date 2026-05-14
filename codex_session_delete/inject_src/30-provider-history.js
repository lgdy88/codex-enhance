  function providerDistributionText(value) {
    const distribution = value && typeof value === "object" ? value : {};
    const entries = Object.entries(distribution);
    if (!entries.length) return "无";
    return entries.map(([provider, count]) => `${provider}: ${count}`).join(", ");
  }

  function providerHistoryTransportText() {
    const mode = codexProviderHistoryTransport.mode === "app-server" ? "Codex app-server thread/list" : "本地 SQLite bridge";
    const appServer = codexProviderHistoryTransport.appServer === "unavailable" ? "；app-server thread/list 不可用" : "";
    const message = codexProviderHistoryTransport.message ? `；${codexProviderHistoryTransport.message}` : "";
    return `${mode}${appServer}${message}`;
  }

  function updateProviderHistoryTransport(next) {
    codexProviderHistoryTransport = { ...codexProviderHistoryTransport, ...next };
    window.__codexProviderHistoryTransport = codexProviderHistoryTransport;
  }

  function renderProviderDiagnostics() {
    const panel = document.querySelector("[data-codex-provider-diagnostics]");
    if (!panel) return;
    const data = codexPlusProviderDiagnostics || {};
    if (data.status === "checking") {
      panel.textContent = "正在读取诊断信息…";
      return;
    }
    if (data.status && data.status !== "ok") {
      panel.textContent = data.message || "Provider 诊断不可用";
      return;
    }
    const pathPending = data.path_repair_pending || {};
    const providerPending = data.provider_converge_pending || {};
    const sqlite = data.sqlite || {};
    const rollout = data.rollout || {};
    const stateDb = data.state_db || {};
    const schema = stateDb.schema || sqlite.schema || {};
    const repairPlan = Array.isArray(data.repair_plan) ? data.repair_plan : [];
    const recent50 = sqlite.recent50 || {};
    const projectVisible = sqlite.project_visible || {};
    panel.innerHTML = [
      ["当前 provider", data.current_provider || "unknown"],
      ["历史查询通道", providerHistoryTransportText()],
      ["rollout provider 分布", providerDistributionText(rollout.provider_distribution)],
      ["SQLite provider 分布", providerDistributionText(sqlite.provider_distribution)],
      ["\\\\? 路径数量", `rollout ${pathPending.rollout_cwd_count || 0} / SQLite ${pathPending.sqlite_cwd_count || 0} / global ${pathPending.global_state_count || 0}`],
      ["最近 50 命中", `${recent50.total || 0} 条，当前 provider ${recent50.current_provider_count || 0} 条，项目匹配 ${recent50.project_match_count || 0} 条`],
      ["项目可见数量", `${projectVisible.total || 0} 条，当前 provider ${projectVisible.current_provider_count || 0} 条`],
      ["SQLite quick_check", stateDb.quick_check || sqlite.quick_check || "unknown"],
      ["SQLite schema", `${schema.status || "unknown"}；threads columns ${(schema.thread_columns || []).length || 0}`],
      ["修复计划", repairPlan.map((step) => `${step.id || "unknown"}:${step.kind || "read"}`).join(", ") || "history.readonly:read"],
      ["待收敛 metadata", `rollout ${providerPending.rollout_files || 0} 个文件 / SQLite ${providerPending.sqlite_rows || 0} 行`],
      ["encrypted_content 风险", data.warning || "provider 收敛只保证列表可见，不保证跨账号/跨 provider 的 encrypted_content 能续聊。"],
    ].map(([label, value]) => `<div class="codex-plus-provider-diagnostics-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(String(value))}</span></div>`).join("");
  }

  async function loadProviderDiagnostics(projectCwd = activeProjectPath()) {
    if (codexPlusProviderDiagnosticsInFlight) return;
    codexPlusProviderDiagnosticsInFlight = true;
    codexPlusProviderDiagnostics = { status: "checking" };
    renderProviderDiagnostics();
    try {
      codexPlusProviderDiagnostics = await postJson("/provider/diagnostics", { project_cwd: projectCwd || "" });
    } catch (error) {
      codexPlusProviderDiagnostics = { status: "failed", message: "Provider 诊断读取失败" };
    } finally {
      codexPlusProviderDiagnosticsInFlight = false;
    }
    renderProviderDiagnostics();
  }

  async function repairProviderPaths() {
    const result = await postJson("/provider/repair-paths", {});
    showToast(result?.message || "路径修复已执行", null);
    await loadProviderDiagnostics();
    refreshProviderHistoryUi();
  }

  async function repairProviderPathsOnStartup() {
    if (window.__codexProviderPathRepairInFlight) return;
    window.__codexProviderPathRepairInFlight = true;
    try {
      const result = await postJson("/provider/repair-paths", {});
      updateProviderHistoryTransport({ message: result?.message || "路径自动修复已执行" });
      refreshProviderHistoryUi();
    } catch (error) {
      updateProviderHistoryTransport({ message: `路径自动修复失败：${providerHistoryErrorSummary(error)}` });
    } finally {
      window.__codexProviderPathRepairInFlight = false;
    }
  }

  function scheduleStartupProviderPathRepair() {
    clearTimeout(window.__codexProviderPathRepairTimer);
    window.__codexProviderPathRepairTimer = setTimeout(() => {
      if (window.__codexProjectMoveRuntimeId !== codexProjectMoveRuntimeId) return;
      repairProviderPathsOnStartup();
    }, providerStartupPathRepairDelayMs);
  }

  async function convergeProviderMetadata() {
    const ok = await approveProviderConvergence();
    if (!ok) return;
    const result = await postJson("/provider/converge", {});
    showToast(result?.message || "Provider metadata 收敛已执行", null);
    await loadProviderDiagnostics();
    refreshProviderHistoryUi();
  }

  async function quarantineProviderStateDb() {
    const ok = await approveProviderStateQuarantine();
    if (!ok) return;
    const result = await postJson("/provider/quarantine-state", {});
    showToast(result?.message || "state_5.sqlite 已隔离", null);
    await loadProviderDiagnostics();
    refreshProviderHistoryUi();
  }

  function approveProviderConvergence() {
    document.querySelectorAll(".codex-delete-confirm-overlay").forEach((node) => node.remove());
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "codex-delete-confirm-overlay";
      overlay.innerHTML = `
        <div class="codex-delete-confirm-content" role="dialog" aria-modal="true" aria-label="Provider metadata 收敛">
          <div class="codex-delete-confirm-title">Provider metadata 收敛</div>
          <div class="codex-delete-confirm-message">这会先备份再把历史 metadata 收敛到当前 provider。它只保证列表可见，不保证跨账号或跨 provider 的 encrypted_content 能续聊。</div>
          <div class="codex-delete-confirm-actions">
            <button type="button" data-codex-provider-converge-cancel="true">取消</button>
            <button type="button" data-codex-provider-converge-accept="true">收敛</button>
          </div>
        </div>
      `;
      const finish = (value, event) => {
        event?.preventDefault();
        event?.stopPropagation();
        event?.target?.blur?.();
        overlay.remove();
        resolve(value);
      };
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.closest("[data-codex-provider-converge-cancel]")) {
          finish(false, event);
          return;
        }
        if (event.target.closest("[data-codex-provider-converge-accept]")) {
          finish(true, event);
        }
      }, true);
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") finish(false, event);
      }, true);
      document.body.appendChild(overlay);
      overlay.querySelector("[data-codex-provider-converge-cancel]")?.focus();
    });
  }

  function approveProviderStateQuarantine() {
    document.querySelectorAll(".codex-delete-confirm-overlay").forEach((node) => node.remove());
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "codex-delete-confirm-overlay";
      overlay.innerHTML = `
        <div class="codex-delete-confirm-content" role="dialog" aria-modal="true" aria-label="隔离 state_5.sqlite">
          <div class="codex-delete-confirm-title">隔离脏库</div>
          <div class="codex-delete-confirm-message">这会先备份并隔离 state_5.sqlite / WAL / SHM，重启 Codex 后由 Codex 重建本地索引。只在 quick_check/schema 明确异常时使用。</div>
          <div class="codex-delete-confirm-actions">
            <button type="button" data-codex-provider-quarantine-cancel="true">取消</button>
            <button type="button" data-codex-provider-quarantine-accept="true">隔离</button>
          </div>
        </div>
      `;
      const finish = (value, event) => {
        event?.preventDefault();
        event?.stopPropagation();
        event?.target?.blur?.();
        overlay.remove();
        resolve(value);
      };
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.closest("[data-codex-provider-quarantine-cancel]")) {
          finish(false, event);
          return;
        }
        if (event.target.closest("[data-codex-provider-quarantine-accept]")) {
          finish(true, event);
        }
      }, true);
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") finish(false, event);
      }, true);
      document.body.appendChild(overlay);
      overlay.querySelector("[data-codex-provider-quarantine-cancel]")?.focus();
    });
  }

  async function loadProviderStatus() {
    if (codexPlusProviderStatusInFlight) return;
    codexPlusProviderStatusInFlight = true;
    try {
      const status = await postJson("/provider/status", {});
      const previousProvider = codexPlusProviderStatus.current_provider;
      const previousMtime = codexPlusProviderStatus.config_mtime_ms;
      codexPlusProviderStatus = status || codexPlusProviderStatus;
      if ((previousProvider && previousProvider !== codexPlusProviderStatus.current_provider) || (previousMtime && previousMtime !== codexPlusProviderStatus.config_mtime_ms)) {
        refreshProviderHistoryUi();
      }
    } catch (_) {
      codexPlusProviderStatus = { status: "failed", current_provider: "", config_mtime_ms: 0 };
    } finally {
      codexPlusProviderStatusInFlight = false;
    }
  }

  function providerHistoryEnabled() {
    return codexPlusBackendSettings.providerSyncEnabled !== false;
  }

