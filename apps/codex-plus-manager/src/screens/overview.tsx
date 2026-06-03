import { Bell, CheckCircle2, RefreshCw, Wrench } from "lucide-react";

import { Badge, CardHead, LatestLaunch, Panel, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { healthItems } from "@/lib/health";
import type { Actions, OverviewResult } from "@/types";

export function OverviewScreen({ overview, actions }: { overview: OverviewResult | null; actions: Actions }) {
  const health = healthItems(overview);
  return (
    <>
      <Panel className="hero-panel">
        <CardContent className="hero-content">
          <div className="hero-layout">
            <div>
              <div className="eyebrow">Dex 桌面状态</div>
              <h2>{health.every((item) => item.ok) ? "运行环境看起来正常" : "有项目需要处理"}</h2>
              <p>桌面版只管理启动、增强、Provider History、维护和诊断，不接管上游代理或远端推荐默认项。</p>
            </div>
            <div className="hero-actions">
              <Button onClick={() => void actions.checkHealth()}>
                <RefreshCw className="h-4 w-4" />
                检查
              </Button>
              <Button variant="secondary" onClick={() => void actions.repairShortcuts()}>
                <Wrench className="h-4 w-4" />
                修复入口
              </Button>
              <Button variant="secondary" onClick={() => void actions.repairBackend()}>修复后端</Button>
            </div>
          </div>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="健康检查" detail="只展示本地桌面管理器需要处理的关键项" />
        <CardContent>
          <div className="health-grid">
            <div className={`health-item ${overview?.codex_version ? "ok" : "needs-fix"}`}>
              {overview?.codex_version ? <CheckCircle2 className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
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
