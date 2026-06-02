import { RefreshCw } from "lucide-react";

import { Badge, CardHead, Field, GuideList, Metric, Panel, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  Actions,
  RemoteBotForm,
  RemoteBotMessageResult,
  RemoteBridgeResult,
  RemoteControlForm,
  RemoteControlCheck,
  RemoteControlResult,
  RemoteDependencyResult,
  RemoteInventoryResult,
} from "@/types";

const PROJECTLESS_VALUE = "__codex_projectless__";

export function RemoteControlScreen({
  result,
  dependencies,
  inventory,
  botForm,
  botResult,
  bridge,
  form,
  onFormChange,
  onBotFormChange,
  actions,
}: {
  result: RemoteControlResult | null;
  dependencies: RemoteDependencyResult | null;
  inventory: RemoteInventoryResult | null;
  botForm: RemoteBotForm;
  botResult: RemoteBotMessageResult | null;
  bridge: RemoteBridgeResult | null;
  form: RemoteControlForm;
  onFormChange: (value: RemoteControlForm) => void;
  onBotFormChange: (value: RemoteBotForm) => void;
  actions: Actions;
}) {
  const status = result?.status;
  const bridgeStatus = bridge?.bridge;
  const checks = status?.checks ?? [];
  const dependencyChecks = dependencies?.checks ?? [];
  const bridgeEnv = status?.commands.feishuBridgeEnv ?? [];
  const projects = inventory?.inventory.projects ?? [];
  const selectedProjectValue = form.workspacePath ? form.workspacePath : projects.some((project) => !project.cwd && project.name === form.workspaceName) ? PROJECTLESS_VALUE : "";
  const isProjectlessSelected = selectedProjectValue === PROJECTLESS_VALUE;
  const projectThreads = (inventory?.inventory.threads ?? []).filter((thread) => {
    if (isProjectlessSelected) return !thread.cwd;
    return !form.workspacePath || thread.cwd === form.workspacePath;
  });
  const selectProject = (value: string) => {
    const cwd = value === PROJECTLESS_VALUE ? "" : value;
    const project = projects.find((item) => item.cwd === cwd);
    const nextThread = (inventory?.inventory.threads ?? []).find((thread) => thread.cwd === cwd);
    onFormChange({
      ...form,
      workspaceName: project?.name ?? form.workspaceName,
      workspacePath: cwd,
      threadId: nextThread?.id ?? "",
      threadName: nextThread?.title || form.threadName,
    });
  };
  const selectThread = (threadId: string) => {
    const thread = (inventory?.inventory.threads ?? []).find((item) => item.id === threadId);
    if (!thread) {
      onFormChange({ ...form, threadId });
      return;
    }
    onFormChange({
      ...form,
      workspaceName: projectNameForPath(projects, thread.cwd, form.workspaceName),
      workspacePath: thread.cwd || form.workspacePath,
      threadId: thread.id,
      threadName: thread.title,
    });
  };
  return (
    <>
      <Panel>
        <CardHead title="Lark / 飞书 Channel" detail="配置飞书开放平台应用凭据，再绑定 Codex 项目和对话" />
        <CardContent>
          <div className="setting-grid">
            <Field label="App ID *">
              <Input
                placeholder="cli_xxxxxxxxxx"
                value={form.larkAppId}
                onChange={(event) => onFormChange({ ...form, larkAppId: event.currentTarget.value })}
              />
            </Field>
            <Field label="App Secret *">
              <Input
                placeholder="xxxxxxxxxxxxxxxx"
                type="password"
                value={form.larkAppSecret}
                onChange={(event) => onFormChange({ ...form, larkAppSecret: event.currentTarget.value })}
              />
            </Field>
            <Field label="Encrypt Key">
              <Input
                placeholder="可选，事件加密时填写"
                type="password"
                value={form.larkEncryptKey}
                onChange={(event) => onFormChange({ ...form, larkEncryptKey: event.currentTarget.value })}
              />
            </Field>
            <Field label="Verification Token">
              <Input
                placeholder="可选，事件校验时填写"
                type="password"
                value={form.larkVerificationToken}
                onChange={(event) => onFormChange({ ...form, larkVerificationToken: event.currentTarget.value })}
              />
            </Field>
          </div>
          <Toolbar>
            <Button onClick={() => void actions.saveRemoteControl()}>保存 Channel 配置</Button>
            <Button onClick={() => void actions.openExternalUrl("https://open.feishu.cn/document/develop-an-echo-bot/introduction")} variant="secondary">飞书开放平台文档</Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="Codex 项目和对话" detail={status?.configPath ?? "保存到 Dex 自己的远程配置文件"} />
        <CardContent>
          <label className="switch-row">
            <input checked={form.enabled} onChange={(event) => onFormChange({ ...form, enabled: event.currentTarget.checked })} type="checkbox" />
            <span>
              <strong>启用飞书远程入口配置</strong>
              <small>这会保存本地路由、安全策略和飞书 App Secret；日志不会记录 secret，也不会自动暴露 app-server。</small>
            </span>
          </label>
          <div className="setting-grid">
            <Field label="选择项目">
              <select value={selectedProjectValue} onChange={(event) => selectProject(event.currentTarget.value)}>
                <option value="">手动输入或选择项目</option>
                {projects.map((project) => (
                  <option key={project.cwd || PROJECTLESS_VALUE} value={project.cwd || PROJECTLESS_VALUE}>
                    {project.name} ({project.threadCount})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="选择旧对话">
              <select value={form.threadId} onChange={(event) => selectThread(event.currentTarget.value)}>
                <option value="">新建或手动输入 threadId</option>
                {projectThreads.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {thread.title}{thread.archived ? " [归档]" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="项目名称">
              <Input
                placeholder="例如 codex-enhance"
                value={form.workspaceName}
                onChange={(event) => onFormChange({ ...form, workspaceName: event.currentTarget.value })}
              />
            </Field>
            <Field label="本地项目路径">
              <Input
                placeholder="例如 D:\\Skye\\codex-enhance"
                value={form.workspacePath}
                onChange={(event) => onFormChange({ ...form, workspacePath: event.currentTarget.value })}
              />
            </Field>
            <Field label="Codex 对话名称">
              <Input
                placeholder="Feishu - Dex"
                value={form.threadName}
                onChange={(event) => onFormChange({ ...form, threadName: event.currentTarget.value })}
              />
            </Field>
            <Field label="Codex threadId">
              <Input
                placeholder="留空时桥接层创建新对话"
                value={form.threadId}
                onChange={(event) => onFormChange({ ...form, threadId: event.currentTarget.value })}
              />
            </Field>
            <Field label="飞书 chat_id">
              <Input
                placeholder="固定一个飞书聊天"
                value={form.feishuChatId}
                onChange={(event) => onFormChange({ ...form, feishuChatId: event.currentTarget.value })}
              />
            </Field>
            <Field label="飞书 user_id">
              <Input
                placeholder="限制某个飞书用户"
                value={form.feishuUserId}
                onChange={(event) => onFormChange({ ...form, feishuUserId: event.currentTarget.value })}
              />
            </Field>
          </div>
          <label className="check-row loose-check">
            <input checked={form.autoBindP2p} onChange={(event) => onFormChange({ ...form, autoBindP2p: event.currentTarget.checked })} type="checkbox" />
            <span>未填 chat/user 时，允许首次私聊自动绑定。</span>
          </label>
          <Toolbar>
            <Button onClick={() => void actions.saveRemoteControl()}>保存远程配置</Button>
            <Button onClick={() => void actions.refreshRemoteInventory()} variant="outline">
              <RefreshCw className="h-4 w-4" />
              刷新项目/对话
            </Button>
            <Button onClick={() => void actions.checkRemoteDependencies()} variant="secondary">
              <RefreshCw className="h-4 w-4" />
              检查依赖
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="安全预检" detail={status?.message ?? "尚未加载远程配置"} />
        <CardContent>
          <div className="metric-list">
            <Metric label="状态" value={status?.status ?? "未加载"} />
            <Metric label="路由键" value={status?.routeKey ?? "-"} />
            <Metric label="app-server" value={status?.appServerUrl ?? "-"} />
          </div>
          <div className="setting-grid security-grid">
            <Field label="app-server Host">
              <Input value={form.bindHost} onChange={(event) => onFormChange({ ...form, bindHost: event.currentTarget.value })} />
            </Field>
            <Field label="app-server Port">
              <Input value={form.appServerPort} onChange={(event) => onFormChange({ ...form, appServerPort: event.currentTarget.value })} />
            </Field>
            <Field label="approvalPolicy">
              <select value={form.approvalPolicy} onChange={(event) => onFormChange({ ...form, approvalPolicy: event.currentTarget.value })}>
                <option value="on-request">on-request</option>
                <option value="on-failure">on-failure</option>
                <option value="untrusted">untrusted</option>
                <option value="never">never</option>
              </select>
            </Field>
            <Field label="sandbox">
              <select value={form.sandbox} onChange={(event) => onFormChange({ ...form, sandbox: event.currentTarget.value })}>
                <option value="workspace-write">workspace-write</option>
                <option value="read-only">read-only</option>
                <option value="danger-full-access">danger-full-access</option>
              </select>
            </Field>
          </div>
          {status?.warnings.length ? (
            <div className="warning-list">
              {status.warnings.map((warning) => (
                <div className="warning-item" key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}
          <RemoteChecks checks={checks} always />
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="桥接运行态" detail={bridgeStatus?.message ?? "本地 bridge 使用飞书官方 SDK 长连接"} />
        <CardContent>
          <div className="metric-list">
            <Metric label="状态" value={bridgeStatus?.status ?? "未加载"} />
            <Metric label="PID" value={bridgeStatus?.pid ? String(bridgeStatus.pid) : "-"} />
            <Metric label="日志" value={bridgeStatus?.logPath ?? "-"} />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.startRemoteBridge()}>启动飞书桥接</Button>
            <Button onClick={() => void actions.stopRemoteBridge()} variant="secondary">停止</Button>
            <Button onClick={() => void actions.refreshRemoteBridge()} variant="outline">
              <RefreshCw className="h-4 w-4" />
              刷新日志
            </Button>
          </Toolbar>
          <ReadonlyCommandField label="桥接日志" className="log-view command-box tallish" value={bridge?.log || "尚未启动桥接。"} />
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="启动命令" detail="可手动核对本地 app-server 和 bridge 参数" />
        <CardContent>
          <ReadonlyCommandField label="Codex app-server" className="log-view command-box" value={status?.commands.codexAppServer ?? "保存远程配置后生成命令。"} />
          <ReadonlyCommandField label="飞书 bridge 环境变量" className="log-view command-box tallish" value={bridgeEnv.length ? bridgeEnv.join("\n") : "保存远程配置后生成环境变量。"} />
          <GuideList items={status?.commands.feishuBridgeNotes ?? ["先配置项目路径、飞书路由和安全策略。"]} />
          <RemoteChecks checks={dependencyChecks} />
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="飞书命令路由预览" detail="模拟飞书聊天消息，验证 /项目、/对话 和普通消息转发计划" />
        <CardContent>
          <div className="setting-grid">
            <Field label="chat_id">
              <Input value={botForm.chatId} onChange={(event) => onBotFormChange({ ...botForm, chatId: event.currentTarget.value })} />
            </Field>
            <Field label="user_id">
              <Input value={botForm.userId} onChange={(event) => onBotFormChange({ ...botForm, userId: event.currentTarget.value })} />
            </Field>
          </div>
          <Field label="消息文本">
            <Input
              placeholder="/项目、/项目 1、/对话、/对话 2、/新建对话、普通消息"
              value={botForm.text}
              onChange={(event) => onBotFormChange({ ...botForm, text: event.currentTarget.value })}
            />
          </Field>
          <Toolbar>
            <Button onClick={() => void actions.sendRemoteBotMessage()}>发送模拟消息</Button>
          </Toolbar>
          <ReadonlyCommandField label="机器人回复" className="log-view command-box tallish" value={botResult?.response.reply ?? "尚未发送模拟消息。"} />
          {botResult?.response.forwardToCodex ? (
            <div className="metric-list">
              <Metric label="转发动作" value={botResult.response.action} />
              <Metric label="项目路径" value={botResult.response.forwardToCodex.workspacePath} />
              <Metric label="threadId" value={botResult.response.forwardToCodex.threadId ?? "新建"} />
              <Metric label="对话名称" value={botResult.response.forwardToCodex.threadName} />
            </div>
          ) : null}
        </CardContent>
      </Panel>
    </>
  );
}

function projectNameForPath(projects: Array<{ cwd: string; name: string }>, cwd: string, fallback: string) {
  return projects.find((project) => project.cwd === cwd)?.name ?? fallback;
}

function RemoteChecks({ checks, always = false }: { checks: RemoteControlCheck[]; always?: boolean }) {
  if (!always && checks.length === 0) return null;
  return (
    <div className="health-grid remote-checks">
      {checks.map((check) => (
        <div className={`health-item ${check.status === "ok" ? "ok" : "needs-fix"}`} key={check.key}>
          <span />
          <div>
            <strong>{check.label}</strong>
            <span>{check.detail}</span>
          </div>
          <Badge status={check.status} />
        </div>
      ))}
    </div>
  );
}

function ReadonlyCommandField({ label, className, value }: { label: string; className: string; value: string }) {
  return (
    <Field label={label}>
      <Textarea className={className} readOnly value={value} />
    </Field>
  );
}
