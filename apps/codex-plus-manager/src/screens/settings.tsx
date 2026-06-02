import { CardHead, Field, Panel, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { codexExtraArgsToInput, inputToCodexExtraArgs } from "@/lib/settings";
import type { Actions, BackendSettings, SettingsResult, Theme } from "@/types";

export function SettingsScreen({
  settings,
  theme,
  form,
  onFormChange,
  actions,
}: {
  settings: SettingsResult | null;
  theme: Theme;
  form: BackendSettings;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  return (
    <Panel>
      <CardHead title="基础设置" detail={settings?.settings_path ?? ""} />
      <CardContent>
        <div className="theme-row">
          <div>
            <strong>界面主题</strong>
            <span>当前为{theme === "dark" ? "深色" : "浅色"}模式。</span>
          </div>
          <Button variant="secondary" onClick={actions.toggleTheme}>切换主题</Button>
        </div>
        <div className="setting-grid">
          <Field label="默认 Codex 应用路径">
            <Input
              placeholder="Codex.exe、Codex.app、app 目录或解包目录"
              value={form.codexAppPath}
              onChange={(event) => onFormChange({ ...form, codexAppPath: event.currentTarget.value })}
            />
          </Field>
          <label className="switch-row">
            <input checked={form.enhancementsEnabled} onChange={(event) => onFormChange({ ...form, enhancementsEnabled: event.currentTarget.checked })} type="checkbox" />
            <span>
              <strong>增强功能</strong>
              <small>控制 renderer 注入能力。</small>
            </span>
          </label>
          <label className="switch-row">
            <input checked={form.providerSyncEnabled} onChange={(event) => onFormChange({ ...form, providerSyncEnabled: event.currentTarget.checked })} type="checkbox" />
            <span>
              <strong>Provider 自动同步</strong>
              <small>通过 Dex 启动前自动运行 provider metadata 同步。</small>
            </span>
          </label>
        </div>
        <Field label="Codex 额外启动参数">
          <Textarea
            className="launch-args-input"
            placeholder="--force_high_performance_gpu"
            spellCheck={false}
            value={codexExtraArgsToInput(form.codexExtraArgs)}
            onChange={(event) => onFormChange({ ...form, codexExtraArgs: inputToCodexExtraArgs(event.currentTarget.value) })}
          />
        </Field>
        <p className="field-hint">每行一个参数，追加到默认 CDP 参数后；不需要填写 open 或 --args。</p>
        <Toolbar>
          <Button onClick={() => void actions.saveSettings()}>保存设置</Button>
          <Button variant="secondary" onClick={() => void actions.resetSettings()}>重置设置</Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}
