import type { RemoteControlConfig, RemoteControlForm } from "@/types";

export const defaultRemoteControl: RemoteControlConfig = {
  enabled: false,
  channel: "feishu",
  workspaceName: "",
  workspacePath: "",
  larkAppId: "",
  larkAppSecret: "",
  larkEncryptKey: "",
  larkVerificationToken: "",
  threadName: "Feishu - Dex",
  threadId: "",
  feishuChatId: "",
  feishuUserId: "",
  autoBindP2p: false,
  appServerPort: 54322,
  bindHost: "127.0.0.1",
  approvalPolicy: "on-request",
  sandbox: "workspace-write",
};

export function normalizeRemoteControl(config: Partial<RemoteControlConfig>): RemoteControlConfig {
  return {
    enabled: config.enabled ?? defaultRemoteControl.enabled,
    channel: config.channel ?? defaultRemoteControl.channel,
    workspaceName: config.workspaceName ?? defaultRemoteControl.workspaceName,
    workspacePath: config.workspacePath ?? defaultRemoteControl.workspacePath,
    larkAppId: config.larkAppId ?? defaultRemoteControl.larkAppId,
    larkAppSecret: config.larkAppSecret ?? defaultRemoteControl.larkAppSecret,
    larkEncryptKey: config.larkEncryptKey ?? defaultRemoteControl.larkEncryptKey,
    larkVerificationToken: config.larkVerificationToken ?? defaultRemoteControl.larkVerificationToken,
    threadName: config.threadName ?? defaultRemoteControl.threadName,
    threadId: config.threadId ?? defaultRemoteControl.threadId,
    feishuChatId: config.feishuChatId ?? defaultRemoteControl.feishuChatId,
    feishuUserId: config.feishuUserId ?? defaultRemoteControl.feishuUserId,
    autoBindP2p: config.autoBindP2p ?? defaultRemoteControl.autoBindP2p,
    appServerPort: Number.isFinite(config.appServerPort) ? Number(config.appServerPort) : defaultRemoteControl.appServerPort,
    bindHost: config.bindHost ?? defaultRemoteControl.bindHost,
    approvalPolicy: config.approvalPolicy ?? defaultRemoteControl.approvalPolicy,
    sandbox: config.sandbox ?? defaultRemoteControl.sandbox,
  };
}

export function remoteConfigToForm(config: Partial<RemoteControlConfig>): RemoteControlForm {
  const normalized = normalizeRemoteControl(config);
  return {
    ...normalized,
    appServerPort: String(normalized.appServerPort),
  };
}

export function remoteFormToConfig(form: RemoteControlForm): RemoteControlConfig {
  return {
    ...form,
    appServerPort: Number.parseInt(form.appServerPort, 10) || defaultRemoteControl.appServerPort,
  };
}
