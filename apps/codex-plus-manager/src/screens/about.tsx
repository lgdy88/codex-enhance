import { ExternalLink } from "lucide-react";

import { CardHead, Metric, Panel, Toolbar, UpdateMessage } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import type { Actions, OverviewResult, UpdateResult } from "@/types";

export function AboutScreen({ overview, update, actions }: { overview: OverviewResult | null; update: UpdateResult | null; actions: Actions }) {
  const hasUpdate = update?.updateAvailable === true;
  const updateMessage =
    update?.releaseSummary ||
    update?.message ||
    "尚未检查更新；Dex 会通过签名更新清单下载并安装新版本。";

  return (
    <>
      <Panel>
        <CardHead title="关于 Dex" detail="本地 Codex 增强、桌面管理器和安装包维护" />
        <CardContent>
          <div className="metric-list">
            <Metric label="Dex 版本" value={overview?.current_version ?? update?.currentVersion ?? "-"} />
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
        <CardHead title="应用更新" detail={`当前版本 ${overview?.current_version ?? update?.currentVersion ?? "-"}`} />
        <CardContent>
          <div className="metric-list">
            <Metric label="状态" value={update?.status ?? "not_checked"} />
            <Metric label="最新版本" value={update?.latestVersion ?? "未检查"} />
            <Metric label="发布日期" value={update?.updateDate ?? "-"} />
            <Metric label="进度" value={`${update?.progress ?? 0}%`} />
          </div>
          <UpdateMessage message={updateMessage} />
          <Toolbar sticky>
            <Button onClick={() => void actions.checkUpdate()}>检查并更新</Button>
            <Button disabled={!hasUpdate} variant="secondary" onClick={() => void actions.performUpdate()}>下载并安装</Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}
