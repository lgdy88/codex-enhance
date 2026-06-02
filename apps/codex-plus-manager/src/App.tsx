import { CircleArrowUp, Moon, RefreshCw, Rocket, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import dexLogo from "./assets/dex-logo.png";

import { NoticeDialog } from "@/components/app";
import { Button } from "@/components/ui/button";
import { numberOrDefault, stringifyError } from "@/lib/format";
import { defaultRemoteControl, remoteConfigToForm, remoteFormToConfig } from "@/lib/remote-control";
import { defaultSettings, normalizeSettings } from "@/lib/settings";
import {
  checkRemoteDependencies as checkRemoteDependenciesCommand,
  checkUpdate as checkUpdateCommand,
  copyDiagnostics as copyDiagnosticsCommand,
  deleteUserScript as deleteUserScriptCommand,
  handleRemoteBotMessage,
  installEntrypoints as installEntrypointsCommand,
  launchCodexPlus,
  loadOverview,
  loadRemoteControl,
  loadRemoteInventory,
  loadSettings,
  loadWatcherState,
  openExternalUrl as openExternalUrlCommand,
  readRemoteBridgeLog,
  remoteBridgeStatus,
  readLatestLogs,
  repairBackend as repairBackendCommand,
  repairShortcuts as repairShortcutsCommand,
  resetBackendSettings,
  performUpdate as performUpdateCommand,
  saveRemoteControl as saveRemoteControlCommand,
  runProviderAction,
  runWatcherAction,
  saveBackendSettings,
  startRemoteBridge as startRemoteBridgeCommand,
  startupOptions,
  stopRemoteBridge as stopRemoteBridgeCommand,
  uninstallEntrypoints as uninstallEntrypointsCommand,
} from "@/lib/tauri-api";
import { checkForUpdate, installUpdate } from "@/lib/updater";
import { routes, routeSubtitle, routeTitle } from "@/routes";
import {
  AboutScreen,
  DiagnosticsScreen,
  EnhanceScreen,
  LogsScreen,
  MaintenanceScreen,
  OverviewScreen,
  ProviderSyncScreen,
  RemoteControlScreen,
  SettingsScreen,
  UserScriptsScreen,
} from "@/screens";
import type {
  Actions,
  BackendSettings,
  DiagnosticsResult,
  LaunchForm,
  LogsResult,
  Notice,
  OverviewResult,
  ProviderActionResult,
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
import type { Update } from "@tauri-apps/plugin-updater";

export function App() {
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
  const [update, setUpdate] = useState<UpdateResult | null>(null);
  const [updateHandle, setUpdateHandle] = useState<Update | null>(null);
  const [updateRelease, setUpdateRelease] = useState<UpdateRelease | null>(null);
  const [remoteControl, setRemoteControl] = useState<RemoteControlResult | null>(null);
  const [remoteDependencies, setRemoteDependencies] = useState<RemoteDependencyResult | null>(null);
  const [remoteInventory, setRemoteInventory] = useState<RemoteInventoryResult | null>(null);
  const [remoteBotResult, setRemoteBotResult] = useState<RemoteBotMessageResult | null>(null);
  const [remoteBridge, setRemoteBridge] = useState<RemoteBridgeResult | null>(null);
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

  const navigate = async (next: Route) => {
    setRoute(next);
    if (next === "overview" || next === "about") await refreshOverview(true);
    if (next === "settings" || next === "userScripts" || next === "providerSync" || next === "enhance") await refreshSettings(true);
    if (next === "remoteControl") await refreshRemoteControl(true);
    if (next === "logs") await refreshLogs(true);
    if (next === "diagnostics") await refreshDiagnostics(true);
    if (next === "maintenance") {
      await refreshOverview(true);
      await refreshWatcher(true);
    }
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
    showNotice("用户脚本", result.message, result.status);
  };

  const providerAction = async (command: "sync_providers_now" | "repair_provider_paths") => {
    const result = await run(() => runProviderAction(command));
    if (!result) return;
    setProviderResult(result);
    showNotice("Provider History", result.message, result.status);
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
      setUpdate((current) => (current ? { ...current, status: "ok", message: "正在下载并启动安装包。", progress: current.progress ?? 0 } : current));
      const result = await run(() => performUpdateCommand(release));
      if (!result) return;
      setUpdate(result);
      showNotice("更新安装", result.message, result.status);
      return;
    }
    if (!handle) {
      showNotice("更新安装", "请先检查更新并确认有可安装版本。", "not_checked");
      return;
    }
    let downloaded = 0;
    let total = 0;
    const result = await run(() =>
      installUpdate(handle, (event) => {
        if (event.event === "Started") {
          total = event.total;
          downloaded = 0;
        } else if (event.event === "Progress") {
          downloaded += event.chunkLength;
        }
        const progress = total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : update?.progress ?? 0;
        setUpdate((current) => (current ? { ...current, status: "ok", message: "正在下载并安装更新。", progress } : current));
      }),
    );
    if (!result) return;
    setUpdate(result);
    showNotice("更新安装", result.message, result.status);
  };

  const performUpdate = async () => {
    await installCheckedUpdate(updateHandle, updateRelease);
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
    })();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    window.localStorage.setItem("codex-plus-theme", theme);
  }, [theme]);

  const actions: Actions = useMemo(
    () => ({
      refreshCurrent: () => navigate(route),
      launch,
      restart,
      repairBackend,
      installEntrypoints,
      uninstallEntrypoints,
      repairShortcuts,
      checkUpdate: () => checkUpdate(false, true),
      performUpdate,
      saveSettings,
      resetSettings,
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
      openExternalUrl,
      refreshLogs,
      refreshDiagnostics,
      copyLogs: () => copyText(logs?.text ?? "", "日志已复制。"),
      copyDiagnostics: () => copyText(diagnostics?.report ?? "", "诊断报告已复制。"),
      goLogs: () => navigate("logs"),
      checkHealth: async () => {
        await refreshOverview(true);
        await refreshWatcher(true);
        showNotice("检查完成", "已刷新 Codex 应用、Dex 入口和 Watcher 状态。", "ok");
      },
      installWatcher: () => watcherAction("install_watcher"),
      uninstallWatcher: () => watcherAction("uninstall_watcher"),
      enableWatcher: () => watcherAction("enable_watcher"),
      disableWatcher: () => watcherAction("disable_watcher"),
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [route, launchForm, settingsForm, remoteForm, remoteBotForm, removeOwnedData, update, logs, diagnostics, theme],
  );

  return (
    <div className={`shell ${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src={dexLogo} alt="Dex" />
          {update?.updateAvailable ? (
            <Button
              aria-label={`发现 Dex 更新 ${update.latestVersion ?? ""}`}
              className="brand-update-button active"
              disabled={busy}
              onClick={() => void navigate("about")}
              size="icon"
              title={`发现 Dex 更新 ${update.latestVersion ?? ""}`}
              type="button"
              variant="ghost"
            >
              <CircleArrowUp className="h-5 w-5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <nav className="nav">
          {routes.map((item) => {
            const Icon = item.icon;
            return (
              <button className={`nav-item ${route === item.id ? "active" : ""}`} key={item.id} onClick={() => void navigate(item.id)} title={item.label} type="button">
                <span className="nav-icon">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{routeTitle(route)}</h1>
            <p>{routeSubtitle(route)}</p>
          </div>
          <div className="topbar-actions">
            <Button onClick={actions.toggleTheme} size="icon" title={theme === "dark" ? "切换到浅色" : "切换到深色"} variant="outline">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button onClick={() => void actions.launch()} title="启动 Dex">
              <Rocket className="h-4 w-4" />
              启动 Dex
            </Button>
            <Button onClick={() => void actions.restart()} title="重启 Codex" variant="outline">
              <Rocket className="h-4 w-4" />
              重启 Codex
            </Button>
            <Button onClick={() => void actions.refreshCurrent()} size="icon" title="刷新当前页面" variant="outline">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </header>
        {busy ? <div className="busy">正在处理...</div> : null}
        <section className="screen">
          {route === "overview" ? <OverviewScreen overview={overview} actions={actions} /> : null}
          {route === "enhance" ? <EnhanceScreen form={settingsForm} onFormChange={setSettingsForm} actions={actions} /> : null}
          {route === "userScripts" ? <UserScriptsScreen settings={settings} actions={actions} /> : null}
          {route === "providerSync" ? (
            <ProviderSyncScreen settings={settings} form={settingsForm} result={providerResult} onFormChange={setSettingsForm} actions={actions} />
          ) : null}
          {route === "remoteControl" ? (
            <RemoteControlScreen
              result={remoteControl}
              dependencies={remoteDependencies}
              inventory={remoteInventory}
              bridge={remoteBridge}
              botForm={remoteBotForm}
              botResult={remoteBotResult}
              form={remoteForm}
              onFormChange={setRemoteForm}
              onBotFormChange={setRemoteBotForm}
              actions={actions}
            />
          ) : null}
          {route === "maintenance" ? (
            <MaintenanceScreen
              overview={overview}
              watcher={watcher}
              launchForm={launchForm}
              onLaunchFormChange={setLaunchForm}
              removeOwnedData={removeOwnedData}
              onRemoveOwnedDataChange={setRemoveOwnedData}
              actions={actions}
            />
          ) : null}
          {route === "settings" ? <SettingsScreen settings={settings} theme={theme} form={settingsForm} onFormChange={setSettingsForm} actions={actions} /> : null}
          {route === "logs" ? <LogsScreen logs={logs} actions={actions} /> : null}
          {route === "diagnostics" ? <DiagnosticsScreen diagnostics={diagnostics} actions={actions} /> : null}
          {route === "about" ? <AboutScreen overview={overview} update={update} actions={actions} /> : null}
        </section>
      </main>
      {notice ? <NoticeDialog notice={notice} onClose={() => setNotice(null)} /> : null}
    </div>
  );
}

function loadInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem("codex-plus-theme") === "dark" ? "dark" : "light";
}

function loadInitialRoute(): Route {
  if (typeof window === "undefined") return "overview";
  const params = new URLSearchParams(window.location.search);
  if (params.get("showUpdate") === "1" || window.location.hash === "#about") return "about";
  return "overview";
}

function shouldShowUpdateNotice(result: UpdateResult, silent: boolean): boolean {
  if (result.updateAvailable) return true;
  if (silent) return false;
  return true;
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
