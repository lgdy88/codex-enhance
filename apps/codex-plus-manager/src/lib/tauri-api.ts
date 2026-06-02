import { invoke } from "@tauri-apps/api/core";

import type {
  BackendSettings,
  CommandResult,
  DiagnosticsResult,
  InstallResult,
  LogsResult,
  OverviewResult,
  ProviderActionResult,
  RemoteControlConfig,
  RemoteControlResult,
  RemoteDependencyResult,
  RemoteInventoryResult,
  RemoteBridgeResult,
  RemoteBotMessageResult,
  SettingsResult,
  StartupResult,
  UpdateRelease,
  UpdateResult,
  WatcherResult,
} from "@/types";

const call = <T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args);

type LaunchRequest = {
  appPath: string;
  extraArgs: string[];
  debugPort: number;
  helperPort: number;
};

export const loadOverview = () => call<OverviewResult>("load_overview");

export const loadSettings = () => call<SettingsResult>("load_settings");

export const readLatestLogs = (lines = 240) => call<LogsResult>("read_latest_logs", { request: { lines } });

export const copyDiagnostics = () => call<DiagnosticsResult>("copy_diagnostics");

export const loadWatcherState = () => call<WatcherResult>("load_watcher_state");

export const launchCodexPlus = (
  command: "launch_codex_plus" | "restart_codex_plus",
  request: LaunchRequest,
) =>
  call<CommandResult<Record<string, unknown>>>(command, {
    request: {
      appPath: request.appPath,
      extraArgs: request.extraArgs,
      debugPort: request.debugPort,
      helperPort: request.helperPort,
    },
  });

export const saveBackendSettings = (settings: BackendSettings) => call<SettingsResult>("save_settings", { settings });

export const resetBackendSettings = () => call<SettingsResult>("reset_settings");

export const repairBackend = () => call<SettingsResult>("repair_backend");

export const deleteUserScript = (key: string) => call<SettingsResult>("delete_user_script", { request: { key } });

export const runProviderAction = (command: "sync_providers_now" | "repair_provider_paths") => call<ProviderActionResult>(command);

export const loadRemoteControl = () => call<RemoteControlResult>("load_remote_control");

export const saveRemoteControl = (config: RemoteControlConfig) => call<RemoteControlResult>("save_remote_control", { config });

export const checkRemoteDependencies = () => call<RemoteDependencyResult>("check_remote_dependencies");

export const loadRemoteInventory = () => call<RemoteInventoryResult>("load_remote_inventory");

export const handleRemoteBotMessage = (request: { chatId: string; userId: string; text: string }) =>
  call<RemoteBotMessageResult>("handle_remote_bot_message", { request });

export const remoteBridgeStatus = () => call<RemoteBridgeResult>("remote_bridge_status");

export const startRemoteBridge = () => call<RemoteBridgeResult>("start_remote_bridge");

export const stopRemoteBridge = () => call<RemoteBridgeResult>("stop_remote_bridge");

export const readRemoteBridgeLog = () => call<RemoteBridgeResult>("read_remote_bridge_log");

export const installEntrypoints = () => call<InstallResult>("install_entrypoints");

export const uninstallEntrypoints = (removeOwnedData: boolean) => call<InstallResult>("uninstall_entrypoints", { options: { removeOwnedData } });

export const repairShortcuts = () => call<InstallResult>("repair_shortcuts");

export const runWatcherAction = (command: "install_watcher" | "uninstall_watcher" | "enable_watcher" | "disable_watcher") => call<WatcherResult>(command);

export const checkUpdate = () => call<UpdateResult>("check_update");

export const performUpdate = (release: UpdateRelease | null) => call<UpdateResult>("perform_update", { release });

export const openExternalUrl = (url: string) => call<CommandResult<Record<string, unknown>>>("open_external_url", { url });

export const startupOptions = () => call<StartupResult>("startup_options");
