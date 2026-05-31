import type { BackendSettings } from "@/types";

export const defaultSettings: BackendSettings = {
  codexAppPath: "",
  codexExtraArgs: [],
  providerSyncEnabled: false,
  enhancementsEnabled: true,
};

export function normalizeSettings(settings: Partial<BackendSettings>): BackendSettings {
  return {
    codexAppPath: settings.codexAppPath ?? defaultSettings.codexAppPath,
    codexExtraArgs: Array.isArray(settings.codexExtraArgs) ? settings.codexExtraArgs : defaultSettings.codexExtraArgs,
    providerSyncEnabled: settings.providerSyncEnabled ?? defaultSettings.providerSyncEnabled,
    enhancementsEnabled: settings.enhancementsEnabled ?? defaultSettings.enhancementsEnabled,
  };
}

export function codexExtraArgsToInput(args: string[] | undefined) {
  return (args ?? []).join("\n");
}

export function inputToCodexExtraArgs(value: string) {
  return value === "" ? [] : value.split(/\r?\n/);
}
