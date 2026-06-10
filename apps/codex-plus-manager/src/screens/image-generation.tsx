import { convertFileSrc } from "@tauri-apps/api/core";
import { Copy, ImageIcon, LoaderCircle, Save, Sparkles } from "lucide-react";
import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

import { CardHead, Field, Metric, Panel, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatTime } from "@/lib/format";
import type { Actions, ImageGeneratedResult, ImageGenerationForm, ImageGenerationSettingsResult } from "@/types";

export function ImageGenerationScreen({
  settings,
  form,
  prompt,
  result,
  generating,
  onFormChange,
  onPromptChange,
  actions,
}: {
  settings: ImageGenerationSettingsResult | null;
  form: ImageGenerationForm;
  prompt: string;
  result: ImageGeneratedResult | null;
  generating: boolean;
  onFormChange: (value: ImageGenerationForm) => void;
  onPromptChange: (value: string) => void;
  actions: Actions;
}) {
  const config = settings?.config;
  const canGenerate = prompt.trim().length > 0 && !generating;

  return (
    <div className="image-generation-layout">
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
            <Metric label="生成位置" value={settings?.outputDir ?? "Web preview"} />
          </div>
          <Toolbar>
            <Button onClick={() => void actions.saveImageGeneration()}>
              <Save className="h-4 w-4" />
              保存生图配置
            </Button>
          </Toolbar>
        </CardContent>
      </Panel>

      <Panel className="image-workbench">
        <CardHead title="Dex 直接生图" detail="在这里输入提示词，Dex 直接调用已保存的 Images API 并返回本地图片。" />
        <CardContent>
          <div className="image-prompt-area">
            <Field label="提示词">
              <Textarea
                className="image-prompt-input"
                disabled={generating}
                placeholder="描述你想生成的图片，例如：一张简洁的赛博城市海报，青绿色主色调，无文字。"
                value={prompt}
                onChange={(event) => onPromptChange(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void actions.generateImage();
                  }
                }}
              />
            </Field>
            <div className="image-prompt-footer">
              <span>Enter 换行，Ctrl/⌘ + Enter 生成</span>
              <Button disabled={!canGenerate} onClick={() => void actions.generateImage()}>
                {generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "生成中" : "生成图片"}
              </Button>
            </div>
          </div>

          <ImageResult result={result} generating={generating} />
        </CardContent>
      </Panel>
    </div>
  );
}

function ImageResult({ result, generating }: { result: ImageGeneratedResult | null; generating: boolean }) {
  const [copyMessage, setCopyMessage] = useState("");
  const copyInFlight = useRef(false);

  if (generating) {
    return (
      <div className="image-result-card image-result-loading" aria-live="polite">
        <div className="image-loading-ring" />
        <strong>正在生成图片</strong>
        <span>请求可能需要几十秒，完成后会保存到 Dex 图片目录。</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="image-result-card image-result-empty">
        <ImageIcon className="h-7 w-7" />
        <strong>还没有生成结果</strong>
        <span>输入提示词后点击生成，结果会显示在这里。</span>
      </div>
    );
  }

  if (result.status === "failed" || !result.path) {
    return (
      <div className="image-result-card image-result-error">
        <strong>{result.message || "生图失败"}</strong>
        <span>请检查请求地址、API-key、模型名和供应商返回格式。</span>
      </div>
    );
  }

  const copyImage = async (event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) => {
    event.preventDefault();
    if (copyInFlight.current) return;
    copyInFlight.current = true;
    setCopyMessage("正在复制图片...");
    try {
      const message = await copyImageToClipboard(result.path);
      setCopyMessage(message);
    } catch (error) {
      const fallback = await copyTextFallback(result.path);
      setCopyMessage(fallback ? "图片复制失败，已复制路径。" : "复制失败，请手动复制路径。");
    } finally {
      copyInFlight.current = false;
      window.setTimeout(() => setCopyMessage(""), 2200);
    }
  };

  const copyImageOnRightMouseDown = (event: MouseEvent<HTMLImageElement> | PointerEvent<HTMLImageElement>) => {
    if (event.button !== 2) return;
    void copyImage(event);
  };

  return (
    <div className="image-result-card image-result-ready">
      <div className="image-result-preview">
        <img
          src={imageSource(result.path)}
          alt="生成结果"
          onContextMenu={(event) => void copyImage(event)}
          onAuxClick={copyImageOnRightMouseDown}
          onMouseDown={copyImageOnRightMouseDown}
          onMouseUp={copyImageOnRightMouseDown}
          onPointerDown={copyImageOnRightMouseDown}
          title="右键复制图片"
        />
        <span className="image-copy-hint">{copyMessage || "右键图片复制"}</span>
      </div>
      <div className="metric-list image-result-meta">
        <Metric label="模型" value={result.model} />
        <Metric label="尺寸" value={result.size} />
        <Metric label="格式" value={result.outputFormat} />
        <Metric label="时间" value={formatTime(result.createdAtMs)} />
        <Metric label="路径" value={result.path} />
        <div className="image-result-actions">
          <Button onClick={(event) => void copyImage(event)} variant="outline">
            <Copy className="h-4 w-4" />
            复制图片
          </Button>
          <span>{copyMessage || "也可以在图片上点鼠标右键复制"}</span>
        </div>
      </div>
    </div>
  );
}

function imageSource(path: string) {
  if (/^(data:|https?:|blob:|asset:)/i.test(path)) return path;
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
}

async function copyImageToClipboard(path: string) {
  const clipboard = navigator.clipboard;
  if (!clipboard?.write || typeof ClipboardItem === "undefined") {
    const copied = await copyTextFallback(path);
    return copied ? "当前环境不支持复制图片，已复制路径。" : "当前环境不支持复制图片。";
  }

  const blob = await fetchImageBlob(path);
  const pngBlob = blob.type === "image/png" ? blob : await convertBlobToPng(blob);
  await clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
  return "图片已复制。";
}

async function fetchImageBlob(path: string) {
  const source = imageSource(path);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`failed to read generated image: ${response.status}`);
  return response.blob();
}

function convertBlobToPng(blob: Blob) {
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas context unavailable"));
        return;
      }
      context.drawImage(image, 0, 0);
      canvas.toBlob((pngBlob) => {
        URL.revokeObjectURL(url);
        if (pngBlob) resolve(pngBlob);
        else reject(new Error("failed to convert image"));
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("failed to load image"));
    };
    image.src = url;
  });
}

async function copyTextFallback(value: string) {
  try {
    await navigator.clipboard?.writeText(value);
    return true;
  } catch {
    return false;
  }
}
