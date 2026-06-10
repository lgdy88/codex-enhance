use codex_plus_core::image::{
    ImageGenerationConfigInput, ImageGenerationRequest, ImageGenerationStore,
};
use codex_plus_core::prompt_agent::{
    PromptAgentConfigInput, PromptAgentStore, PromptEnhanceRequest,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::{
    CommandResult, ImageFileActionPayload, ImageGeneratedPayload, ImageGenerationPayload,
    PromptAgentPayload, PromptEnhancedPayload, SaveGeneratedImageRequest, failed, ok,
};

#[tauri::command]
pub fn load_image_generation() -> CommandResult<ImageGenerationPayload> {
    image_payload("生图配置已加载。", "生图配置读取失败")
}

#[tauri::command]
pub fn save_image_generation(
    config: ImageGenerationConfigInput,
) -> CommandResult<ImageGenerationPayload> {
    let store = ImageGenerationStore::default();
    match store.save_input(config) {
        Ok(_) => image_payload("生图配置已保存。", "生图配置保存后读取失败"),
        Err(error) => failed(
            &format!("保存生图配置失败：{error}"),
            fallback_image_payload(&store),
        ),
    }
}

#[tauri::command]
pub fn load_prompt_agent() -> CommandResult<PromptAgentPayload> {
    prompt_agent_payload("Agent 增强配置已加载。", "Agent 增强配置读取失败")
}

#[tauri::command]
pub fn save_prompt_agent(config: PromptAgentConfigInput) -> CommandResult<PromptAgentPayload> {
    let store = PromptAgentStore::default();
    match store.save_input(config) {
        Ok(_) => prompt_agent_payload("Agent 增强配置已保存。", "Agent 增强配置保存后读取失败"),
        Err(error) => failed(
            &format!("保存 Agent 增强配置失败：{error}"),
            fallback_prompt_agent_payload(&store),
        ),
    }
}

#[tauri::command]
pub async fn enhance_image_prompt(
    request: PromptEnhanceRequest,
) -> CommandResult<PromptEnhancedPayload> {
    match codex_plus_core::prompt_agent::enhance_prompt(request).await {
        Ok(result) => ok(
            "提示词已增强。",
            PromptEnhancedPayload {
                prompt: result.prompt,
                model: result.model,
                created_at_ms: result.created_at_ms,
            },
        ),
        Err(error) => failed(
            &format!("提示词增强失败：{error}"),
            PromptEnhancedPayload {
                prompt: String::new(),
                model: String::new(),
                created_at_ms: 0,
            },
        ),
    }
}

#[tauri::command]
pub async fn generate_image(
    request: ImageGenerationRequest,
) -> CommandResult<ImageGeneratedPayload> {
    match codex_plus_core::image::generate_image(request).await {
        Ok(result) => ok(
            &result.message,
            ImageGeneratedPayload {
                path: result.path,
                preview_data_url: result.preview_data_url,
                model: result.model,
                size: result.size,
                output_format: result.output_format,
                created_at_ms: result.created_at_ms,
            },
        ),
        Err(error) => failed(
            &format!("生图失败：{error}"),
            ImageGeneratedPayload {
                path: String::new(),
                preview_data_url: String::new(),
                model: String::new(),
                size: String::new(),
                output_format: String::new(),
                created_at_ms: 0,
            },
        ),
    }
}

#[tauri::command]
pub fn open_generated_image(path: String) -> CommandResult<ImageFileActionPayload> {
    match resolve_generated_image_path(&path).and_then(|source| open_path(&source).map(|_| source))
    {
        Ok(source) => ok(
            "已打开生成图片。",
            ImageFileActionPayload {
                path: source.to_string_lossy().to_string(),
            },
        ),
        Err(error) => failed(
            &format!("打开图片失败：{error}"),
            ImageFileActionPayload { path },
        ),
    }
}

#[tauri::command]
pub fn save_generated_image_as(
    request: SaveGeneratedImageRequest,
) -> CommandResult<ImageFileActionPayload> {
    match save_generated_image_as_inner(&request) {
        Ok(target) => ok(
            "图片已另存为。",
            ImageFileActionPayload {
                path: target.to_string_lossy().to_string(),
            },
        ),
        Err(error) => failed(
            &format!("另存图片失败：{error}"),
            ImageFileActionPayload {
                path: request.target_path,
            },
        ),
    }
}

fn image_payload(
    success_message: &str,
    failure_prefix: &str,
) -> CommandResult<ImageGenerationPayload> {
    let store = ImageGenerationStore::default();
    match store.load() {
        Ok(config) => ok(success_message, payload_from_store(&store, config.public())),
        Err(error) => failed(
            &format!("{failure_prefix}：{error}"),
            fallback_image_payload(&store),
        ),
    }
}

fn payload_from_store(
    store: &ImageGenerationStore,
    config: codex_plus_core::image::ImageGenerationPublicConfig,
) -> ImageGenerationPayload {
    ImageGenerationPayload {
        config,
        config_path: store.path().to_string_lossy().to_string(),
        output_dir: codex_plus_core::paths::default_generated_images_dir()
            .to_string_lossy()
            .to_string(),
    }
}

fn fallback_image_payload(store: &ImageGenerationStore) -> ImageGenerationPayload {
    payload_from_store(
        store,
        codex_plus_core::image::ImageGenerationConfig::default().public(),
    )
}

fn prompt_agent_payload(
    success_message: &str,
    failure_prefix: &str,
) -> CommandResult<PromptAgentPayload> {
    let store = PromptAgentStore::default();
    match store.load() {
        Ok(config) => ok(
            success_message,
            PromptAgentPayload {
                config: config.public(),
                config_path: store.path().to_string_lossy().to_string(),
            },
        ),
        Err(error) => failed(
            &format!("{failure_prefix}：{error}"),
            fallback_prompt_agent_payload(&store),
        ),
    }
}

fn fallback_prompt_agent_payload(store: &PromptAgentStore) -> PromptAgentPayload {
    PromptAgentPayload {
        config: codex_plus_core::prompt_agent::PromptAgentConfig::default().public(),
        config_path: store.path().to_string_lossy().to_string(),
    }
}

fn save_generated_image_as_inner(request: &SaveGeneratedImageRequest) -> anyhow::Result<PathBuf> {
    let source = resolve_generated_image_path(&request.source_path)?;
    let target = PathBuf::from(request.target_path.trim());
    if target.as_os_str().is_empty() {
        anyhow::bail!("目标路径不能为空");
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(&source, &target)?;
    Ok(target)
}

fn resolve_generated_image_path(path: &str) -> anyhow::Result<PathBuf> {
    let source = PathBuf::from(path.trim());
    if source.as_os_str().is_empty() {
        anyhow::bail!("图片路径为空");
    }
    let source = fs::canonicalize(&source)?;
    if !source.is_file() {
        anyhow::bail!("图片文件不存在");
    }
    let generated_dir = codex_plus_core::paths::default_generated_images_dir();
    let generated_dir = fs::canonicalize(&generated_dir).unwrap_or(generated_dir);
    if !source.starts_with(&generated_dir) {
        anyhow::bail!("只能操作 Dex 生成图片目录内的文件");
    }
    Ok(source)
}

fn open_path(path: &Path) -> anyhow::Result<()> {
    #[cfg(target_os = "windows")]
    let mut command = Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");

    command.arg(path).spawn()?;
    Ok(())
}
