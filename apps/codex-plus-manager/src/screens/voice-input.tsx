import { Keyboard, Mic, ShieldCheck, X } from "lucide-react";
import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { CardHead, Panel, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import type { Actions, BackendSettings } from "@/types";

export function VoiceInputScreen({
  form,
  onFormChange,
  actions,
}: {
  form: BackendSettings;
  onFormChange: (value: BackendSettings) => void;
  actions: Actions;
}) {
  const setField = (field: keyof BackendSettings, value: boolean | string) => {
    onFormChange({ ...form, [field]: value });
  };

  return (
    <Panel>
      <CardHead title="全局语音输入" detail="在任意当前焦点输入框里用快捷键触发语音键入，不再只绑定 Codex composer。" />
      <CardContent>
        <label className="switch-row hero-switch">
          <input checked={form.globalVoiceInputEnabled} onChange={(event) => setField("globalVoiceInputEnabled", event.currentTarget.checked)} type="checkbox" />
          <span>
            <strong>启用全局语音输入</strong>
            <small>保存后从 Dex 静默入口启动或重启 Dex 才会注册全局快捷键。当前 Windows 版桥接系统语音键入，后续可替换为 Dex 自有 ASR。</small>
          </span>
        </label>

        <div className="voice-mode-grid">
          <section className="voice-mode-card">
            <Keyboard className="h-5 w-5" aria-hidden="true" />
            <div>
              <strong>长按模式</strong>
              <span>按住快捷键开始系统语音键入，松开时再次触发结束。默认 F3。</span>
            </div>
            <div className="field voice-shortcut-field">
              <span>快捷键</span>
              <ShortcutCapture value={form.globalVoiceInputHoldHotkey} fallback="F3" onChange={(value) => setField("globalVoiceInputHoldHotkey", value)} />
            </div>
          </section>
          <section className="voice-mode-card">
            <Mic className="h-5 w-5" aria-hidden="true" />
            <div>
              <strong>免按模式</strong>
              <span>按一下快捷键切换系统语音键入状态。默认 F4。</span>
            </div>
            <div className="field voice-shortcut-field">
              <span>快捷键</span>
              <ShortcutCapture value={form.globalVoiceInputToggleHotkey} fallback="F4" onChange={(value) => setField("globalVoiceInputToggleHotkey", value)} />
            </div>
          </section>
        </div>

        <div className="voice-boundary-list">
          <div>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>第一版只桥接 Windows 语音键入，不记录音频、不保存转写、不读取剪贴板。</span>
          </div>
          <div>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>Codex 页面内的“Dex 语音输入 Beta”仍保留为兼容按钮；全局语音输入由 Dex 静默入口负责。</span>
          </div>
        </div>

        <Toolbar>
          <Button onClick={() => void actions.saveSettings()}>保存语音输入设置</Button>
          <Button onClick={() => void actions.restart()} variant="outline">
            保存后重启 Dex
          </Button>
        </Toolbar>
      </CardContent>
    </Panel>
  );
}

function ShortcutCapture({ value, fallback, onChange }: { value: string; fallback: string; onChange: (value: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [pendingModifier, setPendingModifier] = useState<string | null>(null);
  const displayValue = value.trim() || fallback;
  const stopRecording = () => {
    setRecording(false);
    setPendingModifier(null);
  };

  return (
    <div className="shortcut-capture">
      <div className="shortcut-capture-row">
        <button
          className={`shortcut-capture-button ${recording ? "is-recording" : ""}`}
          onBlur={stopRecording}
          onClick={() => {
            setRecording(true);
            setPendingModifier(null);
          }}
          onKeyDown={(event) => {
            if (!recording) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) {
              return;
            }
            const shortcut = shortcutFromKeyboardEvent(event);
            if (shortcut === "CANCEL") {
              stopRecording();
              return;
            }
            const modifier = modifierTokenFromEvent(event);
            if (modifier) {
              setPendingModifier(modifier);
              return;
            }
            if (shortcut) {
              onChange(shortcut);
              stopRecording();
            }
          }}
          onKeyUp={(event) => {
            if (!recording) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            const modifier = modifierTokenFromEvent(event);
            if (modifier && modifier === pendingModifier) {
              onChange(modifier);
              stopRecording();
            }
          }}
          type="button"
        >
          <kbd>{recording ? "请按快捷键" : displayValue}</kbd>
        </button>
        <Button aria-label="恢复默认快捷键" onClick={() => onChange(fallback)} size="icon" title="恢复默认快捷键" type="button" variant="outline">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <small className="voice-shortcut-hint">{recording ? "按 Esc 取消。支持 F 键、右 Ctrl、Alt+Space、Ctrl+Alt+Space 等组合。" : "点击快捷键框后直接按键录入。"}</small>
    </div>
  );
}

function shortcutFromKeyboardEvent(event: ReactKeyboardEvent<HTMLButtonElement>) {
  if (event.key === "Escape") {
    return "CANCEL";
  }

  const modifierKey = modifierTokenFromEvent(event);
  if (modifierKey) {
    return modifierKey;
  }

  const primaryKey = primaryKeyFromEvent(event);
  if (!primaryKey) {
    return null;
  }

  const modifiers = [
    event.ctrlKey ? "Ctrl" : null,
    event.altKey ? "Alt" : null,
    event.shiftKey ? "Shift" : null,
    event.metaKey ? "Win" : null,
  ].filter(Boolean);
  return [...modifiers, primaryKey].join("+");
}

function modifierTokenFromEvent(event: ReactKeyboardEvent<HTMLButtonElement>) {
  if (!["Control", "Alt", "Shift", "Meta"].includes(event.key)) {
    return null;
  }
  const side = event.location === KeyboardEvent.DOM_KEY_LOCATION_RIGHT ? "Right" : event.location === KeyboardEvent.DOM_KEY_LOCATION_LEFT ? "Left" : "";
  const key = event.key === "Control" ? "Ctrl" : event.key === "Meta" ? "Win" : event.key;
  return `${side}${key}`;
}

function primaryKeyFromEvent(event: ReactKeyboardEvent<HTMLButtonElement>) {
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.key)) {
    return event.key.toUpperCase();
  }
  if (event.code === "Space" || event.key === " ") {
    return "Space";
  }
  if (/^Key[A-Z]$/.test(event.code)) {
    return event.code.slice(3);
  }
  if (/^Digit[0-9]$/.test(event.code)) {
    return event.code.slice(5);
  }
  if (/^Numpad[0-9]$/.test(event.code)) {
    return event.code;
  }
  const aliases: Record<string, string> = {
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    ArrowUp: "Up",
    Backspace: "Backspace",
    CapsLock: "CapsLock",
    Delete: "Delete",
    End: "End",
    Enter: "Enter",
    Home: "Home",
    Insert: "Insert",
    PageDown: "PageDown",
    PageUp: "PageUp",
    Tab: "Tab",
  };
  return aliases[event.key] ?? null;
}
