import { RefreshCw } from "lucide-react";

import { CardHead, GuideList, Metric, Panel, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import type { Actions, BackendSettings, ProviderActionResult, SettingsResult } from "@/types";

export function ProviderSyncScreen({
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
              <small>开启后，仅在通过 Dex 启动 Codex 前自动同步一次历史会话的 provider 字段。</small>
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
