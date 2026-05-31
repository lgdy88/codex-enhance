import { Bell, CheckCircle2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatTime, statusClass, statusLabel } from "@/lib/format";
import type { Actions, LaunchStatus, Notice, UserScriptInventory } from "@/types";

export function Panel({ children, fill = false, className = "" }: { children: ReactNode; fill?: boolean; className?: string }) {
  return <Card className={`panel ${fill ? "fill" : ""} ${className}`}>{children}</Card>;
}

export function CardHead({ title, detail }: { title: string; detail: string }) {
  return (
    <CardHeader className="panel-head">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{detail}</CardDescription>
    </CardHeader>
  );
}

export function Toolbar({ children, sticky = false }: { children: ReactNode; sticky?: boolean }) {
  return <div className={`toolbar ${sticky ? "sticky-actions" : ""}`}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="field">
      <span>{label}</span>
      {children}
    </Label>
  );
}

export function StatusRow({ title, status = "unknown", path }: { title: string; status?: string; path?: string | null }) {
  return (
    <div className="status-row">
      <span>{title}</span>
      <Badge status={status} />
      <code>{path || "未记录路径"}</code>
    </div>
  );
}

export function Badge({ status }: { status: string }) {
  return (
    <UiBadge className={statusClass(status)} variant="secondary">
      {statusLabel(status)}
    </UiBadge>
  );
}

export function LatestLaunch({ status }: { status: LaunchStatus | null }) {
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

export function UpdateMessage({ message }: { message: string }) {
  return <div className="update-message">{message}</div>;
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function FeatureItem({ title, detail, enabled }: { title: string; detail: string; enabled: boolean }) {
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

export function GuideList({ items }: { items: string[] }) {
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

export function NoticeDialog({ notice, onClose }: { notice: Notice; onClose: () => void }) {
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

export function ScriptRow({ script, actions }: { script: NonNullable<UserScriptInventory["scripts"]>[number]; actions: Actions }) {
  const canDelete = script.key.startsWith("user:");
  return (
    <div className="table-row">
      <span>{script.name}</span>
      <span>{script.source}</span>
      <span>{script.enabled ? "启用" : "关闭"}</span>
      <span>{script.status}</span>
      <span>
        {canDelete ? (
          <Button onClick={() => void actions.deleteUserScript(script.key)} size="icon" title="删除脚本" variant="outline">
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </span>
    </div>
  );
}
