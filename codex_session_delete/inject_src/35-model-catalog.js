  let codexModelCatalog = { status: "checking", model: "", default_model: "", model_provider: "", provider_name: "", models: [], sources: [], responses_api: { status: "unknown", endpoint: "", message: "" } };
  let codexModelCatalogLoadedAt = 0;
  let codexModelCatalogPromise = null;
  const codexPlusModelListRequestIds = new Set();

  function codexPlusModelUnlockEnabled() {
    return !!codexPlusSettings().modelWhitelistUnlock;
  }

  function codexPlusModelNames() {
    return uniqueValues([
      codexModelCatalog.default_model,
      codexModelCatalog.model,
      ...(Array.isArray(codexModelCatalog.models) ? codexModelCatalog.models : []),
    ]);
  }

  function codexResponsesApiStatus() {
    const status = codexModelCatalog.responses_api;
    return status && typeof status === "object" ? status : { status: "unknown", endpoint: "", message: "" };
  }

  function codexModelCompatibilityWarningText() {
    if (!codexPlusModelUnlockEnabled()) return "";
    const responsesApi = codexResponsesApiStatus();
    if (responsesApi.status !== "unsupported") return "";
    const provider = codexModelCatalog.provider_name || codexModelCatalog.model_provider || "当前模型供应商";
    const detail = responsesApi.message ? `：${responsesApi.message}` : "";
    return `${provider} 不支持 Codex 使用的 /v1/responses 接口，模型可能能显示，但发起对话会失败。请换支持 Responses API 的中转，或使用兼容转换代理${detail}`;
  }

  function renderCodexModelCompatibilityWarning() {
    const text = codexModelCompatibilityWarningText();
    document.querySelectorAll("[data-codex-model-compat-warning]").forEach((warning) => {
      warning.hidden = !text;
      warning.textContent = text;
    });
  }

  function maybeShowCodexModelCompatibilityWarning() {
    const text = codexModelCompatibilityWarningText();
    if (!text) return;
    const responsesApi = codexResponsesApiStatus();
    const key = `${codexModelCatalog.model_provider || ""}:${responsesApi.endpoint || ""}:${responsesApi.message || ""}`;
    if (window.__codexPlusResponsesApiWarningKey === key) return;
    window.__codexPlusResponsesApiWarningKey = key;
    showToast(text, null);
  }

  function modelCatalogStatusLabel(status) {
    return { ok: "已读取", missing: "未发现配置", not_configured: "未配置模型源", failed: "读取失败", checking: "正在读取" }[status] || status || "未知";
  }

  function responsesApiStatusLabel(status) {
    return { supported: "支持 /v1/responses", unsupported: "不支持 /v1/responses", failed: "探测失败", unknown: "未探测" }[status] || status || "未知";
  }

  function renderCodexModelCatalog() {
    renderCodexModelCompatibilityWarning();
    const panel = document.querySelector("[data-codex-model-catalog]");
    if (!panel) return;
    if (!codexPlusModelUnlockEnabled()) {
      panel.textContent = "未启用模型目录读取。";
      return;
    }
    const data = codexModelCatalog || {};
    if (data.status === "checking") {
      panel.textContent = "正在读取模型目录…";
      return;
    }
    const models = Array.isArray(data.models) ? data.models : [];
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const responsesApi = codexResponsesApiStatus();
    const sourceText = sources.length
      ? sources.map((source) => `${source.name || source.id || "source"}:${source.auth === "present" ? "auth" : "no-auth"}:${source.status || "unknown"}`).join(", ")
      : "无";
    const rows = [
      ["状态", data.message ? `${modelCatalogStatusLabel(data.status)}：${data.message}` : modelCatalogStatusLabel(data.status)],
      ["Provider", data.provider_name || data.model_provider || "unknown"],
      ["默认模型", data.default_model || data.model || "未识别"],
      ["模型数量", String(models.length)],
      ["模型源", sourceText],
      ["Responses API", responsesApi.message ? `${responsesApiStatusLabel(responsesApi.status)}：${responsesApi.message}` : responsesApiStatusLabel(responsesApi.status)],
    ];
    panel.innerHTML = rows.map(([label, value]) => `<div class="codex-plus-model-catalog-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join("");
    if (models.length) {
      const list = document.createElement("div");
      list.className = "codex-plus-model-list";
      list.innerHTML = models.slice(0, 12).map((model) => `<span class="codex-plus-model-chip">${escapeHtml(model)}</span>`).join("");
      if (models.length > 12) {
        const extra = document.createElement("span");
        extra.className = "codex-plus-model-chip";
        extra.textContent = `+${models.length - 12}`;
        list.appendChild(extra);
      }
      panel.appendChild(list);
    }
  }

  async function loadCodexModelCatalog(force = false) {
    if (!codexPlusModelUnlockEnabled() && !force) {
      renderCodexModelCatalog();
      return codexModelCatalog;
    }
    if (!force && codexModelCatalogPromise) return codexModelCatalogPromise;
    if (!force && codexModelCatalogLoadedAt && Date.now() - codexModelCatalogLoadedAt < 10000) return codexModelCatalog;
    codexModelCatalog = { ...codexModelCatalog, status: "checking" };
    renderCodexModelCatalog();
    codexModelCatalogPromise = postJson("/codex-model-catalog", {})
      .then((result) => {
        codexModelCatalog = result && typeof result === "object" ? result : { status: "failed", message: "模型目录响应无效", models: [], sources: [], responses_api: { status: "unknown", endpoint: "", message: "" } };
        codexModelCatalogLoadedAt = Date.now();
        renderCodexModelCatalog();
        maybeShowCodexModelCompatibilityWarning();
        patchCodexModelWhitelist();
        return codexModelCatalog;
      })
      .catch((error) => {
        codexModelCatalog = { status: "failed", message: String(error?.message || error), models: [], sources: [], responses_api: { status: "unknown", endpoint: "", message: "" } };
        codexModelCatalogLoadedAt = Date.now();
        renderCodexModelCatalog();
        return codexModelCatalog;
      })
      .finally(() => {
        codexModelCatalogPromise = null;
      });
    return codexModelCatalogPromise;
  }

  function modelReasoningEfforts() {
    return ["minimal", "low", "medium", "high", "xhigh"].map((reasoningEffort) => ({ reasoningEffort, description: `${reasoningEffort} effort` }));
  }

  function codexPlusModelDescriptor(modelName) {
    return {
      model: modelName,
      name: modelName,
      displayName: modelName,
      description: codexModelCatalog.provider_name || codexModelCatalog.model_provider || "Custom model",
      hidden: false,
      isDefault: (codexModelCatalog.default_model || codexModelCatalog.model) === modelName,
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: modelReasoningEfforts(),
    };
  }

  function modelArrayLooksPatchable(value, allowEmpty = false) {
    return Array.isArray(value)
      && (allowEmpty || value.length > 0)
      && value.every((item) => item && typeof item === "object" && typeof item.model === "string");
  }

  function patchModelArray(models, allowEmpty = false) {
    if (!modelArrayLooksPatchable(models, allowEmpty)) return false;
    const customModels = codexPlusModelNames();
    if (!customModels.length) return false;
    let changed = false;
    const existing = new Map(models.map((item) => [item.model, item]));
    models.forEach((item) => {
      if (customModels.includes(item.model) && item.hidden !== false) {
        item.hidden = false;
        changed = true;
      }
    });
    customModels.forEach((modelName) => {
      if (!existing.has(modelName)) {
        models.push(codexPlusModelDescriptor(modelName));
        changed = true;
      }
    });
    return changed;
  }

  function patchModelContainer(value) {
    if (!value || typeof value !== "object") return false;
    let changed = false;
    if (patchModelArray(value.models, "defaultModel" in value || "availableModels" in value)) changed = true;
    if (patchModelArray(value.data)) changed = true;
    if (patchModelArray(value.result)) changed = true;
    if (patchModelArray(value.pages?.[0]?.data)) changed = true;
    if (patchModelArray(value.result?.data)) changed = true;
    if (patchModelArray(value.result?.models)) changed = true;
    if (patchModelArray(value.message?.result?.data)) changed = true;
    if (patchModelArray(value.message?.result?.models)) changed = true;
    const names = codexPlusModelNames();
    if (value.availableModels instanceof Set) {
      names.forEach((name) => {
        if (!value.availableModels.has(name)) {
          value.availableModels.add(name);
          changed = true;
        }
      });
    }
    if (Array.isArray(value.availableModels)) {
      names.forEach((name) => {
        if (!value.availableModels.includes(name)) {
          value.availableModels.push(name);
          changed = true;
        }
      });
    }
    if (value.defaultModel == null && names.length > 0) {
      value.defaultModel = codexPlusModelDescriptor(names[0]);
      changed = true;
    } else if (typeof value.defaultModel === "string" && names.includes(value.defaultModel) && value.model == null) {
      value.model = value.defaultModel;
      changed = true;
    }
    return changed;
  }

  function patchStatsigModelDynamicConfig(config) {
    const names = codexPlusModelNames();
    const value = config?.value;
    if (!names.length || !value || typeof value !== "object") return config;
    const availableModels = Array.isArray(value.available_models) ? [...value.available_models] : [];
    let changed = false;
    names.forEach((name) => {
      if (!availableModels.includes(name)) {
        availableModels.push(name);
        changed = true;
      }
    });
    const nextValue = {
      ...value,
      available_models: availableModels,
      default_model: names[0] || value.default_model,
    };
    if (!changed && nextValue.default_model === value.default_model) return config;
    try {
      config.value = nextValue;
    } catch {
      return { ...config, value: nextValue };
    }
    return config;
  }

  function statsigClients() {
    const root = window.__STATSIG__ || globalThis.__STATSIG__;
    if (!root || typeof root !== "object") return [];
    const clients = [root.firstInstance, typeof root.instance === "function" ? root.instance() : null];
    if (root.instances && typeof root.instances === "object") clients.push(...Object.values(root.instances));
    return clients.filter((client, index, array) => client && typeof client === "object" && array.indexOf(client) === index);
  }

  function patchStatsigModelWhitelist() {
    statsigClients().forEach((client) => {
      if (client.__codexPlusModelWhitelistPatched || typeof client.getDynamicConfig !== "function") return;
      const originalGetDynamicConfig = client.getDynamicConfig.bind(client);
      client.getDynamicConfig = (name, options) => {
        const result = originalGetDynamicConfig(name, options);
        return name === "107580212" ? patchStatsigModelDynamicConfig(result) : result;
      };
      client.__codexPlusModelWhitelistPatched = true;
      try {
        patchStatsigModelDynamicConfig(client.getDynamicConfig("107580212", { disableExposureLog: true }));
      } catch {
      }
    });
  }

  function patchObjectGraphForModels(root, visited, depth = 0) {
    if (!root || typeof root !== "object" || visited.has(root) || depth > 5) return false;
    visited.add(root);
    let changed = patchModelContainer(root);
    if (root instanceof Element || root === window || root === document || root === document.body || root === document.documentElement) return changed;
    for (const key of Object.keys(root)) {
      if (key === "ownerDocument" || key === "parentElement" || key === "parentNode" || key === "children" || key === "childNodes") continue;
      let value;
      try {
        value = root[key];
      } catch {
        continue;
      }
      if (value && typeof value === "object" && patchObjectGraphForModels(value, visited, depth + 1)) changed = true;
    }
    return changed;
  }

  function reactFiberKeys(element) {
    return Object.keys(element).filter((key) => key.startsWith("__reactFiber") || key.startsWith("__reactInternalInstance") || key.startsWith("__reactProps"));
  }

  function patchReactModelState() {
    const visited = new WeakSet();
    const nodes = [document.body, ...document.querySelectorAll("button, [role='menu'], [role='dialog'], [data-radix-popper-content-wrapper]")].filter(Boolean);
    let changed = false;
    for (const node of nodes.slice(0, 220)) {
      for (const key of reactFiberKeys(node)) {
        if (patchObjectGraphForModels(node[key], visited)) changed = true;
      }
    }
    return changed;
  }

  function patchMcpModelResponseData(data) {
    if (data?.type !== "mcp-response") return false;
    const message = data.message || data.response;
    const requestId = message?.id != null ? String(message.id) : "";
    if (codexPlusModelListRequestIds.size > 0 && !codexPlusModelListRequestIds.has(requestId)) return false;
    codexPlusModelListRequestIds.delete(requestId);
    return patchModelContainer(data) || patchModelContainer(message) || patchModelContainer(message?.result) || patchModelContainer(message?.result?.data);
  }

  function patchAppServerModelMessages() {
    if (window.__codexPlusModelMessagePatchInstalled) return;
    window.__codexPlusModelMessagePatchInstalled = true;
    const originalDispatchEvent = window.dispatchEvent;
    window.dispatchEvent = function patchedCodexPlusDispatchEvent(event) {
      try {
        const detail = event?.detail;
        const request = detail?.request;
        if (event?.type === "codex-message-from-view" && detail?.type === "mcp-request" && request?.method === "model/list") {
          request.params = { ...(request.params || {}), includeHidden: true };
          if (request.id != null) codexPlusModelListRequestIds.add(String(request.id));
        }
        if (event?.type === "message") patchMcpModelResponseData(event.data);
      } catch (error) {
        window.__codexPlusModelPatchFailures = window.__codexPlusModelPatchFailures || [];
        window.__codexPlusModelPatchFailures.push(String(error?.stack || error));
      }
      return originalDispatchEvent.call(this, event);
    };

    window.addEventListener("message", (event) => {
      try {
        patchMcpModelResponseData(event?.data);
      } catch (error) {
        window.__codexPlusModelPatchFailures = window.__codexPlusModelPatchFailures || [];
        window.__codexPlusModelPatchFailures.push(String(error?.stack || error));
      }
    }, true);
  }
