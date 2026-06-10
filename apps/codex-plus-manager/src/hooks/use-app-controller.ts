import { useEffect, useMemo, useState } from "react";

import { numberOrDefault, stringifyError } from "@/lib/format";
import { defaultRemoteControl, remoteConfigToForm, remoteFormToConfig } from "@/lib/remote-control";
import { defaultSettings, normalizeSettings } from "@/lib/settings";
import {
  checkOfficialPlugins as checkOfficialPluginsCommand,
  checkRemoteDependencies as checkRemoteDependenciesCommand,
  checkUpdate as checkUpdateCommand,
  copyDiagnostics as copyDiagnosticsCommand,
  deleteUserScript as deleteUserScriptCommand,
  enhanceImagePrompt as enhanceImagePromptCommand,
  generateImage as generateImageCommand,
  handleRemoteBotMessage,
  installEntrypoints as installEntrypointsCommand,
  launchCodexPlus,
  loadImageGeneration,
  loadOverview,
  loadPromptAgent,
  loadRemoteControl,
  loadRemoteInventory,
  loadSettings,
  loadWatcherState,
  openExternalUrl as openExternalUrlCommand,
  openGeneratedImage as openGeneratedImageCommand,
  performUpdate as performUpdateCommand,
  readLatestLogs,
  readRemoteBridgeLog,
  remoteBridgeStatus,
  repairBackend as repairBackendCommand,
  repairShortcuts as repairShortcutsCommand,
  resetBackendSettings,
  runProviderAction,
  runWatcherAction,
  saveBackendSettings,
  saveGeneratedImageAs as saveGeneratedImageAsCommand,
  saveImageGenerationConfig,
  savePromptAgentConfig,
  saveRemoteControl as saveRemoteControlCommand,
  startRemoteBridge as startRemoteBridgeCommand,
  startupOptions,
  stopRemoteBridge as stopRemoteBridgeCommand,
  uninstallEntrypoints as uninstallEntrypointsCommand,
} from "@/lib/tauri-api";
import { checkForUpdate, installUpdate } from "@/lib/updater";
import type {
  Actions,
  BackendSettings,
  DiagnosticsResult,
  ImageGeneratedResult,
  ImageGenerationForm,
  ImageGenerationSettingsResult,
  LaunchForm,
  LogsResult,
  Notice,
  OfficialPluginHealthResult,
  OverviewResult,
  ProviderActionResult,
  PromptAgentForm,
  PromptAgentSettingsResult,
  RemoteBotForm,
  RemoteBotMessageResult,
  RemoteBridgeResult,
  RemoteControlForm,
  RemoteControlResult,
  RemoteDependencyResult,
  RemoteInventoryResult,
  Route,
  SettingsResult,
  Status,
  Theme,
  UpdateRelease,
  UpdateResult,
  WatcherResult,
} from "@/types";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import type { Update } from "@tauri-apps/plugin-updater";

export function useAppController() {
  const [theme, setTheme] = useState<Theme>(() => loadInitialTheme());
  const [route, setRoute] = useState<Route>(() => loadInitialRoute());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [overview, setOverview] = useState<OverviewResult | null>(null);
  const [settings, setSettings] = useState<SettingsResult | null>(null);
  const [providerResult, setProviderResult] = useState<ProviderActionResult | null>(null);
  const [logs, setLogs] = useState<LogsResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [watcher, setWatcher] = useState<WatcherResult | null>(null);
  const [officialPluginHealth, setOfficialPluginHealth] = useState<OfficialPluginHealthResult | null>(null);
  const [update, setUpdate] = useState<UpdateResult | null>(null);
  const [updateHandle, setUpdateHandle] = useState<Update | null>(null);
  const [updateRelease, setUpdateRelease] = useState<UpdateRelease | null>(null);
  const [remoteControl, setRemoteControl] = useState<RemoteControlResult | null>(null);
  const [remoteDependencies, setRemoteDependencies] = useState<RemoteDependencyResult | null>(null);
  const [remoteInventory, setRemoteInventory] = useState<RemoteInventoryResult | null>(null);
  const [remoteBotResult, setRemoteBotResult] = useState<RemoteBotMessageResult | null>(null);
  const [remoteBridge, setRemoteBridge] = useState<RemoteBridgeResult | null>(null);
  const [imageGeneration, setImageGeneration] = useState<ImageGenerationSettingsResult | null>(null);
  const [imageGenerationPrompt, setImageGenerationPrompt] = useState("");
  const [imageGenerationResult, setImageGenerationResult] = useState<ImageGeneratedResult | null>(null);
  const [imageGenerationResults, setImageGenerationResults] = useState<ImageGeneratedResult[]>(() => loadStoredImageResults());
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageGenerationStartedAtMs, setImageGenerationStartedAtMs] = useState<number | null>(null);
  const [promptAgent, setPromptAgent] = useState<PromptAgentSettingsResult | null>(null);
  const [promptAgentForm, setPromptAgentForm] = useState<PromptAgentForm>(defaultPromptAgentForm());
  const [promptEnhancing, setPromptEnhancing] = useState(false);
  const [launchForm, setLaunchForm] = useState<LaunchForm>({
    appPath: "",
    debugPort: "9229",
    helperPort: "57321",
  });
  const [settingsForm, setSettingsForm] = useState<BackendSettings>({ ...defaultSettings });
  const [remoteForm, setRemoteForm] = useState<RemoteControlForm>(remoteConfigToForm(defaultRemoteControl));
  const [remoteBotForm, setRemoteBotForm] = useState<RemoteBotForm>({
    chatId: "dex-preview-chat",
    userId: "dex-preview-user",
    text: "/项目",
  });
  const [imageForm, setImageForm] = useState<ImageGenerationForm>(defaultImageGenerationForm());
  const [removeOwnedData, setRemoveOwnedData] = useState(false);

  const showNotice = (title: string, message: string, status?: Status) => setNotice({ title, message, status });

  const run = async <T,>(task: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    try {
      return await task();
    } catch (error) {
      showNotice("调用失败", stringifyError(error), "failed");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const refreshOverview = async (silent = false) => {
    const result = await run(loadOverview);
    if (!result) return;
    setOverview(result);
    if (!silent) showNotice("概览已检查", result.message, result.status);
  };

  const refreshSettings = async (silent = false) => {
    const result = await run(loadSettings);
    if (!result) return;
    setSettings(result);
    const normalized = normalizeSettings(result.settings);
    setSettingsForm(normalized);
    setLaunchForm((current) => ({
      ...current,
      appPath: current.appPath || normalized.codexAppPath,
    }));
    if (!silent) showNotice("设置已加载", result.message, result.status);
  };

  const refreshLogs = async (silent = false) => {
    const result = await run(() => readLatestLogs(240));
    if (!result) return;
    setLogs(result);
    if (!silent) showNotice("日志已刷新", result.message, result.status);
  };

  const refreshDiagnostics = async (silent = false) => {
    const result = await run(copyDiagnosticsCommand);
    if (!result) return;
    setDiagnostics(result);
    if (!silent) showNotice("诊断已生成", result.message, result.status);
  };

  const refreshWatcher = async (silent = false) => {
    const result = await run(loadWatcherState);
    if (!result) return;
    setWatcher(result);
    if (!silent) showNotice("Watcher 状态", result.message, result.status);
  };

  const refreshOfficialPlugins = async (silent = false) => {
    const result = await run(checkOfficialPluginsCommand);
    if (!result) return;
    setOfficialPluginHealth(result);
    if (!silent) showNotice("官方插件健康", result.message, result.status);
  };

  const refreshRemoteControl = async (silent = false) => {
    const result = await run(loadRemoteControl);
    if (!result) return;
    setRemoteControl(result);
    setRemoteForm(remoteConfigToForm(result.config));
    const inventory = await run(loadRemoteInventory);
    if (inventory) setRemoteInventory(inventory);
    const bridge = await run(remoteBridgeStatus);
    if (bridge) setRemoteBridge(bridge);
    if (!silent) showNotice("移动/远程", result.message, result.status);
  };

  const refreshImageGeneration = async (silent = false) => {
    const result = await run(loadImageGeneration);
    if (!result) return;
    setImageGeneration(result);
    setImageForm((current) => ({
      ...current,
      baseUrl: result.config.baseUrl,
      apiKey: "",
      model: result.config.model,
      size: result.config.size,
      quality: result.config.quality,
      outputFormat: result.config.outputFormat,
    }));
    if (!silent) showNotice("生图配置", result.message, result.status);
  };

  const refreshPromptAgent = async (silent = false) => {
    const result = await run(loadPromptAgent);
    if (!result) return;
    setPromptAgent(result);
    setPromptAgentForm((current) => ({
      ...current,
      baseUrl: result.config.baseUrl,
      apiKey: "",
      model: result.config.model,
    }));
    if (!silent) showNotice("Agent 增强配置", result.message, result.status);
  };

  const refreshRouteData = async (next: Route) => {
    const routeLoaders: Record<Route, Array<() => Promise<void>>> = {
      overview: [() => refreshOverview(true)],
      pluginUnlock: [() => refreshSettings(true)],
      conversationEnhance: [() => refreshSettings(true)],
      userScripts: [() => refreshSettings(true)],
      providerSync: [() => refreshSettings(true)],
      imageGeneration: [() => refreshImageGeneration(true), () => refreshPromptAgent(true)],
      promptAgent: [() => refreshPromptAgent(true)],
      remoteControl: [() => refreshRemoteControl(true)],
      maintenance: [() => refreshOverview(true), () => refreshWatcher(true), () => refreshOfficialPlugins(true), () => refreshLogs(true)],
      about: [() => refreshOverview(true)],
    };

    for (const load of routeLoaders[next]) {
      await load();
    }
  };

  const navigate = async (next: Route) => {
    setRoute(next);
    syncLocationHash(next);
    await refreshRouteData(next);
  };

  const launch = async () => {
    const result = await launchCommand("launch_codex_plus");
    if (!result) return;
    showNotice("启动任务", result.message, result.status);
    await refreshOverview(true);
  };

  const restart = async () => {
    const result = await launchCommand("restart_codex_plus");
    if (!result) return;
    showNotice("重启 Codex", result.message, result.status);
    await refreshOverview(true);
  };

  const launchCommand = async (command: "launch_codex_plus" | "restart_codex_plus") =>
    run(() =>
      launchCodexPlus(command, {
        appPath: launchForm.appPath,
        extraArgs: settingsForm.codexExtraArgs,
        debugPort: numberOrDefault(launchForm.debugPort, 9229),
        helperPort: numberOrDefault(launchForm.helperPort, 57321),
      }),
    );

  const saveSettings = async () => {
    const result = await run(() => saveBackendSettings(settingsForm));
    if (!result) return;
    setSettings(result);
    const normalized = normalizeSettings(result.settings);
    setSettingsForm(normalized);
    setLaunchForm((current) => ({ ...current, appPath: normalized.codexAppPath }));
    showNotice("设置保存", result.message, result.status);
  };

  const resetSettings = async () => {
    const result = await run(resetBackendSettings);
    if (!result) return;
    setSettings(result);
    const normalized = normalizeSettings(result.settings);
    setSettingsForm(normalized);
    setLaunchForm((current) => ({ ...current, appPath: normalized.codexAppPath }));
    showNotice("设置重置", result.message, result.status);
  };

  const chooseCodexAppPath = async (mode: "folder" | "file") => {
    let selected: unknown;
    try {
      selected = await open(codexAppPickerOptions(mode));
    } catch (error) {
      showNotice("Codex 应用路径", `打开选择器失败：${stringifyError(error)}`, "failed");
      return;
    }
    if (typeof selected !== "string" || !selected.trim()) return;
    const path = selected.trim();
    setSettingsForm((current) => ({ ...current, codexAppPath: path }));
    setLaunchForm((current) => ({ ...current, appPath: path }));
    showNotice("Codex 应用路径", "已填入选择的路径，保存设置后生效。", "ok");
  };

  const repairBackend = async () => {
    const result = await run(repairBackendCommand);
    if (!result) return;
    setSettings(result);
    setSettingsForm(normalizeSettings(result.settings));
    showNotice("后端修复", result.message, result.status);
  };

  const deleteUserScript = async (key: string) => {
    const result = await run(() => deleteUserScriptCommand(key));
    if (!result) return;
    setSettings(result);
    setSettingsForm(normalizeSettings(result.settings));
    showNotice("脚本", result.message, result.status);
  };

  const providerAction = async (command: "sync_providers_now" | "repair_provider_paths") => {
    const result = await run(() => runProviderAction(command));
    if (!result) return;
    setProviderResult(result);
    showNotice("供应商历史", result.message, result.status);
  };

  const saveRemoteControl = async () => {
    const result = await run(() => saveRemoteControlCommand(remoteFormToConfig(remoteForm)));
    if (!result) return;
    setRemoteControl(result);
    setRemoteForm(remoteConfigToForm(result.config));
    const bridge = await run(remoteBridgeStatus);
    if (bridge) setRemoteBridge(bridge);
    showNotice("移动/远程", result.message, result.status);
  };

  const checkRemoteDependencies = async () => {
    const result = await run(checkRemoteDependenciesCommand);
    if (!result) return;
    setRemoteDependencies(result);
    showNotice("远程依赖诊断", result.message, result.status);
  };

  const refreshRemoteInventory = async () => {
    const result = await run(loadRemoteInventory);
    if (!result) return;
    setRemoteInventory(result);
    showNotice("本地项目/对话", result.message, result.status);
  };

  const refreshRemoteBridge = async () => {
    const result = await run(readRemoteBridgeLog);
    if (!result) return;
    setRemoteBridge(result);
    showNotice("飞书桥接", result.message, result.status);
  };

  const startRemoteBridge = async () => {
    const result = await run(startRemoteBridgeCommand);
    if (!result) return;
    setRemoteBridge(result);
    showNotice("飞书桥接", result.message, result.status);
  };

  const stopRemoteBridge = async () => {
    const result = await run(stopRemoteBridgeCommand);
    if (!result) return;
    setRemoteBridge(result);
    showNotice("飞书桥接", result.message, result.status);
  };

  const sendRemoteBotMessage = async () => {
    const result = await run(() =>
      handleRemoteBotMessage({
        chatId: remoteBotForm.chatId,
        userId: remoteBotForm.userId,
        text: remoteBotForm.text,
      }),
    );
    if (!result) return;
    setRemoteBotResult(result);
    showNotice("飞书命令路由", result.message, result.status);
  };

  const persistImageGenerationConfig = async () => {
    const keepExistingApiKey = imageGeneration?.config.apiKeyConfigured === true && imageForm.apiKey.trim().length === 0;
    const result = await saveImageGenerationConfig(imageForm, keepExistingApiKey);
    setImageGeneration(result);
    setImageForm((current) => ({
      ...current,
      baseUrl: result.config.baseUrl,
      apiKey: "",
      model: result.config.model,
    }));
    return result;
  };

  const saveImageGeneration = async () => {
    const result = await run(persistImageGenerationConfig);
    if (!result) return;
    showNotice("生图配置", result.message, result.status);
  };

  const persistPromptAgentConfig = async () => {
    const keepExistingApiKey = promptAgent?.config.apiKeyConfigured === true && promptAgentForm.apiKey.trim().length === 0;
    const result = await savePromptAgentConfig(promptAgentForm, keepExistingApiKey);
    setPromptAgent(result);
    setPromptAgentForm((current) => ({
      ...current,
      baseUrl: result.config.baseUrl,
      apiKey: "",
      model: result.config.model,
    }));
    return result;
  };

  const savePromptAgent = async () => {
    const result = await run(persistPromptAgentConfig);
    if (!result) return;
    showNotice("Agent 增强配置", result.message, result.status);
  };

  const enhanceImagePrompt = async () => {
    const prompt = imageGenerationPrompt.trim();
    if (!prompt) {
      showNotice("Agent 增强", "先输入需要润色的提示词。", "failed");
      return;
    }
    setPromptEnhancing(true);
    try {
      const saved = await persistPromptAgentConfig();
      if (saved.status === "failed") {
        showNotice("Agent 增强配置", saved.message, saved.status);
        return;
      }
      const result = await enhanceImagePromptCommand(prompt);
      if (result.status === "failed") {
        showNotice("Agent 增强", result.message, result.status);
        return;
      }
      setImageGenerationPrompt(result.prompt);
      showNotice("Agent 增强", `${result.model} 已润色提示词。`, result.status);
    } catch (error) {
      showNotice("Agent 增强", stringifyError(error), "failed");
    } finally {
      setPromptEnhancing(false);
    }
  };

  const generateImage = async () => {
    const prompt = imageGenerationPrompt.trim();
    if (!prompt) {
      showNotice("直接生图", "先输入提示词。", "failed");
      return;
    }

    const startedAt = Date.now();
    setBusy(true);
    setImageGenerationStartedAtMs(startedAt);
    setImageGenerating(true);
    setImageGenerationResult(null);
    try {
      const saved = await persistImageGenerationConfig();
      if (saved.status === "failed") {
        setImageGenerationResult(failedImageResult(saved.message, startedAt));
        showNotice("生图配置", saved.message, saved.status);
        return;
      }
      const result = await generateImageCommand({
        prompt,
        size: imageForm.size,
        quality: imageForm.quality,
        outputFormat: imageForm.outputFormat,
      });
      const finished = { ...result, durationMs: Date.now() - startedAt };
      setImageGenerationResult(finished);
      if (result.status === "failed") {
        showNotice("直接生图", result.message, result.status);
      }
      if (result.status !== "failed") {
        setImageGenerationResults((current) => storeImageResult(finished, current));
        setImageGenerationPrompt("");
      }
    } catch (error) {
      const message = stringifyError(error);
      setImageGenerationResult(failedImageResult(message, startedAt));
      showNotice("直接生图", message, "failed");
    } finally {
      await waitForMinimumLoading(startedAt, 450);
      setImageGenerating(false);
      setImageGenerationStartedAtMs(null);
      setBusy(false);
    }
  };

  const openGeneratedImage = async (path: string) => {
    const result = await run(() => openGeneratedImageCommand(path));
    if (!result) return;
    showNotice("打开图片", result.message, result.status);
  };

  const saveGeneratedImageAs = async (result: ImageGeneratedResult) => {
    if (!hasTauriRuntime()) {
      showNotice("另存图片", "Web 预览不会另存本地图片。", "ok");
      return;
    }
    const targetPath = await saveDialog({
      defaultPath: imageFileName(result) || `dex-image-${Date.now()}.${result.outputFormat || "png"}`,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (!targetPath) return;
    const saved = await run(() => saveGeneratedImageAsCommand(result.path, targetPath));
    if (!saved) return;
    showNotice("另存图片", saved.message, saved.status);
  };

  const installEntrypoints = async () => {
    const result = await run(installEntrypointsCommand);
    if (!result) return;
    showNotice("入口安装", result.message, result.status);
    await refreshOverview(true);
  };

  const uninstallEntrypoints = async () => {
    const result = await run(() => uninstallEntrypointsCommand(removeOwnedData));
    if (!result) return;
    showNotice("入口卸载", result.message, result.status);
    await refreshOverview(true);
  };

  const repairShortcuts = async () => {
    const result = await run(repairShortcutsCommand);
    if (!result) return;
    showNotice("快捷方式修复", result.message, result.status);
    await refreshOverview(true);
  };

  const watcherAction = async (command: "install_watcher" | "uninstall_watcher" | "enable_watcher" | "disable_watcher") => {
    const result = await run(() => runWatcherAction(command));
    if (!result) return;
    setWatcher(result);
    showNotice("Watcher 操作", result.message, result.status);
  };

  const checkUpdate = async (silent = false, autoInstall = false) => {
    const checkResult = await run(checkForUpdate);
    let nextUpdate = checkResult?.result ?? null;
    let nextHandle = checkResult?.update ?? null;
    let nextRelease: UpdateRelease | null = null;

    if (!nextUpdate || nextUpdate.status === "failed") {
      const fallback = await run(checkUpdateCommand);
      if (!fallback) return;
      nextUpdate = fallback;
      nextHandle = null;
      nextRelease = updateReleaseFromResult(fallback);
    }

    setUpdate(nextUpdate);
    setUpdateHandle(nextHandle);
    setUpdateRelease(nextRelease);
    if (shouldShowUpdateNotice(nextUpdate, silent)) {
      showNotice("GitHub Release 检查", nextUpdate.message, nextUpdate.status);
    }
    if (autoInstall && nextUpdate.updateAvailable) {
      await installCheckedUpdate(nextHandle, nextRelease);
    }
  };

  const installCheckedUpdate = async (handle: Update | null, release: UpdateRelease | null) => {
    if (!handle && !release) {
      showNotice("更新安装", "请先检查更新并确认有可安装版本。", "not_checked");
      return;
    }
    if (release) {
      await installReleaseUpdate(release);
      return;
    }
    if (!handle) {
      showNotice("更新安装", "请先检查更新并确认有可安装版本。", "not_checked");
      return;
    }
    let downloaded = 0;
    let total = 0;
    setBusy(true);
    try {
      const result = await installUpdate(handle, (event) => {
        if (event.event === "Started") {
          total = event.total;
          downloaded = 0;
        } else if (event.event === "Progress") {
          downloaded += event.chunkLength;
        }
        const progress = total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : update?.progress ?? 0;
        setUpdate((current) => (current ? { ...current, status: "ok", message: "正在下载并安装更新。", progress } : current));
      });
      setUpdate(result);
      showNotice("更新安装", result.message, result.status);
      return;
    } catch (error) {
      const fallback = await installUpdateFallback(error);
      if (fallback) return;
      showNotice("更新安装", `签名更新下载失败：${stringifyError(error)}`, "failed");
    } finally {
      setBusy(false);
    }
  };

  const performUpdate = async () => {
    await installCheckedUpdate(updateHandle, updateRelease);
  };

  const installReleaseUpdate = async (release: UpdateRelease) => {
    setUpdate((current) => (current ? { ...current, status: "ok", message: "正在下载并启动安装包。", progress: current.progress ?? 0 } : current));
    const result = await run(() => performUpdateCommand(release));
    if (!result) return false;
    setUpdate(result);
    showNotice("更新安装", result.message, result.status);
    return true;
  };

  const installUpdateFallback = async (error: unknown) => {
    setBusy(false);
    const fallback = await run(checkUpdateCommand);
    if (!fallback?.updateAvailable) return false;
    const fallbackRelease = updateReleaseFromResult(fallback);
    if (!fallbackRelease) return false;
    setUpdateHandle(null);
    setUpdateRelease(fallbackRelease);
    setUpdate({
      ...fallback,
      message: `签名更新下载失败，改用 GitHub 安装包下载：${stringifyError(error)}`,
      progress: 0,
    });
    return await installReleaseUpdate(fallbackRelease);
  };

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showNotice("复制成功", message, "ok");
    } catch (error) {
      showNotice("复制失败", stringifyError(error), "failed");
    }
  };

  const openExternalUrl = async (url: string) => {
    const result = await run(() => openExternalUrlCommand(url));
    if (result) showNotice("打开链接", result.message, result.status);
  };

  useEffect(() => {
    void (async () => {
      const startup = await run(startupOptions);
      if (startup?.showUpdate) {
        setRoute("about");
        void checkUpdate(false, false);
      } else {
        void checkUpdate(true, false);
      }
      await refreshOverview(true);
      await refreshSettings(true);
      await refreshRemoteControl(true);
      await refreshImageGeneration(true);
      await refreshPromptAgent(true);
      await refreshRouteData(route);
    })();
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const next = routeFromHash();
      if (!next) return;
      setRoute(next);
      syncLocationHash(next);
      void refreshRouteData(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    syncLocationHash(route);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    window.localStorage.setItem("codex-plus-theme", theme);
  }, [route, theme]);

  const actions: Actions = useMemo(
    () => ({
      refreshCurrent: () => navigate(route),
      launch,
      restart,
      repairBackend,
      installEntrypoints,
      uninstallEntrypoints,
      repairShortcuts,
      checkOfficialPlugins: () => refreshOfficialPlugins(false),
      checkUpdate: () => checkUpdate(false, true),
      performUpdate,
      saveSettings,
      resetSettings,
      chooseCodexAppPath,
      deleteUserScript,
      syncProvidersNow: () => providerAction("sync_providers_now"),
      repairProviderPaths: () => providerAction("repair_provider_paths"),
      saveRemoteControl,
      checkRemoteDependencies,
      refreshRemoteInventory,
      sendRemoteBotMessage,
      refreshRemoteBridge,
      startRemoteBridge,
      stopRemoteBridge,
      saveImageGeneration,
      savePromptAgent,
      enhanceImagePrompt,
      generateImage,
      openGeneratedImage,
      saveGeneratedImageAs,
      openExternalUrl,
      refreshLogs,
      refreshDiagnostics,
      copyLogs: () => copyText(logs?.text ?? "", "日志已复制。"),
      copyDiagnostics: () => copyText(diagnostics?.report ?? "", "诊断报告已复制。"),
      goLogs: () => navigate("maintenance"),
      checkHealth: async () => {
        await refreshOverview(true);
        await refreshWatcher(true);
        await refreshOfficialPlugins(true);
        showNotice("检查完成", "已刷新 Codex 应用、Dex 入口、Watcher 和官方插件健康。", "ok");
      },
      installWatcher: () => watcherAction("install_watcher"),
      uninstallWatcher: () => watcherAction("uninstall_watcher"),
      enableWatcher: () => watcherAction("enable_watcher"),
      disableWatcher: () => watcherAction("disable_watcher"),
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [route, launchForm, settingsForm, remoteForm, remoteBotForm, imageForm, imageGeneration, imageGenerationPrompt, promptAgent, promptAgentForm, removeOwnedData, update, logs, diagnostics, theme],
  );

  return {
    actions,
    busy,
    diagnostics,
    officialPluginHealth,
    launchForm,
    logs,
    imageForm,
    imageGenerating,
    imageGenerationResults,
    imageGenerationStartedAtMs,
    imageGenerationPrompt,
    imageGenerationResult,
    imageGeneration,
    promptAgent,
    promptAgentForm,
    promptEnhancing,
    navigate,
    notice,
    overview,
    providerResult,
    remoteBotForm,
    remoteBotResult,
    remoteBridge,
    remoteControl,
    remoteDependencies,
    remoteForm,
    remoteInventory,
    removeOwnedData,
    route,
    setLaunchForm,
    setNotice,
    setRemoteBotForm,
    setRemoteForm,
    setImageForm,
    setImageGenerationPrompt,
    setPromptAgentForm,
    setRemoveOwnedData,
    setSettingsForm,
    settings,
    settingsForm,
    theme,
    update,
    watcher,
  };
}

function defaultImageGenerationForm(): ImageGenerationForm {
  return {
    baseUrl: "https://api.openai.com",
    apiKey: "",
    model: "gpt-image-2",
    size: "1024x1024",
    quality: "medium",
    outputFormat: "png",
  };
}

function defaultPromptAgentForm(): PromptAgentForm {
  return {
    baseUrl: "https://www.xiavier.com/v1",
    apiKey: "",
    model: "gpt-5.5",
  };
}

function failedImageResult(message: string, startedAt: number): ImageGeneratedResult {
  return {
    status: "failed",
    message,
    path: "",
    previewDataUrl: "",
    model: "",
    size: "",
    outputFormat: "",
    createdAtMs: Date.now(),
    durationMs: Date.now() - startedAt,
  };
}

const IMAGE_RESULTS_KEY = "dex-image-generation-results";

function loadStoredImageResults(): ImageGeneratedResult[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(IMAGE_RESULTS_KEY) || "[]");
    return Array.isArray(stored) ? stored.slice(0, 24) : [];
  } catch {
    return [];
  }
}

function storeImageResult(result: ImageGeneratedResult, current: ImageGeneratedResult[]) {
  const next = [result, ...current.filter((item) => item.path !== result.path)].slice(0, 24);
  try {
    window.localStorage.setItem(
      IMAGE_RESULTS_KEY,
      JSON.stringify(next.map((item) => ({ ...item, previewDataUrl: "" }))),
    );
  } catch {
    // LocalStorage is best-effort; the generated image is already saved on disk.
  }
  return next;
}

function imageFileName(result: ImageGeneratedResult) {
  const normalized = result.path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || "";
}

function hasTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function waitForMinimumLoading(startedAt: number, minimumMs: number) {
  const remaining = minimumMs - (Date.now() - startedAt);
  if (remaining <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, remaining));
}

function loadInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem("codex-plus-theme") === "dark" ? "dark" : "light";
}

function loadInitialRoute(): Route {
  if (typeof window === "undefined") return "overview";
  const params = new URLSearchParams(window.location.search);
  if (params.get("showUpdate") === "1" || window.location.hash === "#about") return "about";
  return routeFromHash() ?? "overview";
}

function routeFromHash(): Route | null {
  if (typeof window === "undefined") return null;
  const hashRoute = window.location.hash.replace(/^#/, "");
  const aliases: Record<string, Route> = {
    enhance: "pluginUnlock",
    syncRemote: "providerSync",
    image: "imageGeneration",
    logs: "maintenance",
  };
  if (aliases[hashRoute]) return aliases[hashRoute];
  return isRoute(hashRoute) ? hashRoute : null;
}

function syncLocationHash(route: Route) {
  if (typeof window === "undefined") return;
  const nextHash = `#${route}`;
  if (window.location.hash === nextHash) return;
  window.history.pushState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
}

function isRoute(value: string): value is Route {
  return ["overview", "pluginUnlock", "conversationEnhance", "userScripts", "providerSync", "imageGeneration", "promptAgent", "remoteControl", "maintenance", "about"].includes(value);
}

function shouldShowUpdateNotice(result: UpdateResult, silent: boolean): boolean {
  if (result.updateAvailable) return true;
  if (silent) return false;
  return true;
}

function codexAppPickerOptions(mode: "folder" | "file") {
  if (mode === "folder") {
    return { directory: true, multiple: false, title: "选择 Codex 应用目录" };
  }
  return {
    directory: false,
    multiple: false,
    title: "选择 Codex.exe 或 Codex.app",
    filters: [{ name: "Codex 应用", extensions: ["exe", "app"] }],
  };
}

function updateReleaseFromResult(result: UpdateResult): UpdateRelease | null {
  const version = result.latestVersion || "";
  const assetName = result.assetName || "";
  const assetUrl = result.assetUrl || "";
  if (!version || !assetName || !assetUrl) return null;
  return {
    version,
    url: "",
    body: result.releaseSummary || "",
    asset_name: assetName,
    asset_url: assetUrl,
  };
}
