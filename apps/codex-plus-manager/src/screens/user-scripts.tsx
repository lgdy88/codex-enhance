import { RefreshCw } from "lucide-react";

import { CardHead, Metric, Panel, ScriptRow, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import type { Actions, SettingsResult } from "@/types";

export function UserScriptsScreen({ settings, actions }: { settings: SettingsResult | null; actions: Actions }) {
  const inventory = settings?.user_scripts;
  const scripts = inventory?.scripts ?? [];
  return (
    <>
      <Panel>
        <CardHead title="脚本" detail={`${scripts.length} 个脚本，整体 ${inventory?.enabled === false ? "关闭" : "开启"}`} />
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
            {scripts.length ? scripts.map((script) => <ScriptRow actions={actions} key={script.key} script={script} />) : <div className="empty">未发现脚本。</div>}
          </div>
        </CardContent>
      </Panel>
    </>
  );
}
