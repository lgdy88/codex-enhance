import type { OverviewResult } from "@/types";

export function healthItems(overview: OverviewResult | null) {
  return [
    {
      title: "Codex 应用",
      status: overview?.codex_app.status ?? "not_checked",
      ok: overview?.codex_app.status === "found",
      detail: overview?.codex_app.path || "尚未检查 Codex 应用路径。",
    },
    {
      title: "静默启动入口",
      status: overview?.silent_shortcut.status ?? "not_checked",
      ok: overview?.silent_shortcut.status === "installed",
      detail: overview?.silent_shortcut.path || "缺少 Dex 静默启动快捷方式时可在维护页修复。",
    },
    {
      title: "管理工具入口",
      status: overview?.management_shortcut.status ?? "not_checked",
      ok: overview?.management_shortcut.status === "installed",
      detail: overview?.management_shortcut.path || "缺少管理工具快捷方式时可在维护页修复。",
    },
  ];
}
