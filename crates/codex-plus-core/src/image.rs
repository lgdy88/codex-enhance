use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::Context;
use base64::Engine;
use reqwest::Url;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue, USER_AGENT};
use serde_json::{Value, json};

const DEFAULT_BASE_URL: &str = "https://www.xiavier.com";
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
    pub preview_data_url: String,
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
        validate_image_config_boundary(&config, Some(&self.path))?;
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
    validate_image_config_boundary(&config, None)?;
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
    let image = read_first_image(&client, &value, &saved_output_format).await?;
    let preview_data_url = image_data_url(&image.bytes, &image.output_format);
    let created_at_ms = now_ms();
    let path = output_dir.join(format!(
        "{}-{}.{}",
        created_at_ms,
        slugify(prompt),
        image.output_format
    ));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!("failed to create generated image dir {}", parent.display())
        })?;
    }
    fs::write(&path, &image.bytes)
        .with_context(|| format!("failed to write generated image {}", path.display()))?;

    Ok(ImageGenerationResult {
        status: "ok".to_string(),
        message: "图片已生成。".to_string(),
        path: path.to_string_lossy().to_string(),
        preview_data_url,
        model: config.model,
        size,
        output_format: image.output_format,
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

struct GeneratedImageBytes {
    bytes: Vec<u8>,
    output_format: String,
}

enum ImageResponseSource<'a> {
    Base64(&'a str),
    DataUrl(&'a str),
    Url(&'a str),
}

async fn read_first_image(
    client: &reqwest::Client,
    value: &Value,
    fallback_output_format: &str,
) -> anyhow::Result<GeneratedImageBytes> {
    match first_image_source(value)? {
        ImageResponseSource::Base64(encoded) => {
            decode_base64_image(encoded, fallback_output_format)
        }
        ImageResponseSource::DataUrl(data_url) => decode_data_url(data_url, fallback_output_format),
        ImageResponseSource::Url(url) => download_image(client, url, fallback_output_format).await,
    }
}

fn first_image_source(value: &Value) -> anyhow::Result<ImageResponseSource<'_>> {
    let items = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow::anyhow!("生图响应缺少 data 数组"))?;
    items
        .iter()
        .find_map(image_source_from_item)
        .ok_or_else(|| anyhow::anyhow!("生图响应缺少 b64_json 或 url"))
}

fn image_source_from_item(item: &Value) -> Option<ImageResponseSource<'_>> {
    if let Some(value) = item.get("b64_json").and_then(Value::as_str) {
        return Some(ImageResponseSource::Base64(value));
    }
    if let Some(value) = item.get("result").and_then(Value::as_str) {
        return Some(image_source_from_text(value, true));
    }
    if let Some(value) = item.get("url").and_then(Value::as_str) {
        return Some(image_source_from_text(value, false));
    }
    item.get("image")
        .and_then(Value::as_str)
        .map(|value| image_source_from_text(value, true))
}

fn image_source_from_text(value: &str, base64_fallback: bool) -> ImageResponseSource<'_> {
    let trimmed = value.trim();
    let lowered = trimmed.to_ascii_lowercase();
    if lowered.starts_with("data:image/") {
        return ImageResponseSource::DataUrl(trimmed);
    }
    if lowered.starts_with("http://") || lowered.starts_with("https://") {
        return ImageResponseSource::Url(trimmed);
    }
    if base64_fallback {
        ImageResponseSource::Base64(trimmed)
    } else {
        ImageResponseSource::Url(trimmed)
    }
}

fn decode_base64_image(
    encoded: &str,
    fallback_output_format: &str,
) -> anyhow::Result<GeneratedImageBytes> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .context("生图响应不是有效 base64 图片")?;
    Ok(GeneratedImageBytes {
        bytes,
        output_format: normalize_output_format(fallback_output_format),
    })
}

fn decode_data_url(
    data_url: &str,
    fallback_output_format: &str,
) -> anyhow::Result<GeneratedImageBytes> {
    let (meta, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| anyhow::anyhow!("生图响应 data URL 格式无效"))?;
    if !meta.to_ascii_lowercase().contains(";base64") {
        anyhow::bail!("生图响应 data URL 不是 base64 图片");
    }
    let mut image = decode_base64_image(encoded, fallback_output_format)?;
    image.output_format = image_format_from_content_type(meta)
        .unwrap_or_else(|| normalize_output_format(fallback_output_format));
    Ok(image)
}

async fn download_image(
    client: &reqwest::Client,
    url: &str,
    fallback_output_format: &str,
) -> anyhow::Result<GeneratedImageBytes> {
    let parsed = Url::parse(url).context("生图响应图片 URL 无效")?;
    if !matches!(parsed.scheme(), "http" | "https") {
        anyhow::bail!("生图响应图片 URL 只能是 http/https");
    }
    let response = client
        .get(parsed)
        .send()
        .await
        .context("生图图片下载失败")?;
    let status = response.status();
    if !status.is_success() {
        anyhow::bail!("生图图片下载失败：HTTP {status}");
    }
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let bytes = response.bytes().await.context("生图图片读取失败")?.to_vec();
    if bytes.is_empty() {
        anyhow::bail!("生图图片内容为空");
    }
    let output_format = content_type
        .as_deref()
        .and_then(image_format_from_content_type)
        .or_else(|| image_format_from_url(url))
        .unwrap_or_else(|| normalize_output_format(fallback_output_format));
    Ok(GeneratedImageBytes {
        bytes,
        output_format,
    })
}

fn image_format_from_content_type(content_type: &str) -> Option<String> {
    let lowered = content_type.to_ascii_lowercase();
    if lowered.contains("image/png") {
        return Some("png".to_string());
    }
    if lowered.contains("image/jpeg") || lowered.contains("image/jpg") {
        return Some("jpeg".to_string());
    }
    if lowered.contains("image/webp") {
        return Some("webp".to_string());
    }
    None
}

fn image_format_from_url(url: &str) -> Option<String> {
    let path = Url::parse(url).ok()?.path().to_ascii_lowercase();
    if path.ends_with(".png") {
        return Some("png".to_string());
    }
    if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        return Some("jpeg".to_string());
    }
    if path.ends_with(".webp") {
        return Some("webp".to_string());
    }
    None
}

fn image_data_url(bytes: &[u8], output_format: &str) -> String {
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:{};base64,{}", image_mime_type(output_format), encoded)
}

fn image_mime_type(output_format: &str) -> &'static str {
    match output_format {
        "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png",
    }
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

fn validate_image_config_boundary(
    config: &ImageGenerationConfig,
    store_path: Option<&Path>,
) -> anyhow::Result<()> {
    validate_base_url(&config.base_url)?;
    if let Some(path) = store_path {
        ensure_image_config_path_isolated(path)?;
    }
    Ok(())
}

fn validate_base_url(base_url: &str) -> anyhow::Result<()> {
    let parsed = Url::parse(base_url).with_context(|| "生图请求地址必须是完整的 http/https URL")?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        anyhow::bail!("生图请求地址必须是完整的 http/https URL");
    }
    Ok(())
}

fn ensure_image_config_path_isolated(path: &Path) -> anyhow::Result<()> {
    let normalized = path
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase();
    let forbidden = normalized.contains("/.codex/plugins/")
        || normalized.ends_with("/.codex/config.toml")
        || normalized.contains("/.codex/chrome-native-hosts")
        || normalized.contains("/.codex/computer-use/")
        || normalized.contains("/.codex/browser/");
    if forbidden {
        anyhow::bail!("生图配置只能写入 Dex 自己的 image.json，不能写入 Codex 插件或运行时配置");
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
    fn first_image_source_reads_b64_payload() {
        let payload = json!({"data":[{"b64_json":"abc"}]});

        match first_image_source(&payload).unwrap() {
            ImageResponseSource::Base64(value) => assert_eq!(value, "abc"),
            _ => panic!("expected base64 image source"),
        }
    }

    #[test]
    fn first_image_source_reads_url_payload() {
        let payload = json!({"data":[{"url":"https://example.test/generated.png"}]});

        match first_image_source(&payload).unwrap() {
            ImageResponseSource::Url(value) => {
                assert_eq!(value, "https://example.test/generated.png");
            }
            _ => panic!("expected url image source"),
        }
    }

    #[test]
    fn decode_data_url_detects_image_format() {
        let image = decode_data_url("data:image/webp;base64,d2VicA==", "png").unwrap();

        assert_eq!(image.bytes, b"webp");
        assert_eq!(image.output_format, "webp");
    }

    #[test]
    fn image_data_url_uses_output_format_mime_type() {
        assert_eq!(image_data_url(b"png", "png"), "data:image/png;base64,cG5n");
        assert_eq!(
            image_data_url(b"jpeg", "jpeg"),
            "data:image/jpeg;base64,anBlZw=="
        );
        assert_eq!(
            image_data_url(b"webp", "webp"),
            "data:image/webp;base64,d2VicA=="
        );
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

    #[test]
    fn save_input_rejects_non_http_base_url() {
        let dir = temp_dir();
        let store = ImageGenerationStore::new(dir.join("image.json"));

        let error = store
            .save_input(ImageGenerationConfigInput {
                base_url: "C:/Users/Lenovo/.codex/plugins".to_string(),
                api_key: "sk-test".to_string(),
                model: "gpt-image-2".to_string(),
                size: "1024x1024".to_string(),
                quality: "medium".to_string(),
                output_format: "png".to_string(),
                keep_existing_api_key: false,
            })
            .unwrap_err()
            .to_string();

        assert!(error.contains("http/https URL"));
        assert!(!dir.join("image.json").exists());
    }

    #[test]
    fn save_input_rejects_codex_plugin_cache_path() {
        let dir = temp_dir();
        let store = ImageGenerationStore::new(
            dir.join(".codex")
                .join("plugins")
                .join("cache")
                .join("openai-bundled")
                .join("chrome")
                .join("image.json"),
        );

        let error = store
            .save_input(ImageGenerationConfigInput {
                base_url: "https://api.example.test".to_string(),
                api_key: "sk-test".to_string(),
                model: "gpt-image-2".to_string(),
                size: "1024x1024".to_string(),
                quality: "medium".to_string(),
                output_format: "png".to_string(),
                keep_existing_api_key: false,
            })
            .unwrap_err()
            .to_string();

        assert!(error.contains("不能写入 Codex 插件"));
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

    #[tokio::test]
    async fn generate_image_rejects_non_http_base_url_before_request() {
        let result = generate_image_with(
            &ImageGenerationConfig {
                base_url: "file:///C:/Users/Lenovo/.codex/config.toml".to_string(),
                api_key: "sk-test".to_string(),
                ..ImageGenerationConfig::default()
            },
            ImageGenerationRequest {
                prompt: "画一张海报".to_string(),
                size: String::new(),
                quality: String::new(),
                output_format: String::new(),
            },
            temp_dir(),
        )
        .await;

        assert!(result.unwrap_err().to_string().contains("http/https URL"));
    }
}
