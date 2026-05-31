import {
  Activity,
  FileCode2,
  Hammer,
  Info,
  LayoutDashboard,
  Link2,
  ScrollText,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { Route } from "@/types";

export const routes: Array<{ id: Route; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "enhance", label: "增强功能", icon: Hammer },
  { id: "userScripts", label: "用户脚本", icon: FileCode2 },
  { id: "providerSync", label: "Provider History", icon: Link2 },
  { id: "maintenance", label: "安装维护", icon: Wrench },
  { id: "settings", label: "设置", icon: Settings },
  { id: "logs", label: "日志", icon: ScrollText },
  { id: "diagnostics", label: "诊断", icon: Activity },
  { id: "about", label: "关于", icon: Info },
];

export function routeTitle(route: Route) {
  return routes.find((item) => item.id === route)?.label ?? "概览";
}

export function routeSubtitle(route: Route) {
  const subtitles: Record<Route, string> = {
    overview: "检查问题、启动与快速修复",
    enhance: "脚本增强开关",
    userScripts: "内置和用户自定义脚本清单",
    providerSync: "历史会话可见性和路径修复",
    maintenance: "入口安装、修复、Watcher 与手动启动",
    settings: "主题、增强和 Provider 同步设置",
    logs: "最近状态文件内容",
    diagnostics: "可复制的运行诊断报告",
    about: "版本信息、项目链接与 GitHub Release 更新",
  };
  return subtitles[route];
}
