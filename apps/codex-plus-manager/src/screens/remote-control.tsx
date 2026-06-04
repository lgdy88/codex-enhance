import { RefreshCw } from "lucide-react";

import { CardHead, Field, Panel, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  Actions,
  RemoteBotForm,
  RemoteBotMessageResult,
  RemoteBridgeResult,
  RemoteControlForm,
  RemoteControlResult,
  RemoteDependencyResult,
  RemoteInventoryResult,
} from "@/types";

export function RemoteControlScreen({
  result,
  bridge,
  form,
  onFormChange,
  actions,
}: {
  result: RemoteControlResult | null;
  dependencies: RemoteDependencyResult | null;
  inventory: RemoteInventoryResult | null;
  bridge: RemoteBridgeResult | null;
  botForm: RemoteBotForm;
  botResult: RemoteBotMessageResult | null;
  form: RemoteControlForm;
  onFormChange: (value: RemoteControlForm) => void;
  onBotFormChange: (value: RemoteBotForm) => void;
  actions: Actions;
}) {
  const bridgeStatus = bridge?.bridge;
  const bridgeDisplayStatus = bridgeStatus?.status === "preview" ? "未启动" : bridgeStatus?.status ?? "未加载";

  const updateEntryEnabled = (enabled: boolean) => {
    onFormChange({
      ...form,
      enabled,
      autoBindP2p: enabled && !form.feishuChatId.trim() && !form.feishuUserId.trim() ? true : form.autoBindP2p,
    });
  };

  return (
    <div className="remote-main-flow">
      <Panel>
        <CardHead title="Lark / 飞书 Channel" detail="配置飞书开放平台应用凭据" />
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
            <Button onClick={() => void actions.openExternalUrl("https://open.feishu.cn/document/develop-an-echo-bot/introduction")} variant="secondary">
              飞书开放平台文档
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>

      <Panel>
        <CardHead title="飞书远程入口" detail="开启后允许飞书消息进入本地桥接" />
        <CardContent>
          <label className="switch-row hero-switch">
            <input checked={form.enabled} onChange={(event) => updateEntryEnabled(event.currentTarget.checked)} type="checkbox" />
            <span>
              <strong>启用飞书远程入口配置</strong>
              <small>启用后默认允许首次私聊自动绑定；仍只监听本机 loopback，不会把 app-server 暴露到局域网或公网。</small>
            </span>
          </label>
          <Toolbar>
            <Button onClick={() => void actions.saveRemoteControl()}>保存入口配置</Button>
          </Toolbar>
        </CardContent>
      </Panel>

      <Panel>
        <CardHead title="启动飞书桥接" detail="启动本地 bridge 接收飞书消息" />
        <CardContent>
          <div className="remote-bridge-hero">
            <div>
              <strong>{bridgeDisplayStatus}</strong>
              <span>
                {bridgeStatus?.pid
                  ? `PID ${bridgeStatus.pid}${bridgeStatus.logPath ? ` · 日志 ${bridgeStatus.logPath}` : ""}`
                  : "保存配置后启动本地飞书桥接进程。"}
              </span>
            </div>
            <Toolbar>
              <Button onClick={() => void actions.startRemoteBridge()}>启动飞书桥接</Button>
              <Button onClick={() => void actions.stopRemoteBridge()} variant="secondary">
                停止
              </Button>
              <Button onClick={() => void actions.refreshRemoteBridge()} variant="outline">
                <RefreshCw className="h-4 w-4" />
                刷新
              </Button>
            </Toolbar>
          </div>
        </CardContent>
      </Panel>
    </div>
  );
}
