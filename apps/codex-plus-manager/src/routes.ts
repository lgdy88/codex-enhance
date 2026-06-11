import { FileCode2, Hammer, Image, Info, KeyboardMusic, LayoutDashboard, Link2, MessageSquareMore, WandSparkles, Wrench, type LucideIcon } from "lucide-react";

import type { Route } from "@/types";

export const routes: Array<{ id: Route; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "pluginUnlock", label: "插件解锁", icon: Hammer },
  { id: "conversationEnhance", label: "对话增强", icon: MessageSquareMore },
  { id: "userScripts", label: "脚本", icon: FileCode2 },
  { id: "providerSync", label: "供应商同步", icon: Link2 },
  { id: "imageGeneration", label: "生图", icon: Image },
  { id: "voiceInput", label: "语音输入", icon: KeyboardMusic },
  { id: "promptAgent", label: "Agent 增强", icon: WandSparkles },
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
    imageGeneration: "配置 Images API，并在 Dex 内直接输入提示词生成图片",
    voiceInput: "用全局快捷键在当前焦点输入框触发语音输入",
    promptAgent: "配置用于润色生图提示词的多模态/聊天模型",
    remoteControl: "移动端入口、飞书 Channel 配置和桥接启动",
    maintenance: "入口安装、修复、Watcher、手动启动与日志",
    about: "版本信息、项目链接与 GitHub Release 更新",
  };
  return subtitles[route];
}
