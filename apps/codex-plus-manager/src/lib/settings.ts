import type { BackendSettings } from "@/types";

export const defaultSettings: BackendSettings = {
  codexAppPath: "",
  codexExtraArgs: [],
  providerSyncEnabled: false,
  enhancementsEnabled: true,
  pluginMarketplaceUnlock: true,
  forcePluginInstall: true,
  sessionDelete: true,
  markdownExport: true,
  projectMove: true,
  conversationTimeline: true,
  globalVoiceInputEnabled: false,
  globalVoiceInputHoldHotkey: "F3",
  globalVoiceInputToggleHotkey: "F4",
};

export function normalizeSettings(settings: Partial<BackendSettings>): BackendSettings {
  return {
    codexAppPath: settings.codexAppPath ?? defaultSettings.codexAppPath,
    codexExtraArgs: Array.isArray(settings.codexExtraArgs) ? settings.codexExtraArgs : defaultSettings.codexExtraArgs,
    providerSyncEnabled: settings.providerSyncEnabled ?? defaultSettings.providerSyncEnabled,
    enhancementsEnabled: settings.enhancementsEnabled ?? defaultSettings.enhancementsEnabled,
    pluginMarketplaceUnlock: settings.pluginMarketplaceUnlock ?? defaultSettings.pluginMarketplaceUnlock,
    forcePluginInstall: settings.forcePluginInstall ?? defaultSettings.forcePluginInstall,
    sessionDelete: settings.sessionDelete ?? defaultSettings.sessionDelete,
    markdownExport: settings.markdownExport ?? defaultSettings.markdownExport,
    projectMove: settings.projectMove ?? defaultSettings.projectMove,
    conversationTimeline: settings.conversationTimeline ?? defaultSettings.conversationTimeline,
    globalVoiceInputEnabled: settings.globalVoiceInputEnabled ?? defaultSettings.globalVoiceInputEnabled,
    globalVoiceInputHoldHotkey: settings.globalVoiceInputHoldHotkey ?? defaultSettings.globalVoiceInputHoldHotkey,
    globalVoiceInputToggleHotkey: settings.globalVoiceInputToggleHotkey ?? defaultSettings.globalVoiceInputToggleHotkey,
  };
}

export function codexExtraArgsToInput(args: string[] | undefined) {
  return (args ?? []).join("\n");
}

export function inputToCodexExtraArgs(value: string) {
  return value === "" ? [] : value.split(/\r?\n/);
}
