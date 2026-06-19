export type Status = "ok" | "failed" | "accepted" | "not_checked" | string;

export type CommandResult<T> = T & {
  status: Status;
  message: string;
};

export type PathState = {
  status: string;
  path: string | null;
};

export type LaunchStatus = {
  status: string;
  message: string;
  started_at_ms: number;
  debug_port: number | null;
  helper_port: number | null;
  codex_app: string | null;
};

export type OverviewResult = CommandResult<{
  codex_app: PathState;
  codex_version: string | null;
  silent_shortcut: PathState;
  management_shortcut: PathState;
  latest_launch: LaunchStatus | null;
  current_version: string;
  update_status: string;
  settings_path: string;
  logs_path: string;
}>;

export type BackendSettings = {
  codexAppPath: string;
  codexExtraArgs: string[];
  providerSyncEnabled: boolean;
  enhancementsEnabled: boolean;
  pluginMarketplaceUnlock: boolean;
  forcePluginInstall: boolean;
  sessionDelete: boolean;
  markdownExport: boolean;
  projectMove: boolean;
  conversationTimeline: boolean;
  globalVoiceInputEnabled: boolean;
  globalVoiceInputHoldHotkey: string;
  globalVoiceInputToggleHotkey: string;
};

export type UserScriptInventory = {
  enabled?: boolean;
  scripts?: Array<{
    key: string;
    name: string;
    source: string;
    enabled: boolean;
    status: string;
    error: string;
  }>;
};

export type SettingsResult = CommandResult<{
  settings: BackendSettings;
  settings_path: string;
  user_scripts: UserScriptInventory;
}>;

export type ProviderActionResult = CommandResult<{
  syncStatus?: string;
  targetProvider?: string;
  changedSessionFiles?: number;
  sqliteRowsUpdated?: number;
  backupDir?: string | null;
  syncMessage?: string;
}>;

export type LogsResult = CommandResult<{
  path: string;
  text: string;
  lines: number;
}>;

export type DiagnosticsResult = CommandResult<{
  report: string;
}>;

export type WatcherResult = CommandResult<{
  enabled: boolean;
  disabled_flag: string;
}>;

export type OfficialPluginHealthCheck = {
  key: string;
  label: string;
  status: string;
  detail: string;
  path: string | null;
};

export type OfficialPluginHealthResult = CommandResult<{
  health: {
    status: string;
    message: string;
    codexHome: string;
    bundledCacheRoot: string;
    checks: OfficialPluginHealthCheck[];
    repairNotes: string[];
  };
}>;

export type PluginCacheRepairResult = {
  status: string;
  message: string;
  marketplace: string;
  plugin: string;
  cache_path: string;
  backup_path: string;
  moved: boolean;
  restored: boolean;
  config_entry: string;
  config_updated: boolean;
};

export type OfficialPluginCacheRefreshResult = CommandResult<{
  refresh: {
    status: string;
    message: string;
    codexHome: string;
    cacheRoot: string;
    backupRoot: string;
    configPath: string;
    configBackupPath: string;
    globalStatePath: string;
    globalStateBackupPath: string;
    globalStateUpdated: boolean;
    globalStateEntries: string[];
    plugins: PluginCacheRepairResult[];
  };
}>;

export type RemoteControlConfig = {
  enabled: boolean;
  channel: "feishu" | string;
  workspaceName: string;
  workspacePath: string;
  larkAppId: string;
  larkAppSecret: string;
  larkEncryptKey: string;
  larkVerificationToken: string;
  threadName: string;
  threadId: string;
  feishuChatId: string;
  feishuUserId: string;
  autoBindP2p: boolean;
  appServerPort: number;
  bindHost: string;
  approvalPolicy: string;
  sandbox: string;
};

export type RemoteControlCheck = {
  key: string;
  label: string;
  status: string;
  detail: string;
};

export type RemoteControlStatus = {
  status: string;
  message: string;
  configPath: string;
  workspaceReady: boolean;
  appServerUrl: string;
  routeKey: string;
  warnings: string[];
  commands: {
    codexAppServer: string;
    feishuBridgeEnv: string[];
    feishuBridgeNotes: string[];
  };
  checks: RemoteControlCheck[];
};

export type RemoteControlResult = CommandResult<{
  config: RemoteControlConfig;
  status: RemoteControlStatus;
}>;

export type RemoteDependencyResult = CommandResult<{
  checks: RemoteControlCheck[];
}>;

export type CodexProjectSummary = {
  name: string;
  cwd: string;
  threadCount: number;
  latestUpdatedAtMs: number | null;
};

export type CodexThreadSummary = {
  id: string;
  title: string;
  cwd: string;
  archived: boolean;
  rolloutPath: string | null;
  updatedAtMs: number | null;
};

export type RemoteInventoryResult = CommandResult<{
  inventory: {
    status: string;
    message: string;
    dbPath: string;
    projects: CodexProjectSummary[];
    threads: CodexThreadSummary[];
  };
}>;

export type RemoteBotMessageResult = CommandResult<{
  response: {
    status: string;
    reply: string;
    action: string;
    selection: {
      workspaceName: string;
      workspacePath: string;
      threadId: string;
      threadName: string;
      updatedAtMs: number | null;
    } | null;
    choices: Array<{
      index: number;
      title: string;
      subtitle: string;
      value: string;
    }>;
    forwardToCodex: {
      workspacePath: string;
      threadId: string | null;
      threadName: string;
      prompt: string;
      createNewThread: boolean;
    } | null;
  };
}>;

export type RemoteBridgeResult = CommandResult<{
  bridge: {
    status: string;
    message: string;
    pid: number | null;
    startedAtMs: number | null;
    stoppedAtMs: number | null;
    scriptPath: string;
    configPath: string;
    logPath: string;
  };
  log: string;
}>;

export type ImageGenerationConfig = {
  baseUrl: string;
  model: string;
  size: string;
  quality: string;
  outputFormat: string;
  apiKeyConfigured: boolean;
  apiKeyHint: string;
};

export type ImageGenerationForm = {
  baseUrl: string;
  apiKey: string;
  model: string;
  size: string;
  quality: string;
  outputFormat: string;
};

export type PromptAgentConfig = {
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyHint: string;
};

export type PromptAgentForm = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ImageGenerationRequest = {
  prompt: string;
  size: string;
  quality: string;
  outputFormat: string;
};

export type ImageGenerationSettingsResult = CommandResult<{
  config: ImageGenerationConfig;
  configPath: string;
  outputDir: string;
}>;

export type PromptAgentSettingsResult = CommandResult<{
  config: PromptAgentConfig;
  configPath: string;
}>;

export type ImageGeneratedResult = CommandResult<{
  path: string;
  previewDataUrl: string;
  model: string;
  size: string;
  outputFormat: string;
  createdAtMs: number;
  durationMs?: number;
}>;

export type ImageFileActionResult = CommandResult<{
  path: string;
}>;

export type PromptEnhancedResult = CommandResult<{
  prompt: string;
  model: string;
  createdAtMs: number;
}>;

export type InstallResult = CommandResult<{
  silent_shortcut: { installed: boolean; path: string | null };
  management_shortcut: { installed: boolean; path: string | null };
}>;

export type UpdateResult = CommandResult<{
  currentVersion: string;
  latestVersion?: string | null;
  releaseSummary?: string;
  assetName?: string | null;
  assetUrl?: string | null;
  updateAvailable?: boolean;
  updateDate?: string | null;
  installedPath?: string;
  requiresExitForInstall?: boolean;
  progress?: number;
}>;

export type UpdateProgressEvent =
  | { event: "Started"; total: number }
  | { event: "Progress"; chunkLength: number }
  | { event: "Finished" };

export type StartupResult = CommandResult<{
  showUpdate: boolean;
}>;

export type Route =
  | "overview"
  | "pluginUnlock"
  | "conversationEnhance"
  | "userScripts"
  | "providerSync"
  | "imageGeneration"
  | "voiceInput"
  | "promptAgent"
  | "remoteControl"
  | "maintenance"
  | "about";

export type Theme = "dark" | "light";

export type LaunchForm = {
  appPath: string;
  debugPort: string;
  helperPort: string;
};

export type RemoteControlForm = {
  enabled: boolean;
  channel: string;
  workspaceName: string;
  workspacePath: string;
  larkAppId: string;
  larkAppSecret: string;
  larkEncryptKey: string;
  larkVerificationToken: string;
  threadName: string;
  threadId: string;
  feishuChatId: string;
  feishuUserId: string;
  autoBindP2p: boolean;
  appServerPort: string;
  bindHost: string;
  approvalPolicy: string;
  sandbox: string;
};

export type RemoteBotForm = {
  chatId: string;
  userId: string;
  text: string;
};

export type Notice = {
  title: string;
  message: string;
  status?: Status;
};

export type UpdateRelease = {
  version: string;
  url: string;
  body: string;
  asset_name: string;
  asset_url: string;
};

export type Actions = {
  refreshCurrent: () => Promise<void>;
  launch: () => Promise<void>;
  restart: () => Promise<void>;
  repairBackend: () => Promise<void>;
  installEntrypoints: () => Promise<void>;
  uninstallEntrypoints: () => Promise<void>;
  repairShortcuts: () => Promise<void>;
  checkOfficialPlugins: () => Promise<void>;
  refreshOfficialPluginCache: () => Promise<void>;
  checkUpdate: () => Promise<void>;
  performUpdate: () => Promise<void>;
  saveSettings: () => Promise<void>;
  resetSettings: () => Promise<void>;
  chooseCodexAppPath: (mode: "folder" | "file") => Promise<void>;
  deleteUserScript: (key: string) => Promise<void>;
  syncProvidersNow: () => Promise<void>;
  repairProviderPaths: () => Promise<void>;
  saveRemoteControl: () => Promise<void>;
  checkRemoteDependencies: () => Promise<void>;
  refreshRemoteInventory: () => Promise<void>;
  sendRemoteBotMessage: () => Promise<void>;
  refreshRemoteBridge: () => Promise<void>;
  startRemoteBridge: () => Promise<void>;
  stopRemoteBridge: () => Promise<void>;
  saveImageGeneration: () => Promise<void>;
  savePromptAgent: () => Promise<void>;
  enhanceImagePrompt: () => Promise<void>;
  generateImage: () => Promise<void>;
  openGeneratedImage: (path: string) => Promise<void>;
  saveGeneratedImageAs: (result: ImageGeneratedResult) => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  refreshLogs: () => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
  copyLogs: () => Promise<void>;
  copyDiagnostics: () => Promise<void>;
  goLogs: () => Promise<void>;
  installWatcher: () => Promise<void>;
  uninstallWatcher: () => Promise<void>;
  enableWatcher: () => Promise<void>;
  disableWatcher: () => Promise<void>;
  toggleTheme: () => void;
  checkHealth: () => Promise<void>;
};
