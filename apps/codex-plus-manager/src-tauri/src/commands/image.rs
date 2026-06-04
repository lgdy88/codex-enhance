use codex_plus_core::image::{
    ImageGenerationConfigInput, ImageGenerationRequest, ImageGenerationStore,
};

use super::{CommandResult, ImageGeneratedPayload, ImageGenerationPayload, failed, ok};

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
pub async fn generate_image(
    request: ImageGenerationRequest,
) -> CommandResult<ImageGeneratedPayload> {
    match codex_plus_core::image::generate_image(request).await {
        Ok(result) => ok(
            &result.message,
            ImageGeneratedPayload {
                path: result.path,
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
                model: String::new(),
                size: String::new(),
                output_format: String::new(),
                created_at_ms: 0,
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
