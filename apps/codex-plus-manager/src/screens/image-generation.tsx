import { Save } from "lucide-react";

import { CardHead, Field, Metric, Panel, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Actions, ImageGenerationForm, ImageGenerationSettingsResult } from "@/types";

export function ImageGenerationScreen({
  settings,
  form,
  onFormChange,
  actions,
}: {
  settings: ImageGenerationSettingsResult | null;
  form: ImageGenerationForm;
  onFormChange: (value: ImageGenerationForm) => void;
  actions: Actions;
}) {
  const config = settings?.config;

  return (
    <Panel>
      <CardHead title="Images API 配置" detail={settings?.configPath ?? "保存到 Dex 私有 image.json，不写入 Codex config.toml"} />
      <CardContent>
        <div className="setting-grid">
          <Field label="请求地址">
            <Input
              placeholder="https://api.openai.com 或兼容代理地址"
              value={form.baseUrl}
              onChange={(event) => onFormChange({ ...form, baseUrl: event.currentTarget.value })}
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
          <Field label="模型名">
            <Input
              placeholder="gpt-image-2"
              value={form.model}
              onChange={(event) => onFormChange({ ...form, model: event.currentTarget.value })}
            />
          </Field>
        </div>
        <div className="metric-list image-config-state">
          <Metric label="密钥状态" value={config?.apiKeyConfigured ? config.apiKeyHint : "未配置"} />
          <Metric label="使用方式" value="在 Codex 桌面聊天输入：生图：...、画图：...、/image ..." />
        </div>
        <Toolbar>
          <Button onClick={() => void actions.saveImageGeneration()}>
            <Save className="h-4 w-4" />
            保存生图配置
          </Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}
