export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    found: "已找到",
    missing: "缺失",
    installed: "已安装",
    ok: "正常",
    running: "运行中",
    failed: "失败",
    accepted: "已受理",
    not_checked: "未检查",
    disabled: "已禁用",
    ready: "已就绪",
    incomplete: "待完善",
    needs_repair: "需修复",
    partial: "部分检查",
    unknown: "未知",
  };
  return labels[status] ?? status;
}

export function statusClass(status: string) {
  if (["found", "installed", "ok", "running", "ready"].includes(status)) return "good";
  if (["failed", "missing"].includes(status)) return "bad";
  return "warn";
}

export function numberOrDefault(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function splitLogLines(text: string) {
  return text.trimEnd().split(/\r?\n/).filter((line, index, lines) => line.length > 0 || index < lines.length - 1);
}

export function formatTime(value: number) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN");
}

export function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
