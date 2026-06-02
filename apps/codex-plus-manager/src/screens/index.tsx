import { Bell, CheckCircle2, ExternalLink, RefreshCw, Wrench } from "lucide-react";

import {
  Badge,
  CardHead,
  FeatureItem,
  Field,
  GuideList,
  LatestLaunch,
  Metric,
  Panel,
  ScriptRow,
  StatusRow,
  Toolbar,
  UpdateMessage,
} from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { splitLogLines } from "@/lib/format";
import { healthItems } from "@/lib/health";
import { codexExtraArgsToInput, inputToCodexExtraArgs } from "@/lib/settings";
import type {
  Actions,
  BackendSettings,
  DiagnosticsResult,
  LaunchForm,
  LogsResult,
  OverviewResult,
  ProviderActionResult,
  RemoteBotForm,
  RemoteBotMessageResult,
  RemoteBridgeResult,
  RemoteControlForm,
  RemoteControlResult,
  RemoteDependencyResult,
  RemoteInventoryResult,
  SettingsResult,
  Theme,
  UpdateResult,
  WatcherResult,
} from "@/types";

const PROJECTLESS_VALUE = "__codex_projectless__";

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

export function EnhanceScreen({ form, onFormChange, actions }: { form: BackendSettings; onFormChange: (value: BackendSettings) => void; actions: Actions }) {
  return (
    <Panel>
      <CardHead title="增强功能" detail="控制本地 renderer 注入能力，不写 Codex 认证或 provider 配置" />
      <CardContent>
        <label className="switch-row">
          <input checked={form.enhancementsEnabled} onChange={(event) => onFormChange({ ...form, enhancementsEnabled: event.currentTarget.checked })} type="checkbox" />
          <span>
            <strong>启用 Dex 增强功能</strong>
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

export function UserScriptsScreen({ settings, actions }: { settings: SettingsResult | null; actions: Actions }) {
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
            {scripts.length ? scripts.map((script) => <ScriptRow actions={actions} key={script.key} script={script} />) : <div className="empty">未发现用户脚本。</div>}
          </div>
        </CardContent>
      </Panel>
    </>
  );
}

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
          <Field label="桥接日志">
            <Textarea className="log-view command-box tallish" readOnly value={bridge?.log || "尚未启动桥接。"} />
          </Field>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title="启动命令" detail="可手动核对本地 app-server 和 bridge 参数" />
        <CardContent>
          <Field label="Codex app-server">
            <Textarea className="log-view command-box" readOnly value={status?.commands.codexAppServer ?? "保存远程配置后生成命令。"} />
          </Field>
          <Field label="飞书 bridge 环境变量">
            <Textarea className="log-view command-box tallish" readOnly value={bridgeEnv.length ? bridgeEnv.join("\n") : "保存远程配置后生成环境变量。"} />
          </Field>
          <GuideList items={status?.commands.feishuBridgeNotes ?? ["先配置项目路径、飞书路由和安全策略。"]} />
          {dependencyChecks.length ? (
            <div className="health-grid remote-checks">
              {dependencyChecks.map((check) => (
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
          ) : null}
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
          <Field label="机器人回复">
            <Textarea className="log-view command-box tallish" readOnly value={botResult?.response.reply ?? "尚未发送模拟消息。"} />
          </Field>
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

export function MaintenanceScreen({
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
  launchForm: LaunchForm;
  onLaunchFormChange: (next: LaunchForm) => void;
  removeOwnedData: boolean;
  onRemoveOwnedDataChange: (value: boolean) => void;
  actions: Actions;
}) {
  const savedCodexAppPath = overview?.codex_app.path ?? "";
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

export function SettingsScreen({
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
          <Field label="默认 Codex 应用路径">
            <Input
              placeholder="Codex.exe、Codex.app、app 目录或解包目录"
              value={form.codexAppPath}
              onChange={(event) => onFormChange({ ...form, codexAppPath: event.currentTarget.value })}
            />
          </Field>
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
              <small>通过 Dex 启动前自动运行 provider metadata 同步。</small>
            </span>
          </label>
        </div>
        <Field label="Codex 额外启动参数">
          <Textarea
            className="launch-args-input"
            placeholder="--force_high_performance_gpu"
            spellCheck={false}
            value={codexExtraArgsToInput(form.codexExtraArgs)}
            onChange={(event) => onFormChange({ ...form, codexExtraArgs: inputToCodexExtraArgs(event.currentTarget.value) })}
          />
        </Field>
        <p className="field-hint">每行一个参数，追加到默认 CDP 参数后；不需要填写 open 或 --args。</p>
        <Toolbar>
          <Button onClick={() => void actions.saveSettings()}>保存设置</Button>
          <Button variant="secondary" onClick={() => void actions.resetSettings()}>重置设置</Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}

export function LogsScreen({ logs, actions }: { logs: LogsResult | null; actions: Actions }) {
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

export function DiagnosticsScreen({ diagnostics, actions }: { diagnostics: DiagnosticsResult | null; actions: Actions }) {
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

export function AboutScreen({ overview, update, actions }: { overview: OverviewResult | null; update: UpdateResult | null; actions: Actions }) {
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
