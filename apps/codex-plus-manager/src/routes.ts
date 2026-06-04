import { FileCode2, Hammer, Info, LayoutDashboard, Link2, MessageSquareMore, Wrench, type LucideIcon } from "lucide-react";

import type { Route } from "@/types";

export const routes: Array<{ id: Route; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "pluginUnlock", label: "插件解锁", icon: Hammer },
  { id: "conversationEnhance", label: "对话增强", icon: MessageSquareMore },
  { id: "userScripts", label: "脚本", icon: FileCode2 },
  { id: "providerSync", label: "供应商同步", icon: Link2 },
  { id: "remoteControl", label: "移动/远程", icon: MessageSquareMore },
  { id: "maintenance", label: "维护", icon: Wrench },
  { id: "about", label: "关于", icon: Info },
];

export function routeTitle(route: Route) {
  return routes.find((item) => item.id === route)?.label ?? "概览";
}

export function routeSubtitle(route: Route) {
  const subtitles: Record<Route, string> = {
    overview: "检查问题、启动与快速修复",
    pluginUnlock: "切换第三方供应商后仍保持插件可见和可安装",
    conversationEnhance: "对话删除、导出、移动和时间线开关",
    userScripts: "内置和用户自定义脚本清单",
    providerSync: "供应商切换后保持历史会话可见和可续聊",
    remoteControl: "移动端入口、飞书桥接和远程安全预检",
    maintenance: "入口安装、修复、Watcher、手动启动与日志",
    about: "版本信息、项目链接与 GitHub Release 更新",
  };
  return subtitles[route];
}
