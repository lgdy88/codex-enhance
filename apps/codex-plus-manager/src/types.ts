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
  installedPath?: string;
  progress?: number;
}>;

export type StartupResult = CommandResult<{
  showUpdate: boolean;
}>;

export type Route =
  | "overview"
  | "enhance"
  | "userScripts"
  | "providerSync"
  | "maintenance"
  | "settings"
  | "logs"
  | "diagnostics"
  | "about";

export type Theme = "dark" | "light";

export type LaunchForm = {
  appPath: string;
  debugPort: string;
  helperPort: string;
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
  checkUpdate: () => Promise<void>;
  performUpdate: () => Promise<void>;
  saveSettings: () => Promise<void>;
  resetSettings: () => Promise<void>;
  deleteUserScript: (key: string) => Promise<void>;
  syncProvidersNow: () => Promise<void>;
  repairProviderPaths: () => Promise<void>;
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
