import { convertFileSrc } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  ImageIcon,
  LoaderCircle,
  Save,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { CardHead, Field, Metric, Panel, Toolbar } from "@/components/app";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatTime } from "@/lib/format";
import type {
  Actions,
  ImageGeneratedResult,
  ImageGenerationForm,
  ImageGenerationSettingsResult,
} from "@/types";

const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536", "auto"];
const IMAGE_QUALITIES = ["auto", "low", "medium", "high"];
const IMAGE_FORMATS = ["png", "jpeg", "webp"];

const PROMPT_TEMPLATES = [
  {
    id: "ecom",
    label: "电商图",
    template:
      "商业产品摄影，主体：{subject}，干净背景，柔和棚拍光，清晰材质细节，真实阴影，高级电商视觉，适合商品详情页。",
  },
  {
    id: "xhs",
    label: "小红书",
    template:
      "小红书封面图，主题：{subject}，明亮自然光，强视觉焦点，生活方式构图，清爽配色，画面有留白，无文字。",
  },
  {
    id: "poster",
    label: "品牌海报",
    template:
      "品牌视觉海报，主题：{subject}，高级商业设计，强构图，电影级光影，精致质感，适合首屏宣传图，无文字。",
  },
  {
    id: "cinema",
    label: "电影感",
    template:
      "电影感场景，主体：{subject}，cinematic lighting，浅景深，真实镜头质感，细腻情绪，高动态范围，专业调色。",
  },
];

export function ImageGenerationScreen({
  settings,
  form,
  prompt,
  result,
  results,
  generating,
  promptEnhancing,
  promptAgentConfigured,
  startedAtMs,
  onFormChange,
  onPromptChange,
  actions,
}: {
  settings: ImageGenerationSettingsResult | null;
  form: ImageGenerationForm;
  prompt: string;
  result: ImageGeneratedResult | null;
  results: ImageGeneratedResult[];
  generating: boolean;
  promptEnhancing: boolean;
  promptAgentConfigured: boolean;
  startedAtMs: number | null;
  onFormChange: (value: ImageGenerationForm) => void;
  onPromptChange: (value: string) => void;
  actions: Actions;
}) {
  const config = settings?.config;
  const canGenerate = prompt.trim().length > 0 && !generating && !promptEnhancing;
  const canEnhance = prompt.trim().length > 0 && !generating && !promptEnhancing;

  return (
    <div className="image-generation-layout">
      <Panel>
        <CardHead title="Images API 配置" detail={settings?.configPath ?? "保存到 Dex 私有 image.json，不写入 Codex config.toml"} />
        <CardContent>
          <div className="setting-grid">
            <Field label="请求地址">
              <Input
                placeholder="https://www.xiavier.com 或 OpenAI-compatible 地址"
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
            <Field label="尺寸">
              <select value={form.size} onChange={(event) => onFormChange({ ...form, size: event.currentTarget.value })}>
                {IMAGE_SIZES.map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </Field>
            <Field label="质量">
              <select value={form.quality} onChange={(event) => onFormChange({ ...form, quality: event.currentTarget.value })}>
                {IMAGE_QUALITIES.map((quality) => (
                  <option key={quality}>{quality}</option>
                ))}
              </select>
            </Field>
            <Field label="格式">
              <select value={form.outputFormat} onChange={(event) => onFormChange({ ...form, outputFormat: event.currentTarget.value })}>
                {IMAGE_FORMATS.map((format) => (
                  <option key={format}>{format}</option>
                ))}
              </select>
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
        <CardHead title="Dex 直接生图" detail="Dex 调用已保存的 Images API，生成后保存到本地图片目录。" />
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
            <div className="image-prompt-tools">
              {PROMPT_TEMPLATES.map((template) => (
                <Button
                  disabled={generating}
                  key={template.id}
                  onClick={() => onPromptChange(applyTemplate(template.template, prompt))}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {template.label}
                </Button>
              ))}
              <Button
                disabled={!canEnhance}
                onClick={() => void actions.enhanceImagePrompt()}
                size="sm"
                type="button"
                variant="outline"
              >
                {promptEnhancing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                {promptEnhancing ? "润色中" : "Agent 增强"}
              </Button>
              <span className="image-agent-state">{promptAgentConfigured ? "Agent 已配置" : "Agent 未配置"}</span>
            </div>
            <div className="image-prompt-footer">
              <span>Enter 换行，Ctrl/⌘ + Enter 生成</span>
              <Button disabled={!canGenerate} onClick={() => void actions.generateImage()}>
                {generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "生成中" : "生成图片"}
              </Button>
            </div>
          </div>

          <ImageResults
            actions={actions}
            generating={generating}
            result={result}
            results={results}
            startedAtMs={startedAtMs}
          />
        </CardContent>
      </Panel>
    </div>
  );
}

function ImageResults({
  result,
  results,
  generating,
  startedAtMs,
  actions,
}: {
  result: ImageGeneratedResult | null;
  results: ImageGeneratedResult[];
  generating: boolean;
  startedAtMs: number | null;
  actions: Actions;
}) {
  const failed = result?.status === "failed" ? result : null;
  const hasResults = results.length > 0;

  if (!generating && !failed && !hasResults) {
    return (
      <div className="image-result-card image-result-empty">
        <ImageIcon className="h-7 w-7" />
        <strong>还没有生成结果</strong>
        <span>输入提示词后点击生成，结果会显示在这里。</span>
      </div>
    );
  }

  return (
    <div className="image-results-stack">
      {generating ? <ImageLoadingCard startedAtMs={startedAtMs} /> : null}
      {failed ? <ImageErrorCard result={failed} /> : null}
      {hasResults ? (
        <div className="image-results-grid">
          {results.map((item) => (
            <GeneratedImageCard actions={actions} key={item.path || item.createdAtMs} result={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ImageLoadingCard({ startedAtMs }: { startedAtMs: number | null }) {
  return (
    <div className="image-result-card image-result-loading" aria-live="polite">
      <div className="image-loading-ring" />
      <strong>正在生成图片</strong>
      <span>已用时 {startedAtMs ? <ElapsedTime startedAtMs={startedAtMs} /> : "0s"}</span>
      <div className="image-loading-skeleton" />
    </div>
  );
}

function ImageErrorCard({ result }: { result: ImageGeneratedResult }) {
  return (
    <div className="image-result-card image-result-error">
      <AlertTriangle className="h-5 w-5" />
      <strong>{result.message || "生图失败"}</strong>
      <span>请检查请求地址、API-key、模型名和供应商返回格式。</span>
      {result.durationMs ? <span>耗时 {formatDuration(result.durationMs)}</span> : null}
    </div>
  );
}

function GeneratedImageCard({ result, actions }: { result: ImageGeneratedResult; actions: Actions }) {
  const [copyMessage, setCopyMessage] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const copyInFlight = useRef(false);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  const runCopyImage = async () => {
    if (copyInFlight.current) return;
    copyInFlight.current = true;
    setCopyMessage("正在复制图片...");
    try {
      setCopyMessage(await copyImageToClipboard(result));
    } catch {
      const copied = await copyTextFallback(result.path);
      setCopyMessage(copied ? "图片复制失败，已复制路径。" : "复制失败，请手动复制路径。");
    } finally {
      copyInFlight.current = false;
      window.setTimeout(() => setCopyMessage(""), 2200);
    }
  };

  const runCopyPath = async () => {
    const copied = await copyTextFallback(result.path);
    setCopyMessage(copied ? "路径已复制。" : "路径复制失败。");
    window.setTimeout(() => setCopyMessage(""), 1800);
  };

  const openContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <article className="image-result-card image-result-ready" onContextMenu={openContextMenu}>
      <div className="image-result-preview">
        <img src={imageSource(result)} alt="生成结果" title="右键打开图片操作菜单" />
        <span className="image-copy-hint">{copyMessage || "右键图片操作"}</span>
      </div>
      <div className="metric-list image-result-meta">
        <Metric label="模型" value={result.model} />
        <Metric label="尺寸" value={result.size} />
        <Metric label="格式" value={result.outputFormat} />
        <Metric label="时间" value={formatTime(result.createdAtMs)} />
        <Metric label="耗时" value={result.durationMs ? formatDuration(result.durationMs) : "-"} />
        <Metric label="路径" value={result.path} />
        <div className="image-result-actions">
          <Button onClick={() => void runCopyImage()} size="sm" type="button" variant="outline">
            <Copy className="h-4 w-4" />
            复制图片
          </Button>
          <Button onClick={() => void runCopyPath()} size="sm" type="button" variant="outline">
            <Clipboard className="h-4 w-4" />
            复制路径
          </Button>
          <Button onClick={() => void actions.openGeneratedImage(result.path)} size="sm" type="button" variant="outline">
            <ExternalLink className="h-4 w-4" />
            打开
          </Button>
          <Button onClick={() => void actions.saveGeneratedImageAs(result)} size="sm" type="button" variant="outline">
            <Download className="h-4 w-4" />
            另存为
          </Button>
        </div>
      </div>
      {menu ? (
        <div className="image-context-menu" onMouseDown={(event) => event.stopPropagation()} style={{ left: menu.x, top: menu.y }}>
          <button onClick={() => void runCopyImage()} type="button">
            <Copy className="h-4 w-4" />
            复制图片
          </button>
          <button onClick={() => void runCopyPath()} type="button">
            <Clipboard className="h-4 w-4" />
            复制路径
          </button>
          <button onClick={() => void actions.openGeneratedImage(result.path)} type="button">
            <ExternalLink className="h-4 w-4" />
            打开文件
          </button>
          <button onClick={() => void actions.saveGeneratedImageAs(result)} type="button">
            <Download className="h-4 w-4" />
            另存为
          </button>
        </div>
      ) : null}
    </article>
  );
}

function ElapsedTime({ startedAtMs }: { startedAtMs: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return <>{formatDuration(now - startedAtMs)}</>;
}

function imageSource(result: ImageGeneratedResult) {
  const path = result.previewDataUrl || result.path;
  if (/^(data:|https?:|blob:|asset:)/i.test(path)) return path;
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
}

async function copyImageToClipboard(result: ImageGeneratedResult) {
  const clipboard = navigator.clipboard;
  if (!clipboard?.write || typeof ClipboardItem === "undefined") {
    const copied = await copyTextFallback(result.path);
    return copied ? "当前环境不支持复制图片，已复制路径。" : "当前环境不支持复制图片。";
  }

  const blob = await fetchImageBlob(result);
  const pngBlob = blob.type === "image/png" ? blob : await convertBlobToPng(blob);
  await clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
  return "图片已复制。";
}

async function fetchImageBlob(result: ImageGeneratedResult) {
  const source = imageSource(result);
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

function applyTemplate(template: string, prompt: string) {
  return template.replace("{subject}", promptSubject(prompt));
}

function promptSubject(prompt: string) {
  return prompt.trim() || "需要生成的主体";
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.max(0, ms)}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
