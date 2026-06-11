import { FileSearch, FolderOpen } from "lucide-react";

import { Badge, CardHead, Field, Panel, StatusRow, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { codexExtraArgsToInput, inputToCodexExtraArgs } from "@/lib/settings";
import type { Actions, BackendSettings, LaunchForm, OfficialPluginHealthResult, OverviewResult, SettingsResult, WatcherResult } from "@/types";

export function MaintenanceScreen({
  overview,
  watcher,
  officialPluginHealth,
  settings,
  settingsForm,
  launchForm,
  onSettingsFormChange,
  onLaunchFormChange,
  removeOwnedData,
  onRemoveOwnedDataChange,
  actions,
}: {
  overview: OverviewResult | null;
  watcher: WatcherResult | null;
  officialPluginHealth: OfficialPluginHealthResult | null;
  settings: SettingsResult | null;
  settingsForm: BackendSettings;
  launchForm: LaunchForm;
  onSettingsFormChange: (next: BackendSettings) => void;
  onLaunchFormChange: (next: LaunchForm) => void;
  removeOwnedData: boolean;
  onRemoveOwnedDataChange: (value: boolean) => void;
  actions: Actions;
}) {
  const savedCodexAppPath = overview?.codex_app.path ?? "";
  const updateCodexAppPath = (path: string) => {
    onSettingsFormChange({ ...settingsForm, codexAppPath: path });
    onLaunchFormChange({ ...launchForm, appPath: path });
  };

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
        <CardHead title="官方插件健康" detail={officialPluginHealth?.message ?? "检查 Browser / Computer Use / Chrome / node_repl"} />
        <CardContent>
          {officialPluginHealth?.health ? (
            <>
              <div className="metric-list official-plugin-roots">
                <div>
                  <span>状态</span>
                  <strong>
                    <Badge status={officialPluginHealth.health.status} />
                  </strong>
                </div>
                <div>
                  <span>Codex HOME</span>
                  <strong>{officialPluginHealth.health.codexHome || "-"}</strong>
                </div>
                <div>
                  <span>bundled cache</span>
                  <strong>{officialPluginHealth.health.bundledCacheRoot || "-"}</strong>
                </div>
              </div>
              <div className="official-plugin-checks">
                {officialPluginHealth.health.checks.map((check) => (
                  <div className="official-plugin-check" key={check.key}>
                    <div>
                      <strong>{check.label}</strong>
                      <span>{check.detail}</span>
                      {check.path ? <code>{check.path}</code> : null}
                    </div>
                    <Badge status={check.status} />
                  </div>
                ))}
              </div>
              <div className="warning-list official-plugin-notes">
                {officialPluginHealth.health.repairNotes.map((note) => (
                  <div className="warning-item" key={note}>{note}</div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">还没有检查官方插件健康。</div>
          )}
          <Toolbar>
            <Button variant="secondary" onClick={() => void actions.checkOfficialPlugins()}>检查官方插件</Button>
            <Button variant="secondary" onClick={() => void actions.refreshOfficialPluginCache()}>刷新官方插件缓存</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="启动配置" detail={settings?.settings_path ?? "保存到 Dex 本地设置文件"} />
        <CardContent>
          <div className="field">
            <span>默认 Codex 应用路径</span>
            <div className="path-picker-row">
              <Input
                aria-label="默认 Codex 应用路径"
                placeholder="Codex.exe、Codex.app、app 目录或解包目录"
                value={settingsForm.codexAppPath}
                onChange={(event) => updateCodexAppPath(event.currentTarget.value)}
              />
              <Button size="icon" title="选择目录" variant="secondary" onClick={() => void actions.chooseCodexAppPath("folder")}>
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button size="icon" title="选择文件" variant="secondary" onClick={() => void actions.chooseCodexAppPath("file")}>
                <FileSearch className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Field label="Codex 额外启动参数">
            <Textarea
              className="launch-args-input"
              placeholder="--force_high_performance_gpu"
              spellCheck={false}
              value={codexExtraArgsToInput(settingsForm.codexExtraArgs)}
              onChange={(event) => onSettingsFormChange({ ...settingsForm, codexExtraArgs: inputToCodexExtraArgs(event.currentTarget.value) })}
            />
          </Field>
          <p className="field-hint">每行一个参数，追加到默认 CDP 参数后；不需要填写 open 或 --args。</p>
          <Toolbar>
            <Button onClick={() => void actions.saveSettings()}>保存启动配置</Button>
            <Button variant="secondary" onClick={() => void actions.resetSettings()}>重置启动配置</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="入口管理" detail="快捷方式写入系统实际桌面位置，不使用写死桌面路径" />
        <CardContent>
          <label className="check-row">
            <input checked={removeOwnedData} onChange={(event) => onRemoveOwnedDataChange(event.currentTarget.checked)} type="checkbox" />
            <span>卸载时移除 Dex 托管数据</span>
          </label>
          <Toolbar>
            <Button onClick={() => void actions.installEntrypoints()}>安装入口</Button>
            <Button variant="secondary" onClick={() => void actions.uninstallEntrypoints()}>卸载入口</Button>
            <Button variant="secondary" onClick={() => void actions.repairShortcuts()}>修复入口</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="自动接管" detail="Watcher 用于保持 Dex 接管状态" />
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
        <CardHead title="手动启动" detail="留空应用路径时使用已保存路径；没有保存路径时使用自动探测" />
        <CardContent>
          <Field label="应用路径覆盖">
            <Input
              placeholder={savedCodexAppPath || "例如 C:\\Program Files\\WindowsApps\\OpenAI.Codex...\\app"}
              value={launchForm.appPath}
              onChange={(event) => onLaunchFormChange({ ...launchForm, appPath: event.currentTarget.value })}
            />
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
            <Button onClick={() => void actions.launch()}>启动 Dex</Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}
