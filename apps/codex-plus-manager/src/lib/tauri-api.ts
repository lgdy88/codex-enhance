import { invoke } from "@tauri-apps/api/core";

import { defaultRemoteControl } from "@/lib/remote-control";
import { defaultSettings, normalizeSettings } from "@/lib/settings";
import type {
  BackendSettings,
  CommandResult,
  DiagnosticsResult,
  ImageGenerationForm,
  ImageGenerationRequest,
  ImageGenerationSettingsResult,
  ImageGeneratedResult,
  InstallResult,
  LogsResult,
  OverviewResult,
  ProviderActionResult,
  RemoteControlConfig,
  RemoteControlResult,
  RemoteDependencyResult,
  RemoteInventoryResult,
  RemoteBridgeResult,
  RemoteBotMessageResult,
  SettingsResult,
  StartupResult,
  UpdateRelease,
  UpdateResult,
  WatcherResult,
} from "@/types";

const call = <T>(command: string, args?: Record<string, unknown>) => {
  if (hasTauriRuntime()) return invoke<T>(command, args);
  return Promise.resolve(previewCommand(command, args) as T);
};

type LaunchRequest = {
  appPath: string;
  extraArgs: string[];
  debugPort: number;
  helperPort: number;
};

export const loadOverview = () => call<OverviewResult>("load_overview");

export const loadSettings = () => call<SettingsResult>("load_settings");

export const readLatestLogs = (lines = 240) => call<LogsResult>("read_latest_logs", { request: { lines } });

export const copyDiagnostics = () => call<DiagnosticsResult>("copy_diagnostics");

export const loadWatcherState = () => call<WatcherResult>("load_watcher_state");

export const launchCodexPlus = (
  command: "launch_codex_plus" | "restart_codex_plus",
  request: LaunchRequest,
) =>
  call<CommandResult<Record<string, unknown>>>(command, {
    request: {
      appPath: request.appPath,
      extraArgs: request.extraArgs,
      debugPort: request.debugPort,
      helperPort: request.helperPort,
    },
  });

export const saveBackendSettings = (settings: BackendSettings) => call<SettingsResult>("save_settings", { settings });

export const resetBackendSettings = () => call<SettingsResult>("reset_settings");

export const repairBackend = () => call<SettingsResult>("repair_backend");

export const deleteUserScript = (key: string) => call<SettingsResult>("delete_user_script", { request: { key } });

export const runProviderAction = (command: "sync_providers_now" | "repair_provider_paths") => call<ProviderActionResult>(command);

export const loadRemoteControl = () => call<RemoteControlResult>("load_remote_control");

export const saveRemoteControl = (config: RemoteControlConfig) => call<RemoteControlResult>("save_remote_control", { config });

export const checkRemoteDependencies = () => call<RemoteDependencyResult>("check_remote_dependencies");

export const loadRemoteInventory = () => call<RemoteInventoryResult>("load_remote_inventory");

export const handleRemoteBotMessage = (request: { chatId: string; userId: string; text: string }) =>
  call<RemoteBotMessageResult>("handle_remote_bot_message", { request });

export const remoteBridgeStatus = () => call<RemoteBridgeResult>("remote_bridge_status");

export const startRemoteBridge = () => call<RemoteBridgeResult>("start_remote_bridge");

export const stopRemoteBridge = () => call<RemoteBridgeResult>("stop_remote_bridge");

export const readRemoteBridgeLog = () => call<RemoteBridgeResult>("read_remote_bridge_log");

export const loadImageGeneration = () => call<ImageGenerationSettingsResult>("load_image_generation");

export const saveImageGenerationConfig = (form: ImageGenerationForm, keepExistingApiKey: boolean) =>
  call<ImageGenerationSettingsResult>("save_image_generation", {
    config: {
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      model: form.model,
      keepExistingApiKey,
    },
  });

export const generateImage = (request: ImageGenerationRequest) =>
  call<ImageGeneratedResult>("generate_image", {
    request,
  });

export const installEntrypoints = () => call<InstallResult>("install_entrypoints");

export const uninstallEntrypoints = (removeOwnedData: boolean) => call<InstallResult>("uninstall_entrypoints", { options: { removeOwnedData } });

export const repairShortcuts = () => call<InstallResult>("repair_shortcuts");

export const runWatcherAction = (command: "install_watcher" | "uninstall_watcher" | "enable_watcher" | "disable_watcher") => call<WatcherResult>(command);

export const checkUpdate = () => call<UpdateResult>("check_update");

export const performUpdate = (release: UpdateRelease | null) => call<UpdateResult>("perform_update", { release });

export const openExternalUrl = (url: string) => call<CommandResult<Record<string, unknown>>>("open_external_url", { url });

export const startupOptions = () => call<StartupResult>("startup_options");

function hasTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function previewSettings(): BackendSettings {
  try {
    return normalizeSettings(JSON.parse(window.localStorage.getItem("dex-preview-settings") || "{}"));
  } catch {
    return { ...defaultSettings };
  }
}

function savePreviewSettings(settings: BackendSettings) {
  window.localStorage.setItem("dex-preview-settings", JSON.stringify(settings));
}

function previewImageConfig() {
  const raw = window.localStorage.getItem("dex-preview-image") || "{}";
  const saved = JSON.parse(raw) as Partial<ImageGenerationForm> & { apiKeyConfigured?: boolean; apiKeyHint?: string };
  const apiKeyConfigured = Boolean(saved.apiKeyConfigured || saved.apiKey);
  return {
    baseUrl: saved.baseUrl || "https://api.openai.com",
    model: saved.model || "gpt-image-2",
    apiKeyConfigured,
    apiKeyHint: apiKeyConfigured ? "已配置，尾号 demo" : "",
  };
}

function previewImagePayload(message: string) {
  return {
    status: "ok",
    message,
    config: previewImageConfig(),
    configPath: "Web preview",
    outputDir: "Web preview",
  };
}

function previewCommand(command: string, args?: Record<string, unknown>) {
  const settings = previewSettings();
  if (command === "save_settings") {
    const nextSettings = normalizeSettings((args?.settings ?? settings) as Partial<BackendSettings>);
    savePreviewSettings(nextSettings);
    return settingsPayload("Web 预览设置已保存。", nextSettings);
  }
  if (command === "reset_settings") {
    savePreviewSettings({ ...defaultSettings });
    return settingsPayload("Web 预览设置已重置。", { ...defaultSettings });
  }
  if (command === "load_settings" || command === "repair_backend" || command === "delete_user_script") {
    return settingsPayload(command === "delete_user_script" ? "Web 预览不会删除本地脚本。" : "Web 预览设置已加载。", settings);
  }
  if (command === "startup_options") {
    return { status: "ok", message: "Web 预览启动参数已读取。", showUpdate: false };
  }
  if (command === "load_image_generation") {
    return previewImagePayload("Web 预览生图配置已加载。");
  }
  if (command === "save_image_generation") {
    const config = args?.config as Partial<ImageGenerationForm> & { keepExistingApiKey?: boolean };
    const current = previewImageConfig();
    const apiKeyConfigured = Boolean(config.apiKey || (config.keepExistingApiKey && current.apiKeyConfigured));
    window.localStorage.setItem(
      "dex-preview-image",
      JSON.stringify({
        baseUrl: config.baseUrl || current.baseUrl,
        model: config.model || current.model,
        apiKeyConfigured,
        apiKeyHint: apiKeyConfigured ? "已配置，尾号 demo" : "",
      }),
    );
    return previewImagePayload("Web 预览生图配置已保存。");
  }
  if (command === "generate_image") {
    const request = args?.request as Partial<ImageGenerationRequest>;
    const prompt = request.prompt?.trim() || "Dex web preview";
    return {
      status: "ok",
      message: "Web 预览已模拟生成。桌面版会保存真实图片文件。",
      path: previewImageDataUrl(prompt),
      model: previewImageConfig().model,
      size: request.size || "1024x1024",
      outputFormat: request.outputFormat || "png",
      createdAtMs: Date.now(),
    };
  }
  if (command === "load_overview") {
    return {
      status: "ok",
      message: "Web 预览概览已加载。",
      codex_app: { status: "preview", path: null },
      codex_version: null,
      silent_shortcut: { status: "preview", path: null },
      management_shortcut: { status: "preview", path: null },
      latest_launch: null,
      current_version: "1.4.2",
      update_status: "preview",
      settings_path: "Web preview",
      logs_path: "Web preview",
    };
  }
  if (command === "load_watcher_state") {
    return { status: "ok", message: "Web 预览 Watcher 状态。", enabled: false, disabled_flag: "Web preview" };
  }
  if (command === "read_latest_logs") {
    return { status: "ok", message: "Web 预览日志已加载。", path: "Web preview", text: "Web 预览模式：桌面原生命令未连接。", lines: 1 };
  }
  if (command === "copy_diagnostics") {
    return { status: "ok", message: "Web 预览诊断已生成。", report: "Web preview diagnostics" };
  }
  if (command === "check_update") {
    return { status: "ok", message: "Web 预览不检查更新。", currentVersion: "1.4.2", latestVersion: null, updateAvailable: false, progress: 0 };
  }
  if (command === "launch_codex_plus" || command === "restart_codex_plus") {
    return { status: "accepted", message: "Web 预览不会启动桌面 Codex。", debugPort: 9229, helperPort: 57321 };
  }
  if (command === "sync_providers_now" || command === "repair_provider_paths") {
    return {
      status: "ok",
      message: "Web 预览不会修改供应商历史。",
      syncStatus: "preview",
      targetProvider: "-",
      changedSessionFiles: 0,
      sqliteRowsUpdated: 0,
      backupDir: null,
      syncMessage: "Web preview",
    };
  }
  if (command === "load_remote_control" || command === "save_remote_control") {
    const config = command === "save_remote_control" && args?.config ? args.config : defaultRemoteControl;
    return {
      message: "Web 预览移动/远程配置已加载。",
      config,
      status: remoteStatus(),
    };
  }
  if (command === "load_remote_inventory") {
    return { status: "ok", message: "Web 预览项目/对话已加载。", inventory: { status: "preview", message: "Web preview", dbPath: "", projects: [], threads: [] } };
  }
  if (command === "check_remote_dependencies") {
    return { status: "ok", message: "Web 预览依赖检查。", checks: [] };
  }
  if (command === "handle_remote_bot_message") {
    return { status: "ok", message: "Web 预览命令已处理。", response: { status: "preview", reply: "Web preview", action: "noop", selection: null, choices: [], forwardToCodex: null } };
  }
  if (["remote_bridge_status", "read_remote_bridge_log", "start_remote_bridge", "stop_remote_bridge"].includes(command)) {
    return { status: "ok", message: "Web 预览桥接状态。", bridge: bridgeStatus(), log: "Web preview" };
  }
  if (["install_entrypoints", "uninstall_entrypoints", "repair_shortcuts"].includes(command)) {
    return {
      status: "ok",
      message: "Web 预览不会改动系统入口。",
      silent_shortcut: { installed: false, path: null },
      management_shortcut: { installed: false, path: null },
    };
  }
  if (["install_watcher", "uninstall_watcher", "enable_watcher", "disable_watcher"].includes(command)) {
    return { status: "ok", message: "Web 预览不会改动 Watcher。", enabled: false, disabled_flag: "Web preview" };
  }
  if (command === "perform_update") {
    return { status: "failed", message: "Web 预览不安装更新。", currentVersion: "1.4.2", latestVersion: null, updateAvailable: false, progress: 0 };
  }
  return { status: "ok", message: "Web 预览命令已忽略。" };
}

function previewImageDataUrl(prompt: string) {
  const title = prompt.length > 52 ? `${prompt.slice(0, 52)}...` : prompt;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dff8f3"/><stop offset="1" stop-color="#fff2cf"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><rect x="80" y="80" width="864" height="864" rx="40" fill="rgba(255,255,255,.72)" stroke="rgba(13,148,136,.45)" stroke-width="8"/><text x="512" y="462" text-anchor="middle" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="48" font-weight="700" fill="#0f766e">Dex Preview</text><text x="512" y="536" text-anchor="middle" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="30" fill="#525252">${escapeSvgText(title)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvgText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function settingsPayload(message: string, settings: BackendSettings) {
  return {
    status: "ok",
    message,
    settings,
    settings_path: "Web preview",
    user_scripts: { enabled: true, scripts: [] },
  };
}

function remoteStatus() {
  return {
    status: "preview",
    message: "Web preview",
    configPath: "Web preview",
    workspaceReady: false,
    appServerUrl: "",
    routeKey: "preview",
    warnings: [],
    commands: { codexAppServer: "", feishuBridgeEnv: [], feishuBridgeNotes: [] },
    checks: [],
  };
}

function bridgeStatus() {
  return {
    status: "preview",
    message: "Web preview",
    pid: null,
    startedAtMs: null,
    stoppedAtMs: null,
    scriptPath: "",
    configPath: "",
    logPath: "",
  };
}
