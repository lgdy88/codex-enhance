import { CardHead, Panel, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import type { Actions, BackendSettings } from "@/types";

type EnhancementKey =
  | "pluginMarketplaceUnlock"
  | "forcePluginInstall"
  | "sessionDelete"
  | "markdownExport"
  | "projectMove"
  | "conversationTimeline";

const enhancementGroups: Array<{
  mode: EnhanceMode;
  title: string;
  detail: string;
  items: Array<{ key: EnhancementKey; title: string; detail: string }>;
}> = [
  {
    mode: "plugins",
    title: "插件解锁",
    detail: "主打场景：切换第三方供应商、API Key 或请求地址后，仍尽量保持插件市场完整可见并可安装。",
    items: [
      {
        key: "pluginMarketplaceUnlock",
        title: "插件市场解锁",
        detail: "绕过 CodexApp 对 marketplace 和 build flavor 的隐藏过滤，保留 Chrome 等官方插件入口。",
      },
      {
        key: "forcePluginInstall",
        title: "特殊插件强制安装",
        detail: "解除 App unavailable / 应用不可用导致的前端安装禁用，安装请求会还原官方 marketplace 名称。",
      },
    ],
  },
  {
    mode: "conversation",
    title: "对话增强",
    detail: "对话列表和会话阅读里的高频操作统一收在增强功能页。",
    items: [
      {
        key: "sessionDelete",
        title: "对话删除",
        detail: "会话列表和归档列表显示删除入口，并保留确认与撤销路径。",
      },
      {
        key: "markdownExport",
        title: "对话导出",
        detail: "按本地 rollout 导出带时间戳的 Markdown。",
      },
      {
        key: "projectMove",
        title: "对话移动",
        detail: "把会话移动到普通对话或其他本地项目，并同步排序投影。",
      },
      {
        key: "conversationTimeline",
        title: "对话时间线",
        detail: "在对话右侧显示用户提问时间线，悬停看摘要，点击跳转。",
      },
    ],
  },
];

type EnhanceMode = "plugins" | "conversation";

const screenCopy: Record<EnhanceMode, { title: string; detail: string; saveLabel: string }> = {
  plugins: {
    title: "插件解锁",
    detail: "第三方供应商、API Key 或请求地址切换后，保持插件市场入口、Chrome 插件和特殊插件安装能力。",
    saveLabel: "保存插件解锁设置",
  },
  conversation: {
    title: "对话增强",
    detail: "按需启用对话删除、导出、移动和时间线能力，让会话管理保持清楚可控。",
    saveLabel: "保存对话增强设置",
  },
};

export function EnhanceScreen({
  mode,
  form,
  onFormChange,
  actions,
}: {
  mode: EnhanceMode;
  form: BackendSettings;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const visibleGroups = enhancementGroups.filter((group) => group.mode === mode);
  const copy = screenCopy[mode];

  const setFeature = (key: EnhancementKey, value: boolean) => {
    onFormChange({ ...form, [key]: value });
  };

  return (
    <>
      <Panel>
        <CardHead title={copy.title} detail={copy.detail} />
        <CardContent>
          <label className="switch-row hero-switch">
            <input checked={form.enhancementsEnabled} onChange={(event) => onFormChange({ ...form, enhancementsEnabled: event.currentTarget.checked })} type="checkbox" />
            <span>
              <strong>启用 Dex 注入增强</strong>
              <small>关闭后会停用插件解锁、安装修复、对话删除、导出、移动和时间线等 renderer 注入能力。</small>
            </span>
          </label>
          <div className="enhance-groups">
            {visibleGroups.map((group) => (
              <section className="enhance-group" key={group.title}>
                <div className="enhance-group-head">
                  <strong>{group.title}</strong>
                  <span>{group.detail}</span>
                </div>
                <div className="feature-check-list">
                  {group.items.map((item) => (
                    <label className="feature-check-row" key={item.key}>
                      <input
                        checked={form[item.key]}
                        disabled={!form.enhancementsEnabled}
                        onChange={(event) => setFeature(item.key, event.currentTarget.checked)}
                        type="checkbox"
                      />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <Toolbar>
            <Button onClick={() => void actions.saveSettings()}>{copy.saveLabel}</Button>
          </Toolbar>
        </CardContent>
      </Panel>
    </>
  );
}
