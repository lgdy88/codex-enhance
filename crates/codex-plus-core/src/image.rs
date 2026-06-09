use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::Context;
use base64::Engine;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue, USER_AGENT};
use serde_json::{Value, json};

const DEFAULT_BASE_URL: &str = "https://api.openai.com";
const DEFAULT_MODEL: &str = "gpt-image-2";
const DEFAULT_SIZE: &str = "1024x1024";
const DEFAULT_QUALITY: &str = "medium";
const DEFAULT_FORMAT: &str = "png";
const DEFAULT_USER_AGENT: &str = "curl/8.0";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationConfig {
    #[serde(default = "default_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_size")]
    pub size: String,
    #[serde(default = "default_quality")]
    pub quality: String,
    #[serde(default = "default_format")]
    pub output_format: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationPublicConfig {
    pub base_url: String,
    pub model: String,
    pub size: String,
    pub quality: String,
    pub output_format: String,
    pub api_key_configured: bool,
    pub api_key_hint: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationConfigInput {
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub size: String,
    #[serde(default)]
    pub quality: String,
    #[serde(default)]
    pub output_format: String,
    #[serde(default)]
    pub keep_existing_api_key: bool,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationRequest {
    pub prompt: String,
    #[serde(default)]
    pub size: String,
    #[serde(default)]
    pub quality: String,
    #[serde(default)]
    pub output_format: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationResult {
    pub status: String,
    pub message: String,
    pub path: String,
    pub model: String,
    pub size: String,
    pub output_format: String,
    pub created_at_ms: u64,
}

#[derive(Debug, Clone)]
pub struct ImageGenerationStore {
    path: PathBuf,
}

impl Default for ImageGenerationConfig {
    fn default() -> Self {
        Self {
            base_url: default_base_url(),
            api_key: String::new(),
            model: default_model(),
            size: default_size(),
            quality: default_quality(),
            output_format: default_format(),
        }
    }
}

impl ImageGenerationConfig {
    pub fn public(&self) -> ImageGenerationPublicConfig {
        ImageGenerationPublicConfig {
            base_url: self.base_url.clone(),
            model: self.model.clone(),
            size: self.size.clone(),
            quality: self.quality.clone(),
            output_format: self.output_format.clone(),
            api_key_configured: !self.api_key.trim().is_empty(),
            api_key_hint: api_key_hint(&self.api_key),
        }
    }

    fn normalized(mut self) -> Self {
        self.base_url = non_empty_or(self.base_url.trim(), DEFAULT_BASE_URL)
            .trim_end_matches('/')
            .to_string();
        self.api_key = self.api_key.trim().to_string();
        self.model = non_empty_or(self.model.trim(), DEFAULT_MODEL).to_string();
        self.size = non_empty_or(self.size.trim(), DEFAULT_SIZE).to_string();
        self.quality = non_empty_or(self.quality.trim(), DEFAULT_QUALITY).to_string();
        self.output_format = normalize_output_format(self.output_format.trim());
        self
    }
}

impl Default for ImageGenerationStore {
    fn default() -> Self {
        Self::new(crate::paths::default_image_config_path())
    }
}

impl ImageGenerationStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load(&self) -> anyhow::Result<ImageGenerationConfig> {
        let contents = match fs::read_to_string(&self.path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(ImageGenerationConfig::default());
            }
            Err(error) => {
                return Err(error).with_context(|| {
                    format!("failed to read image config {}", self.path.display())
                });
            }
        };
        Ok(serde_json::from_str::<ImageGenerationConfig>(&contents)
            .unwrap_or_default()
            .normalized())
    }

    pub fn save_input(
        &self,
        input: ImageGenerationConfigInput,
    ) -> anyhow::Result<ImageGenerationConfig> {
        let current = self.load().unwrap_or_default();
        let api_key = if input.keep_existing_api_key && input.api_key.trim().is_empty() {
            current.api_key
        } else {
            input.api_key
        };
        let config = ImageGenerationConfig {
            base_url: input.base_url,
            api_key,
            model: input.model,
            size: input.size,
            quality: input.quality,
            output_format: input.output_format,
        }
        .normalized();
        let bytes = serde_json::to_vec_pretty(&config)?;
        crate::settings::atomic_write(&self.path, &bytes)?;
        Ok(config)
    }
}

pub async fn generate_image(
    request: ImageGenerationRequest,
) -> anyhow::Result<ImageGenerationResult> {
    let store = ImageGenerationStore::default();
    generate_image_with(
        &store.load()?,
        request,
        crate::paths::default_generated_images_dir(),
    )
    .await
}

pub async fn generate_image_with(
    config: &ImageGenerationConfig,
    request: ImageGenerationRequest,
    output_dir: PathBuf,
) -> anyhow::Result<ImageGenerationResult> {
    let config = config.clone().normalized();
    if config.api_key.trim().is_empty() {
        anyhow::bail!("生图 API Key 未配置");
    }
    let prompt = request.prompt.trim();
    if prompt.is_empty() {
        anyhow::bail!("生图提示词不能为空");
    }

    let size = non_empty_or(request.size.trim(), &config.size).to_string();
    let quality = non_empty_or(request.quality.trim(), &config.quality).to_string();
    let output_format = normalize_output_format(non_empty_or(
        request.output_format.trim(),
        &config.output_format,
    ));
    validate_generation_options(&size, &quality, &output_format)?;

    let uses_minimal_payload = uses_minimal_image_payload(&config.model);
    let payload = generation_payload(&config, prompt, &size, &quality, &output_format);
    let saved_output_format = if uses_minimal_payload {
        DEFAULT_FORMAT.to_string()
    } else {
        output_format
    };
    let url = build_api_url(&config.base_url, "/images/generations");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()?;
    let response = client
        .post(url)
        .headers(build_headers(&config.api_key)?)
        .json(&payload)
        .send()
        .await
        .context("生图请求发送失败")?;
    let status = response.status();
    let body = response.text().await.context("生图响应读取失败")?;
    if !status.is_success() {
        anyhow::bail!("生图请求失败：HTTP {status} {}", safe_error_snippet(&body));
    }

    let value: Value = serde_json::from_str(&body).context("生图响应不是有效 JSON")?;
    let image = first_b64_image(&value)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(image)
        .context("生图响应不是有效 base64 图片")?;
    let created_at_ms = now_ms();
    let path = output_dir.join(format!(
        "{}-{}.{}",
        created_at_ms,
        slugify(prompt),
        saved_output_format
    ));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!("failed to create generated image dir {}", parent.display())
        })?;
    }
    fs::write(&path, bytes)
        .with_context(|| format!("failed to write generated image {}", path.display()))?;

    Ok(ImageGenerationResult {
        status: "ok".to_string(),
        message: "图片已生成。".to_string(),
        path: path.to_string_lossy().to_string(),
        model: config.model,
        size,
        output_format: saved_output_format,
        created_at_ms,
    })
}

fn generation_payload(
    config: &ImageGenerationConfig,
    prompt: &str,
    size: &str,
    quality: &str,
    output_format: &str,
) -> Value {
    if uses_minimal_image_payload(&config.model) {
        return json!({
            "model": config.model,
            "prompt": prompt,
        });
    }

    json!({
        "model": config.model,
        "prompt": prompt,
        "n": 1,
        "size": size,
        "quality": quality,
        "response_format": "b64_json",
        "background": "auto",
        "moderation": "auto",
        "output_format": output_format
    })
}

fn uses_minimal_image_payload(model: &str) -> bool {
    model.trim().eq_ignore_ascii_case("gpt-image-2")
}

pub fn build_api_url(base_url: &str, endpoint: &str) -> String {
    let normalized = base_url.trim().trim_end_matches('/');
    if normalized.ends_with("/v1") {
        return format!("{normalized}{endpoint}");
    }
    format!("{normalized}/v1{endpoint}")
}

fn build_headers(api_key: &str) -> anyhow::Result<HeaderMap> {
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", api_key.trim()))?,
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(USER_AGENT, HeaderValue::from_static(DEFAULT_USER_AGENT));
    headers.insert(
        "Idempotency-Key",
        HeaderValue::from_str(&uuid::Uuid::new_v4().to_string())?,
    );
    Ok(headers)
}

fn first_b64_image(value: &Value) -> anyhow::Result<&str> {
    let items = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow::anyhow!("生图响应缺少 data 数组"))?;
    items
        .iter()
        .find_map(|item| {
            item.get("b64_json")
                .or_else(|| item.get("result"))
                .and_then(Value::as_str)
        })
        .ok_or_else(|| anyhow::anyhow!("生图响应缺少 b64_json"))
}

fn validate_generation_options(
    size: &str,
    quality: &str,
    output_format: &str,
) -> anyhow::Result<()> {
    if size.trim().is_empty() {
        anyhow::bail!("图片尺寸不能为空");
    }
    if !["auto", "low", "medium", "high"].contains(&quality) {
        anyhow::bail!("quality 只能是 auto、low、medium 或 high");
    }
    if !["png", "jpeg", "webp"].contains(&output_format) {
        anyhow::bail!("outputFormat 只能是 png、jpeg 或 webp");
    }
    Ok(())
}

fn normalize_output_format(value: &str) -> String {
    let lowered = value.trim().to_ascii_lowercase();
    match lowered.as_str() {
        "" => DEFAULT_FORMAT.to_string(),
        "jpg" => "jpeg".to_string(),
        "png" | "jpeg" | "webp" => lowered,
        _ => DEFAULT_FORMAT.to_string(),
    }
}

fn non_empty_or<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.trim().is_empty() {
        fallback
    } else {
        value
    }
}

fn api_key_hint(api_key: &str) -> String {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let tail: String = trimmed
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    format!("已配置，尾号 {tail}")
}

fn safe_error_snippet(body: &str) -> String {
    let mut snippet = body.replace('\n', " ");
    snippet.truncate(480);
    snippet
}

fn slugify(value: &str) -> String {
    let slug = value
        .chars()
        .take(48)
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if slug.is_empty() {
        "image".to_string()
    } else {
        slug
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn default_base_url() -> String {
    DEFAULT_BASE_URL.to_string()
}

fn default_model() -> String {
    DEFAULT_MODEL.to_string()
}

fn default_size() -> String {
    DEFAULT_SIZE.to_string()
}

fn default_quality() -> String {
    DEFAULT_QUALITY.to_string()
}

fn default_format() -> String {
    DEFAULT_FORMAT.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "codex-plus-core-image-test-{}-{}",
            std::process::id(),
            NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn build_api_url_keeps_existing_v1() {
        assert_eq!(
            build_api_url("https://api.example.test/v1", "/images/generations"),
            "https://api.example.test/v1/images/generations"
        );
        assert_eq!(
            build_api_url("https://api.example.test", "/images/generations"),
            "https://api.example.test/v1/images/generations"
        );
    }

    #[test]
    fn public_config_masks_api_key() {
        let config = ImageGenerationConfig {
            api_key: "sk-test-secret".to_string(),
            ..ImageGenerationConfig::default()
        };

        let public = config.public();

        assert!(public.api_key_configured);
        assert_eq!(public.api_key_hint, "已配置，尾号 cret");
    }

    #[test]
    fn store_keeps_existing_api_key_when_requested() {
        let dir = temp_dir();
        let store = ImageGenerationStore::new(dir.join("image.json"));
        store
            .save_input(ImageGenerationConfigInput {
                base_url: "https://api.example.test/v1".to_string(),
                api_key: "sk-first".to_string(),
                model: "gpt-image-2".to_string(),
                size: "1024x1024".to_string(),
                quality: "medium".to_string(),
                output_format: "png".to_string(),
                keep_existing_api_key: false,
            })
            .unwrap();

        let updated = store
            .save_input(ImageGenerationConfigInput {
                base_url: "https://proxy.example.test".to_string(),
                api_key: String::new(),
                model: "gpt-image-2".to_string(),
                size: "1536x1024".to_string(),
                quality: "high".to_string(),
                output_format: "webp".to_string(),
                keep_existing_api_key: true,
            })
            .unwrap();

        assert_eq!(updated.api_key, "sk-first");
        assert_eq!(updated.base_url, "https://proxy.example.test");
        assert_eq!(updated.output_format, "webp");
    }

    #[test]
    fn first_b64_image_reads_images_payload() {
        let payload = json!({"data":[{"b64_json":"abc"}]});

        assert_eq!(first_b64_image(&payload).unwrap(), "abc");
    }

    #[test]
    fn generation_payload_uses_minimal_shape_for_gpt_image_2() {
        let config = ImageGenerationConfig {
            model: "gpt-image-2".to_string(),
            ..ImageGenerationConfig::default()
        };

        let payload =
            generation_payload(&config, "draw a red square", "1024x1024", "medium", "png");

        assert_eq!(
            payload,
            json!({
                "model": "gpt-image-2",
                "prompt": "draw a red square",
            })
        );
    }

    #[test]
    fn generation_payload_keeps_extended_shape_for_other_models() {
        let config = ImageGenerationConfig {
            model: "dall-e-3".to_string(),
            ..ImageGenerationConfig::default()
        };

        let payload =
            generation_payload(&config, "draw a red square", "1024x1024", "medium", "png");

        assert_eq!(
            payload,
            json!({
                "model": "dall-e-3",
                "prompt": "draw a red square",
                "n": 1,
                "size": "1024x1024",
                "quality": "medium",
                "response_format": "b64_json",
                "background": "auto",
                "moderation": "auto",
                "output_format": "png",
            })
        );
    }

    #[tokio::test]
    async fn generate_image_rejects_missing_key() {
        let result = generate_image_with(
            &ImageGenerationConfig::default(),
            ImageGenerationRequest {
                prompt: "画一张海报".to_string(),
                size: String::new(),
                quality: String::new(),
                output_format: String::new(),
            },
            temp_dir(),
        )
        .await;

        assert!(result.unwrap_err().to_string().contains("API Key"));
    }
}
