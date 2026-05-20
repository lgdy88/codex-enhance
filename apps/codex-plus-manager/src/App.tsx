import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  Bell,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  Hammer,
  Info,
  LayoutDashboard,
  Link2,
  Moon,
  RefreshCw,
  Rocket,
  ScrollText,
  Settings,
  Sun,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Status = "ok" | "failed" | "accepted" | "not_checked" | string;

type CommandResult<T> = T & {
  status: Status;
  message: string;
};

type PathState = {
  status: string;
  path: string | null;
};

type LaunchStatus = {
  status: string;
  message: string;
  started_at_ms: number;
  debug_port: number | null;
  helper_port: number | null;
  codex_app: string | null;
};

type OverviewResult = CommandResult<{
  codex_app: PathState;
  codex_version: string | null;
  silent_shortcut: PathState;
  management_shortcut: PathState;
  latest_launch: LaunchStatus | null;
  current_version: string;
  update_status: string;
  settings_path: string;
  logs_path: string;
}>;

type BackendSettings = {
  providerSyncEnabled: boolean;
  enhancementsEnabled: boolean;
};

type UserScriptInventory = {
  enabled?: boolean;
  scripts?: Array<{
    key: string;
    name: string;
    source: string;
    enabled: boolean;
    status: string;
    error: string;
  }>;
};

type SettingsResult = CommandResult<{
  settings: BackendSettings;
  settings_path: string;
  user_scripts: UserScriptInventory;
}>;

type ProviderActionResult = CommandResult<{
  syncStatus?: string;
  targetProvider?: string;
  changedSessionFiles?: number;
  sqliteRowsUpdated?: number;
  backupDir?: string | null;
  syncMessage?: string;
}>;

type LogsResult = CommandResult<{
  path: string;
  text: string;
  lines: number;
}>;

type DiagnosticsResult = CommandResult<{
  report: string;
}>;

type WatcherResult = CommandResult<{
  enabled: boolean;
  disabled_flag: string;
}>;

type InstallResult = CommandResult<{
  silent_shortcut: { installed: boolean; path: string | null };
  management_shortcut: { installed: boolean; path: string | null };
}>;

type UpdateResult = CommandResult<{
  currentVersion: string;
  latestVersion?: string | null;
  releaseSummary?: string;
  assetName?: string | null;
  assetUrl?: string | null;
  updateAvailable?: boolean;
  installedPath?: string;
  progress?: number;
}>;

type StartupResult = CommandResult<{
  showUpdate: boolean;
}>;

type Route =
  | "overview"
  | "enhance"
  | "userScripts"
  | "providerSync"
  | "maintenance"
  | "settings"
  | "logs"
  | "diagnostics"
  | "about";

type Theme = "dark" | "light";

const routes: Array<{ id: Route; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "enhance", label: "增强功能", icon: Hammer },
  { id: "userScripts", label: "用户脚本", icon: FileCode2 },
  { id: "providerSync", label: "Provider History", icon: Link2 },
  { id: "maintenance", label: "安装维护", icon: Wrench },
  { id: "settings", label: "设置", icon: Settings },
  { id: "logs", label: "日志", icon: ScrollText },
  { id: "diagnostics", label: "诊断", icon: Activity },
  { id: "about", label: "关于", icon: Info },
];

const defaultSettings: BackendSettings = {
  providerSyncEnabled: false,
  enhancementsEnabled: true,
};

export function App() {
  const [theme, setTheme] = useState<Theme>(() => loadInitialTheme());
  const [route, setRoute] = useState<Route>(() => loadInitialRoute());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string; status?: Status } | null>(null);
  const [overview, setOverview] = useState<OverviewResult | null>(null);
  const [settings, setSettings] = useState<SettingsResult | null>(null);
  const [providerResult, setProviderResult] = useState<ProviderActionResult | null>(null);
  const [logs, setLogs] = useState<LogsResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [watcher, setWatcher] = useState<WatcherResult | null>(null);
  const [update, setUpdate] = useState<UpdateResult | null>(null);
  const [launchForm, setLaunchForm] = useState({
    appPath: "",
    debugPort: "9229",
    helperPort: "57321",
  });
  const [settingsForm, setSettingsForm] = useState<BackendSettings>({ ...defaultSettings });
  const [removeOwnedData, setRemoveOwnedData] = useState(false);

  const call = <T,>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args);

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
    const result = await run(() => call<OverviewResult>("load_overview"));
    if (!result) return;
    setOverview(result);
    if (!silent) showNotice("概览已检查", result.message, result.status);
  };

  const refreshSettings = async (silent = false) => {
    const result = await run(() => call<SettingsResult>("load_settings"));
    if (!result) return;
    setSettings(result);
    setSettingsForm(normalizeSettings(result.settings));
    if (!silent) showNotice("设置已加载", result.message, result.status);
  };

  const refreshLogs = async (silent = false) => {
    const result = await run(() => call<LogsResult>("read_latest_logs", { request: { lines: 240 } }));
    if (!result) return;
    setLogs(result);
    if (!silent) showNotice("日志已刷新", result.message, result.status);
  };

  const refreshDiagnostics = async (silent = false) => {
    const result = await run(() => call<DiagnosticsResult>("copy_diagnostics"));
    if (!result) return;
    setDiagnostics(result);
    if (!silent) showNotice("诊断已生成", result.message, result.status);
  };

  const refreshWatcher = async (silent = false) => {
    const result = await run(() => call<WatcherResult>("load_watcher_state"));
    if (!result) return;
    setWatcher(result);
    if (!silent) showNotice("Watcher 状态", result.message, result.status);
  };

  const navigate = async (next: Route) => {
    setRoute(next);
    if (next === "overview" || next === "about") await refreshOverview(true);
    if (next === "settings" || next === "userScripts" || next === "providerSync" || next === "enhance") await refreshSettings(true);
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
      call<CommandResult<Record<string, unknown>>>(command, {
        request: {
          appPath: launchForm.appPath,
          debugPort: numberOrDefault(launchForm.debugPort, 9229),
          helperPort: numberOrDefault(launchForm.helperPort, 57321),
        },
      }),
    );

  const saveSettings = async () => {
    const result = await run(() => call<SettingsResult>("save_settings", { settings: settingsForm }));
    if (!result) return;
    setSettings(result);
    setSettingsForm(normalizeSettings(result.settings));
    showNotice("设置保存", result.message, result.status);
  };

  const resetSettings = async () => {
    const result = await run(() => call<SettingsResult>("reset_settings"));
    if (!result) return;
    setSettings(result);
    setSettingsForm(normalizeSettings(result.settings));
    showNotice("设置重置", result.message, result.status);
  };

  const repairBackend = async () => {
    const result = await run(() => call<SettingsResult>("repair_backend"));
    if (!result) return;
    setSettings(result);
    setSettingsForm(normalizeSettings(result.settings));
    showNotice("后端修复", result.message, result.status);
  };

  const providerAction = async (command: "sync_providers_now" | "repair_provider_paths") => {
    const result = await run(() => call<ProviderActionResult>(command));
    if (!result) return;
    setProviderResult(result);
    showNotice("Provider History", result.message, result.status);
  };

  const installEntrypoints = async () => {
    const result = await run(() => call<InstallResult>("install_entrypoints"));
    if (!result) return;
    showNotice("入口安装", result.message, result.status);
    await refreshOverview(true);
  };

  const uninstallEntrypoints = async () => {
    const result = await run(() => call<InstallResult>("uninstall_entrypoints", { options: { removeOwnedData } }));
    if (!result) return;
    showNotice("入口卸载", result.message, result.status);
    await refreshOverview(true);
  };

  const repairShortcuts = async () => {
    const result = await run(() => call<InstallResult>("repair_shortcuts"));
    if (!result) return;
    showNotice("快捷方式修复", result.message, result.status);
    await refreshOverview(true);
  };

  const watcherAction = async (command: string) => {
    const result = await run(() => call<WatcherResult>(command));
    if (!result) return;
    setWatcher(result);
    showNotice("Watcher 操作", result.message, result.status);
  };

  const checkUpdate = async (silent = false) => {
    const result = await run(() => call<UpdateResult>("check_update"));
    if (!result) return;
    setUpdate(result);
    if (!silent || result.updateAvailable) showNotice("GitHub Release 检查", result.message, result.status);
  };

  const performUpdate = async () => {
    const release =
      update?.latestVersion && update.assetName && update.assetUrl
        ? {
            version: update.latestVersion,
            url: "",
            body: update.releaseSummary ?? "",
            asset_name: update.assetName,
            asset_url: update.assetUrl,
          }
        : null;
    const result = await run(() => call<UpdateResult>("perform_update", { release }));
    if (!result) return;
    setUpdate(result);
    showNotice("更新安装", result.message, result.status);
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
    const result = await run(() => call<CommandResult<Record<string, unknown>>>("open_external_url", { url }));
    if (result) showNotice("打开链接", result.message, result.status);
  };

  const showNotice = (title: string, message: string, status?: Status) => setNotice({ title, message, status });

  useEffect(() => {
    void (async () => {
      const startup = await run(() => call<StartupResult>("startup_options"));
      if (startup?.showUpdate) {
        setRoute("about");
        void checkUpdate(false);
      } else {
        void checkUpdate(true);
      }
      await refreshOverview(true);
      await refreshSettings(true);
    })();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    window.localStorage.setItem("codex-plus-theme", theme);
  }, [theme]);

  const actions = useMemo(
    () => ({
      refreshCurrent: () => navigate(route),
      launch,
      restart,
      repairBackend,
      installEntrypoints,
      uninstallEntrypoints,
      repairShortcuts,
      checkUpdate,
      performUpdate,
      saveSettings,
      resetSettings,
      syncProvidersNow: () => providerAction("sync_providers_now"),
      repairProviderPaths: () => providerAction("repair_provider_paths"),
      openExternalUrl,
      refreshLogs,
      refreshDiagnostics,
      copyLogs: () => copyText(logs?.text ?? "", "日志已复制。"),
      copyDiagnostics: () => copyText(diagnostics?.report ?? "", "诊断报告已复制。"),
      goLogs: () => navigate("logs"),
      checkHealth: async () => {
        await refreshOverview(true);
        await refreshWatcher(true);
        showNotice("检查完成", "已刷新 Codex 应用、入口和 Watcher 状态。", "ok");
      },
      installWatcher: () => watcherAction("install_watcher"),
      uninstallWatcher: () => watcherAction("uninstall_watcher"),
      enableWatcher: () => watcherAction("enable_watcher"),
      disableWatcher: () => watcherAction("disable_watcher"),
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    }),
    [route, launchForm, settingsForm, removeOwnedData, update, logs, diagnostics, theme],
  );

  return (
    <div className={`shell ${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C++</div>
          <div>
            <div className="brand-title">Codex++</div>
            <div className="brand-subtitle">桌面管理器</div>
          </div>
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
            <Button onClick={() => void actions.launch()} title="启动 Codex++">
              <Rocket className="h-4 w-4" />
              启动 Codex++
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

type Actions = {
  refreshCurrent: () => Promise<void>;
  launch: () => Promise<void>;
  restart: () => Promise<void>;
  repairBackend: () => Promise<void>;
  installEntrypoints: () => Promise<void>;
  uninstallEntrypoints: () => Promise<void>;
  repairShortcuts: () => Promise<void>;
  checkUpdate: () => Promise<void>;
  performUpdate: () => Promise<void>;
  saveSettings: () => Promise<void>;
  resetSettings: () => Promise<void>;
  syncProvidersNow: () => Promise<void>;
  repairProviderPaths: () => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  refreshLogs: () => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
  copyLogs: () => Promise<void>;
  copyDiagnostics: () => Promise<void>;
  goLogs: () => Promise<void>;
  installWatcher: () => Promise<void>;
  uninstallWatcher: () => Promise<void>;
  enableWatcher: () => Promise<void>;
  disableWatcher: () => Promise<void>;
  toggleTheme: () => void;
  checkHealth: () => Promise<void>;
};

function OverviewScreen({ overview, actions }: { overview: OverviewResult | null; actions: Actions }) {
  const health = healthItems(overview);
  return (
    <>
      <Panel className="hero-panel">
        <CardContent>
          <div className="hero-layout">
            <div>
              <div className="eyebrow">Codex++ 桌面状态</div>
              <h2>{health.every((item) => item.ok) ? "运行环境看起来正常" : "有项目需要处理"}</h2>
              <p>桌面版只管理启动、增强、Provider History、维护和诊断，不接管上游代理或远端推荐默认项。</p>
            </div>
            <Toolbar>
              <Button onClick={() => void actions.checkHealth()}>
                <RefreshCw className="h-4 w-4" />
                检查
              </Button>
              <Button variant="secondary" onClick={() => void actions.repairShortcuts()}>
                <Wrench className="h-4 w-4" />
                修复入口
              </Button>
              <Button variant="secondary" onClick={() => void actions.repairBackend()}>修复后端</Button>
            </Toolbar>
          </div>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="健康检查" detail="只展示本地桌面管理器需要处理的关键项" />
        <CardContent>
          <div className="health-grid">
            <div className="health-item ok">
              <CheckCircle2 className="h-4 w-4" />
              <div>
                <strong>Codex 版本</strong>
                <span>{overview?.codex_version ?? "未检测到 Codex 应用版本。"}</span>
              </div>
              <Badge status={overview?.codex_version ? "ok" : "not_checked"} />
            </div>
            {health.map((item) => (
              <div className={`health-item ${item.ok ? "ok" : "needs-fix"}`} key={item.title}>
                {item.ok ? <CheckCircle2 className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
                <Badge status={item.status} />
              </div>
            ))}
          </div>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="最近启动" detail={overview?.logs_path ?? "暂无状态文件"} />
        <CardContent>
          <LatestLaunch status={overview?.latest_launch ?? null} />
          <Toolbar sticky>
            <Button variant="secondary" onClick={() => void actions.goLogs()}>打开日志</Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}

function EnhanceScreen({ form, onFormChange, actions }: { form: BackendSettings; onFormChange: (value: BackendSettings) => void; actions: Actions }) {
  return (
    <Panel>
      <CardHead title="增强功能" detail="控制本地 renderer 注入能力，不写 Codex 认证或 provider 配置" />
      <CardContent>
        <label className="switch-row">
          <input checked={form.enhancementsEnabled} onChange={(event) => onFormChange({ ...form, enhancementsEnabled: event.currentTarget.checked })} type="checkbox" />
          <span>
            <strong>启用 Codex++ 增强功能</strong>
            <small>关闭后会停用删除、导出、项目移动、Timeline、插件相关和注入菜单位置增强。</small>
          </span>
        </label>
        <div className="feature-list">
          <FeatureItem title="会话删除" detail="会话列表悬停删除，并保留撤销能力。" enabled={form.enhancementsEnabled} />
          <FeatureItem title="Markdown 导出" detail="按本地 rollout 导出带时间戳的 Markdown。" enabled={form.enhancementsEnabled} />
          <FeatureItem title="项目移动" detail="把会话移动到普通对话或其他本地项目。" enabled={form.enhancementsEnabled} />
          <FeatureItem title="Timeline" detail="在对话右侧显示用户提问时间线。" enabled={form.enhancementsEnabled} />
          <FeatureItem title="用户脚本" detail="合并内置脚本和用户脚本包后注入。" enabled={form.enhancementsEnabled} />
        </div>
        <Toolbar>
          <Button onClick={() => void actions.saveSettings()}>保存增强设置</Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}

function UserScriptsScreen({ settings, actions }: { settings: SettingsResult | null; actions: Actions }) {
  const inventory = settings?.user_scripts;
  const scripts = inventory?.scripts ?? [];
  return (
    <>
      <Panel>
        <CardHead title="用户脚本" detail={`${scripts.length} 个脚本，整体 ${inventory?.enabled === false ? "关闭" : "开启"}`} />
        <CardContent>
          <div className="metric-list">
            <Metric label="整体状态" value={inventory?.enabled === false ? "关闭" : "开启"} />
            <Metric label="设置文件" value={settings?.settings_path ?? "未加载"} />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.refreshCurrent()}>
              <RefreshCw className="h-4 w-4" />
              刷新脚本列表
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="脚本列表" detail="插件内可启用、禁用和重新加载；管理工具用于集中查看" />
        <CardContent>
          <div className="table">
            {scripts.length ? scripts.map((script) => <ScriptRow key={script.key} script={script} />) : <div className="empty">未发现用户脚本。</div>}
          </div>
        </CardContent>
      </Panel>
    </>
  );
}

function ProviderSyncScreen({
  settings,
  form,
  result,
  onFormChange,
  actions,
}: {
  settings: SettingsResult | null;
  form: BackendSettings;
  result: ProviderActionResult | null;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  return (
    <>
      <Panel>
        <CardHead title="Provider History" detail="路径修复与 provider metadata 收敛分开执行" />
        <CardContent>
          <label className="switch-row">
            <input checked={form.providerSyncEnabled} onChange={(event) => onFormChange({ ...form, providerSyncEnabled: event.currentTarget.checked })} type="checkbox" />
            <span>
              <strong>启动前自动同步 provider metadata</strong>
              <small>开启后，仅在通过 Codex++ 启动 Codex 前自动同步一次历史会话的 provider 字段。</small>
            </span>
          </label>
          <div className="metric-list">
            <Metric label="自动同步" value={form.providerSyncEnabled ? "启动前执行" : "关闭"} />
            <Metric label="设置文件" value={settings?.settings_path ?? "未加载"} />
            <Metric label="最近结果" value={result?.syncStatus ?? "未执行"} />
            <Metric label="目标 provider" value={result?.targetProvider ?? "-"} />
            <Metric label="会话文件" value={String(result?.changedSessionFiles ?? 0)} />
            <Metric label="SQLite 行数" value={String(result?.sqliteRowsUpdated ?? 0)} />
          </div>
          {result?.backupDir ? <div className="path-line compact-path">备份：{result.backupDir}</div> : null}
          <Toolbar>
            <Button onClick={() => void actions.saveSettings()}>保存自动同步设置</Button>
            <Button onClick={() => void actions.repairProviderPaths()} variant="outline">
              <RefreshCw className="h-4 w-4" />
              只修路径
            </Button>
            <Button onClick={() => void actions.syncProvidersNow()} variant="secondary">收敛 provider</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="边界" detail="路径修复更安全，provider 收敛用于兼容历史可见性" />
        <CardContent>
          <GuideList
            items={[
              "只修路径会清理 Windows \\\\? 前缀和项目路径格式，不改变会话 provider。",
              "收敛 provider 会备份后改写历史会话 metadata，让列表按当前 provider 可见。",
              "这些动作不保证 encrypted_content 能跨账号或跨 provider 续聊。",
            ]}
          />
        </CardContent>
      </Panel>
    </>
  );
}

function MaintenanceScreen({
  overview,
  watcher,
  launchForm,
  onLaunchFormChange,
  removeOwnedData,
  onRemoveOwnedDataChange,
  actions,
}: {
  overview: OverviewResult | null;
  watcher: WatcherResult | null;
  launchForm: { appPath: string; debugPort: string; helperPort: string };
  onLaunchFormChange: (next: { appPath: string; debugPort: string; helperPort: string }) => void;
  removeOwnedData: boolean;
  onRemoveOwnedDataChange: (value: boolean) => void;
  actions: Actions;
}) {
  return (
    <>
      <Panel>
        <CardHead title="检查与修复" detail="检查入口、Codex 应用和 Watcher 状态" />
        <CardContent>
          <div className="status-table">
            <StatusRow title="Codex 应用" status={overview?.codex_app.status} path={overview?.codex_app.path} />
            <StatusRow title="静默启动入口" status={overview?.silent_shortcut.status} path={overview?.silent_shortcut.path} />
            <StatusRow title="管理工具入口" status={overview?.management_shortcut.status} path={overview?.management_shortcut.path} />
            <StatusRow title="Watcher 自动接管" status={watcher?.enabled ? "ok" : "disabled"} path={watcher?.disabled_flag} />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.checkHealth()}>检查</Button>
            <Button variant="secondary" onClick={() => void actions.repairShortcuts()}>修复快捷方式</Button>
            <Button variant="secondary" onClick={() => void actions.repairBackend()}>修复后端</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="入口管理" detail="快捷方式写入系统实际桌面位置，不使用写死桌面路径" />
        <CardContent>
          <label className="check-row">
            <input checked={removeOwnedData} onChange={(event) => onRemoveOwnedDataChange(event.currentTarget.checked)} type="checkbox" />
            <span>卸载时移除 Codex++ 托管数据</span>
          </label>
          <Toolbar>
            <Button onClick={() => void actions.installEntrypoints()}>安装入口</Button>
            <Button variant="secondary" onClick={() => void actions.uninstallEntrypoints()}>卸载入口</Button>
            <Button variant="secondary" onClick={() => void actions.repairShortcuts()}>修复入口</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="自动接管" detail="Watcher 用于保持 Codex++ 接管状态" />
        <CardContent>
          <Toolbar>
            <Button variant="secondary" onClick={() => void actions.installWatcher()}>安装 watcher</Button>
            <Button variant="secondary" onClick={() => void actions.uninstallWatcher()}>移除 watcher</Button>
            <Button variant="secondary" onClick={() => void actions.enableWatcher()}>启用</Button>
            <Button variant="secondary" onClick={() => void actions.disableWatcher()}>禁用</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="手动启动" detail="留空应用路径时使用自动探测" />
        <CardContent>
          <Field label="应用路径覆盖">
            <Input value={launchForm.appPath} onChange={(event) => onLaunchFormChange({ ...launchForm, appPath: event.currentTarget.value })} />
          </Field>
          <div className="form-row">
            <Field label="Debug 端口">
              <Input value={launchForm.debugPort} onChange={(event) => onLaunchFormChange({ ...launchForm, debugPort: event.currentTarget.value })} />
            </Field>
            <Field label="Helper 端口">
              <Input value={launchForm.helperPort} onChange={(event) => onLaunchFormChange({ ...launchForm, helperPort: event.currentTarget.value })} />
            </Field>
          </div>
          <Toolbar>
            <Button onClick={() => void actions.launch()}>启动 Codex++</Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}

function SettingsScreen({
  settings,
  theme,
  form,
  onFormChange,
  actions,
}: {
  settings: SettingsResult | null;
  theme: Theme;
  form: BackendSettings;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  return (
    <Panel>
      <CardHead title="基础设置" detail={settings?.settings_path ?? ""} />
      <CardContent>
        <div className="theme-row">
          <div>
            <strong>界面主题</strong>
            <span>当前为{theme === "dark" ? "深色" : "浅色"}模式。</span>
          </div>
          <Button variant="secondary" onClick={actions.toggleTheme}>切换主题</Button>
        </div>
        <div className="setting-grid">
          <label className="switch-row">
            <input checked={form.enhancementsEnabled} onChange={(event) => onFormChange({ ...form, enhancementsEnabled: event.currentTarget.checked })} type="checkbox" />
            <span>
              <strong>增强功能</strong>
              <small>控制 renderer 注入能力。</small>
            </span>
          </label>
          <label className="switch-row">
            <input checked={form.providerSyncEnabled} onChange={(event) => onFormChange({ ...form, providerSyncEnabled: event.currentTarget.checked })} type="checkbox" />
            <span>
              <strong>Provider 自动同步</strong>
              <small>通过 Codex++ 启动前自动运行 provider metadata 同步。</small>
            </span>
          </label>
        </div>
        <Toolbar>
          <Button onClick={() => void actions.saveSettings()}>保存设置</Button>
          <Button variant="secondary" onClick={() => void actions.resetSettings()}>重置设置</Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}

function LogsScreen({ logs, actions }: { logs: LogsResult | null; actions: Actions }) {
  const lines = splitLogLines(logs?.text ?? "");
  return (
    <Panel fill>
      <CardHead title="最近日志" detail={logs?.path ?? ""} />
      <CardContent>
        <div className="log-lines">
          {lines.length ? (
            lines.map((line, index) => (
              <div className="log-line" key={`${index}-${line.slice(0, 12)}`}>
                <span>{index + 1}</span>
                <code>{line || " "}</code>
              </div>
            ))
          ) : (
            <div className="empty">暂无日志。</div>
          )}
        </div>
        <Toolbar>
          <Button onClick={() => void actions.refreshLogs()}>刷新</Button>
          <Button variant="secondary" onClick={() => void actions.copyLogs()}>复制</Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}

function DiagnosticsScreen({ diagnostics, actions }: { diagnostics: DiagnosticsResult | null; actions: Actions }) {
  return (
    <Panel fill>
      <CardHead title="诊断报告" detail="包含版本、路径、设置和平台信息" />
      <CardContent>
        <Textarea className="log-view tall" readOnly value={diagnostics?.report ?? "尚未生成诊断报告。"} />
        <Toolbar>
          <Button onClick={() => void actions.refreshDiagnostics()}>重新生成</Button>
          <Button variant="secondary" onClick={() => void actions.copyDiagnostics()}>复制报告</Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}

function AboutScreen({ overview, update, actions }: { overview: OverviewResult | null; update: UpdateResult | null; actions: Actions }) {
  return (
    <>
      <Panel>
        <CardHead title="关于 Codex++" detail="本地 Codex 增强、桌面管理器和安装包维护" />
        <CardContent>
          <div className="metric-list">
            <Metric label="Codex++ 版本" value={overview?.current_version ?? update?.currentVersion ?? "-"} />
            <Metric label="Codex 版本" value={overview?.codex_version ?? "未检测到"} />
            <Metric label="项目地址" value="github.com/lgdy88/codex-enhance" />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.openExternalUrl("https://github.com/lgdy88/codex-enhance")} variant="secondary">
              <ExternalLink className="h-4 w-4" />
              打开项目主页
            </Button>
            <Button onClick={() => void actions.openExternalUrl("https://github.com/lgdy88/codex-enhance/issues")} variant="secondary">
              <ExternalLink className="h-4 w-4" />
              反馈问题
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="GitHub Release 更新" detail={`当前版本 ${overview?.current_version ?? update?.currentVersion ?? "-"}`} />
        <CardContent>
          <div className="metric-list">
            <Metric label="状态" value={update?.status ?? "not_checked"} />
            <Metric label="最新版本" value={update?.latestVersion ?? "未检查"} />
            <Metric label="资源" value={update?.assetName ?? "-"} />
            <Metric label="进度" value={`${update?.progress ?? 0}%`} />
          </div>
          <UpdateMessage message={update?.releaseSummary || update?.message || "尚未检查 GitHub Release；更新会下载并启动安装包。"} />
          <Toolbar sticky>
            <Button onClick={() => void actions.checkUpdate()}>检查更新</Button>
            <Button variant="secondary" onClick={() => void actions.performUpdate()}>下载并运行安装包</Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}

function FeatureItem({ title, detail, enabled }: { title: string; detail: string; enabled: boolean }) {
  return (
    <div className="feature-item">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <Badge status={enabled ? "ok" : "disabled"} />
    </div>
  );
}

function GuideList({ items }: { items: string[] }) {
  return (
    <div className="guide-list">
      {items.map((item, index) => (
        <div className="guide-step" key={item}>
          <span>{index + 1}</span>
          <p>{item}</p>
        </div>
      ))}
    </div>
  );
}

function NoticeDialog({ notice, onClose }: { notice: { title: string; message: string; status?: Status }; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-icon">{notice.status === "failed" ? <Bell className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}</div>
        <div className="modal-body">
          <h2>{notice.title}</h2>
          <p>{notice.message}</p>
        </div>
        <Toolbar>
          <Button onClick={onClose}>知道了</Button>
        </Toolbar>
      </div>
    </div>
  );
}

function Panel({ children, fill = false, className = "" }: { children: React.ReactNode; fill?: boolean; className?: string }) {
  return <Card className={`panel ${fill ? "fill" : ""} ${className}`}>{children}</Card>;
}

function CardHead({ title, detail }: { title: string; detail: string }) {
  return (
    <CardHeader className="panel-head">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{detail}</CardDescription>
    </CardHeader>
  );
}

function Toolbar({ children, sticky = false }: { children: React.ReactNode; sticky?: boolean }) {
  return <div className={`toolbar ${sticky ? "sticky-actions" : ""}`}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="field">
      <span>{label}</span>
      {children}
    </Label>
  );
}

function StatusRow({ title, status = "unknown", path }: { title: string; status?: string; path?: string | null }) {
  return (
    <div className="status-row">
      <span>{title}</span>
      <Badge status={status} />
      <code>{path || "未记录路径"}</code>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  return (
    <UiBadge className={statusClass(status)} variant="secondary">
      {statusLabel(status)}
    </UiBadge>
  );
}

function LatestLaunch({ status }: { status: LaunchStatus | null }) {
  if (!status) return <div className="empty">暂无启动状态。</div>;
  return (
    <div className="metric-list">
      <Metric label="状态" value={status.status} />
      <Metric label="消息" value={status.message} />
      <Metric label="Debug" value={String(status.debug_port ?? "-")} />
      <Metric label="Helper" value={String(status.helper_port ?? "-")} />
      <Metric label="时间" value={formatTime(status.started_at_ms)} />
    </div>
  );
}

function UpdateMessage({ message }: { message: string }) {
  return <div className="update-message">{message}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScriptRow({ script }: { script: NonNullable<UserScriptInventory["scripts"]>[number] }) {
  return (
    <div className="table-row">
      <span>{script.name}</span>
      <span>{script.source}</span>
      <span>{script.enabled ? "启用" : "关闭"}</span>
      <span>{script.status}</span>
    </div>
  );
}

function routeTitle(route: Route) {
  return routes.find((item) => item.id === route)?.label ?? "概览";
}

function routeSubtitle(route: Route) {
  const subtitles: Record<Route, string> = {
    overview: "检查问题、启动与快速修复",
    enhance: "脚本增强开关",
    userScripts: "内置和用户自定义脚本清单",
    providerSync: "历史会话可见性和路径修复",
    maintenance: "入口安装、修复、Watcher 与手动启动",
    settings: "主题、增强和 Provider 同步设置",
    logs: "最近状态文件内容",
    diagnostics: "可复制的运行诊断报告",
    about: "版本信息、项目链接与 GitHub Release 更新",
  };
  return subtitles[route];
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    found: "已找到",
    missing: "缺失",
    installed: "已安装",
    ok: "正常",
    running: "运行中",
    failed: "失败",
    accepted: "已受理",
    not_checked: "未检查",
    disabled: "已禁用",
    unknown: "未知",
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (["found", "installed", "ok", "running"].includes(status)) return "good";
  if (["failed", "missing"].includes(status)) return "bad";
  return "warn";
}

function healthItems(overview: OverviewResult | null) {
  return [
    {
      title: "Codex 应用",
      status: overview?.codex_app.status ?? "not_checked",
      ok: overview?.codex_app.status === "found",
      detail: overview?.codex_app.path || "尚未检查 Codex 应用路径。",
    },
    {
      title: "静默启动入口",
      status: overview?.silent_shortcut.status ?? "not_checked",
      ok: overview?.silent_shortcut.status === "installed",
      detail: overview?.silent_shortcut.path || "缺少 Codex++ 静默启动快捷方式时可在安装维护页修复。",
    },
    {
      title: "管理工具入口",
      status: overview?.management_shortcut.status ?? "not_checked",
      ok: overview?.management_shortcut.status === "installed",
      detail: overview?.management_shortcut.path || "缺少管理工具快捷方式时可在安装维护页修复。",
    },
  ];
}

function normalizeSettings(settings: Partial<BackendSettings>): BackendSettings {
  return {
    providerSyncEnabled: settings.providerSyncEnabled ?? defaultSettings.providerSyncEnabled,
    enhancementsEnabled: settings.enhancementsEnabled ?? defaultSettings.enhancementsEnabled,
  };
}

function numberOrDefault(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitLogLines(text: string) {
  return text.trimEnd().split(/\r?\n/).filter((line, index, lines) => line.length > 0 || index < lines.length - 1);
}

function formatTime(value: number) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN");
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function loadInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem("codex-plus-theme") === "light" ? "light" : "dark";
}

function loadInitialRoute(): Route {
  if (typeof window === "undefined") return "overview";
  const params = new URLSearchParams(window.location.search);
  if (params.get("showUpdate") === "1" || window.location.hash === "#about") return "about";
  return "overview";
}
