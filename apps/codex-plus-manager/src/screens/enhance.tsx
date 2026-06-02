import { CardHead, FeatureItem, Panel, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import type { Actions, BackendSettings } from "@/types";

export function EnhanceScreen({ form, onFormChange, actions }: { form: BackendSettings; onFormChange: (value: BackendSettings) => void; actions: Actions }) {
  return (
    <Panel>
      <CardHead title="增强功能" detail="控制本地 renderer 注入能力，不写 Codex 认证或 provider 配置" />
      <CardContent>
        <label className="switch-row">
          <input checked={form.enhancementsEnabled} onChange={(event) => onFormChange({ ...form, enhancementsEnabled: event.currentTarget.checked })} type="checkbox" />
          <span>
            <strong>启用 Dex 增强功能</strong>
            <small>关闭后会停用删除、导出、项目移动、Timeline、插件相关和注入菜单位置增强。</small>
          </span>
        </label>
        <div className="feature-list">
          <FeatureItem title="会话删除" detail="会话列表悬停删除，并保留撤销能力。" enabled={form.enhancementsEnabled} />
          <FeatureItem title="Markdown 导出" detail="按本地 rollout 导出带时间戳的 Markdown。" enabled={form.enhancementsEnabled} />
          <FeatureItem title="项目移动" detail="把会话移动到普通对话或其他本地项目。" enabled={form.enhancementsEnabled} />
          <FeatureItem title="Timeline" detail="在对话右侧显示用户提问时间线。" enabled={form.enhancementsEnabled} />
          <FeatureItem title="用户脚本" detail="合并内置脚本和用户脚本包后注入。" enabled={form.enhancementsEnabled} />
        </div>
        <Toolbar>
          <Button onClick={() => void actions.saveSettings()}>保存增强设置</Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}
