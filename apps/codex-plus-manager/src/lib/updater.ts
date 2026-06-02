import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

import type { UpdateProgressEvent, UpdateResult } from "@/types";

export type UpdaterCheck = {
  result: UpdateResult;
  update: Update | null;
};

export async function checkForUpdate(): Promise<UpdaterCheck> {
  const currentVersion = await getCurrentVersion();
  let update: Update | null = null;

  try {
    update = await check({ timeout: 30000 });
  } catch (error) {
    return {
      result: failedCheckResult(currentVersion, error),
      update: null,
    };
  }

  if (!update) {
    return {
      result: {
        status: "ok",
        message: "当前已是最新版本。",
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        progress: 0,
      },
      update: null,
    };
  }

  return {
    result: updateResultFromHandle(currentVersion, update),
    update,
  };
}

export async function installUpdate(
  update: Update,
  onProgress: (event: UpdateProgressEvent) => void,
): Promise<UpdateResult> {
  const currentVersion = await getCurrentVersion();

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      onProgress({ event: "Started", total: event.data.contentLength ?? 0 });
      return;
    }

    if (event.event === "Progress") {
      onProgress({ event: "Progress", chunkLength: event.data.chunkLength ?? 0 });
      return;
    }

    if (event.event === "Finished") {
      onProgress({ event: "Finished" });
    }
  });

  await relaunch();

  return {
    status: "ok",
    message: "更新已安装，正在重启 Dex。",
    currentVersion,
    latestVersion: update.version,
    releaseSummary: update.body ?? "",
    updateAvailable: false,
    progress: 100,
  };
}

async function getCurrentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "";
  }
}

function updateResultFromHandle(currentVersion: string, update: Update): UpdateResult {
  return {
    status: "ok",
    message: `发现可用更新：${update.version}`,
    currentVersion,
    latestVersion: update.version,
    releaseSummary: update.body ?? "",
    updateAvailable: true,
    updateDate: update.date ?? null,
    progress: 0,
  };
}

function failedCheckResult(currentVersion: string, error: unknown): UpdateResult {
  const detail = stringifyUpdateError(error);
  const message = updateCheckFailureMessage(detail);
  return {
    status: "failed",
    message,
    currentVersion,
    latestVersion: null,
    releaseSummary: message,
    updateAvailable: false,
    progress: 0,
  };
}

function updateCheckFailureMessage(detail: string): string {
  const lower = detail.toLowerCase();
  const looksLikeManifestMismatch =
    lower.includes("latest.json") ||
    lower.includes("manifest") ||
    lower.includes("platform") ||
    lower.includes("signature") ||
    lower.includes("invalid");

  if (looksLikeManifestMismatch) {
    return "远端更新清单尚未切换为签名格式；下一次发布生成 latest.json 后即可使用应用内更新。";
  }

  return `检查更新失败：${detail}`;
}

function stringifyUpdateError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
