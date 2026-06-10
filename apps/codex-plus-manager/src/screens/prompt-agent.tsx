import { Save, WandSparkles } from "lucide-react";

import { CardHead, Field, Metric, Panel, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Actions, PromptAgentForm, PromptAgentSettingsResult } from "@/types";

export function PromptAgentScreen({
  settings,
  form,
  onFormChange,
  actions,
}: {
  settings: PromptAgentSettingsResult | null;
  form: PromptAgentForm;
  onFormChange: (value: PromptAgentForm) => void;
  actions: Actions;
}) {
  const config = settings?.config;

  return (
    <div className="image-generation-layout">
      <Panel>
        <CardHead
          title="Agent 增强配置"
          detail={settings?.configPath ?? "保存到 Dex 私有 prompt-agent.json，不写入 Codex config.toml"}
        />
        <CardContent>
          <div className="setting-grid">
            <Field label="请求地址">
              <Input
                placeholder="https://www.xiavier.com 或 OpenAI-compatible 地址"
                value={form.baseUrl}
                onChange={(event) => onFormChange({ ...form, baseUrl: event.currentTarget.value })}
              />
            </Field>
            <Field label="模型名">
              <Input
                placeholder="gpt-5.5"
                value={form.model}
                onChange={(event) => onFormChange({ ...form, model: event.currentTarget.value })}
              />
            </Field>
            <Field label="API-key">
              <Input
                autoComplete="off"
                placeholder={config?.apiKeyHint || "保存后不回显明文"}
                type="password"
                value={form.apiKey}
                onChange={(event) => onFormChange({ ...form, apiKey: event.currentTarget.value })}
              />
            </Field>
          </div>
          <div className="metric-list image-config-state">
            <Metric label="密钥状态" value={config?.apiKeyConfigured ? config.apiKeyHint : "未配置"} />
            <Metric label="请求地址" value={config?.baseUrl ?? form.baseUrl} />
            <Metric label="模型名" value={config?.model ?? form.model} />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.savePromptAgent()}>
              <Save className="h-4 w-4" />
              保存 Agent 配置
            </Button>
            <Button onClick={() => void actions.refreshCurrent()} variant="outline">
              <WandSparkles className="h-4 w-4" />
              重新加载
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>

      <Panel>
        <CardHead title="使用方式" detail="生图页的 Agent 增强按钮会调用这里保存的模型润色当前提示词。" />
        <CardContent>
          <div className="hint-line">
            <WandSparkles className="h-4 w-4" />
            <span>推荐使用支持长上下文和视觉理解的多模态/聊天模型，例如 gpt-5.5。当前版本只发送文本提示词，后续参考图上下文可以继续接入同一配置。</span>
          </div>
        </CardContent>
      </Panel>
    </div>
  );
}
