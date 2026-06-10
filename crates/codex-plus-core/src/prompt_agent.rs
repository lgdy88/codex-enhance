use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::Context;
use reqwest::Url;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue, USER_AGENT};
use serde_json::{Value, json};

const DEFAULT_BASE_URL: &str = "https://www.xiavier.com/v1";
const DEFAULT_MODEL: &str = "gpt-5.5";
const DEFAULT_USER_AGENT: &str = "curl/8.0";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptAgentConfig {
    #[serde(default = "default_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptAgentPublicConfig {
    pub base_url: String,
    pub model: String,
    pub api_key_configured: bool,
    pub api_key_hint: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptAgentConfigInput {
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub keep_existing_api_key: bool,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptEnhanceRequest {
    pub prompt: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptEnhanceResult {
    pub prompt: String,
    pub model: String,
    pub created_at_ms: u64,
}

#[derive(Debug, Clone)]
pub struct PromptAgentStore {
    path: PathBuf,
}

impl Default for PromptAgentConfig {
    fn default() -> Self {
        Self {
            base_url: default_base_url(),
            api_key: String::new(),
            model: default_model(),
        }
    }
}

impl PromptAgentConfig {
    pub fn public(&self) -> PromptAgentPublicConfig {
        PromptAgentPublicConfig {
            base_url: self.base_url.clone(),
            model: self.model.clone(),
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
        self
    }
}

impl Default for PromptAgentStore {
    fn default() -> Self {
        Self::new(crate::paths::default_prompt_agent_config_path())
    }
}

impl PromptAgentStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load(&self) -> anyhow::Result<PromptAgentConfig> {
        if !self.path.exists() {
            return Ok(PromptAgentConfig::default());
        }

        let contents = fs::read_to_string(&self.path)
            .with_context(|| format!("failed to read {}", self.path.display()))?;
        Ok(serde_json::from_str::<PromptAgentConfig>(&contents)
            .with_context(|| format!("failed to parse {}", self.path.display()))?
            .normalized())
    }

    pub fn save_input(&self, input: PromptAgentConfigInput) -> anyhow::Result<PromptAgentConfig> {
        let existing = self.load().unwrap_or_default();
        let config = PromptAgentConfig {
            base_url: input.base_url,
            api_key: if input.keep_existing_api_key && input.api_key.trim().is_empty() {
                existing.api_key
            } else {
                input.api_key
            },
            model: input.model,
        }
        .normalized();

        validate_prompt_agent_config_boundary(&config, Some(&self.path))?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&self.path, serde_json::to_vec_pretty(&config)?)?;
        Ok(config)
    }
}

pub async fn enhance_prompt(request: PromptEnhanceRequest) -> anyhow::Result<PromptEnhanceResult> {
    let store = PromptAgentStore::default();
    enhance_prompt_with(&store.load()?, request).await
}

pub async fn enhance_prompt_with(
    config: &PromptAgentConfig,
    request: PromptEnhanceRequest,
) -> anyhow::Result<PromptEnhanceResult> {
    let config = config.clone().normalized();
    validate_prompt_agent_config_boundary(&config, None)?;
    if config.api_key.trim().is_empty() {
        anyhow::bail!("Agent 增强 API Key 未配置");
    }
    let prompt = request.prompt.trim();
    if prompt.is_empty() {
        anyhow::bail!("提示词不能为空");
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()?;
    let response = client
        .post(build_api_url(&config.base_url, "/chat/completions"))
        .headers(build_headers(&config.api_key)?)
        .json(&enhance_payload(&config.model, prompt))
        .send()
        .await
        .context("Agent 增强请求发送失败")?;
    let status = response.status();
    let body = response.text().await.context("Agent 增强响应读取失败")?;
    if !status.is_success() {
        anyhow::bail!(
            "Agent 增强请求失败：HTTP {status} {}",
            safe_error_snippet(&body)
        );
    }

    let value: Value = serde_json::from_str(&body).context("Agent 增强响应不是有效 JSON")?;
    let enhanced = first_chat_content(&value)?;
    Ok(PromptEnhanceResult {
        prompt: enhanced.trim().to_string(),
        model: config.model,
        created_at_ms: now_ms(),
    })
}

pub fn build_api_url(base_url: &str, endpoint: &str) -> String {
    let normalized = base_url.trim().trim_end_matches('/');
    if normalized.ends_with("/v1") {
        return format!("{normalized}{endpoint}");
    }
    format!("{normalized}/v1{endpoint}")
}

fn enhance_payload(model: &str, prompt: &str) -> Value {
    json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "你是顶级 AI 图像生成提示词工程师。把用户输入润色为适合 Images API 的中文生图提示词。保留用户核心意图，补充主体、构图、风格、光线、材质、镜头和质量要求。只输出润色后的提示词，不要解释，不要 Markdown，不要编号。"
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.4,
        "max_tokens": 900,
        "stream": false
    })
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
    Ok(headers)
}

fn first_chat_content(value: &Value) -> anyhow::Result<String> {
    let message = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"));
    let Some(message) = message else {
        anyhow::bail!("Agent 增强响应缺少 choices[0].message.content");
    };
    if let Some(content) = message.get("content").and_then(Value::as_str) {
        return Ok(content.to_string());
    }
    if let Some(parts) = message.get("content").and_then(Value::as_array) {
        let text = parts
            .iter()
            .filter_map(|part| {
                part.get("text")
                    .or_else(|| part.get("content"))
                    .and_then(Value::as_str)
            })
            .collect::<Vec<_>>()
            .join("\n");
        if !text.trim().is_empty() {
            return Ok(text);
        }
    }
    anyhow::bail!("Agent 增强响应内容为空")
}

fn validate_prompt_agent_config_boundary(
    config: &PromptAgentConfig,
    store_path: Option<&Path>,
) -> anyhow::Result<()> {
    validate_base_url(&config.base_url)?;
    if let Some(path) = store_path {
        ensure_prompt_agent_config_path_isolated(path)?;
    }
    Ok(())
}

fn validate_base_url(base_url: &str) -> anyhow::Result<()> {
    let parsed =
        Url::parse(base_url).with_context(|| "Agent 增强请求地址必须是完整的 http/https URL")?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        anyhow::bail!("Agent 增强请求地址必须是完整的 http/https URL");
    }
    Ok(())
}

fn ensure_prompt_agent_config_path_isolated(path: &Path) -> anyhow::Result<()> {
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
        anyhow::bail!(
            "Agent 增强配置只能写入 Dex 自己的 prompt-agent.json，不能写入 Codex 插件或运行时配置"
        );
    }
    Ok(())
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

fn non_empty_or<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.trim().is_empty() {
        fallback
    } else {
        value
    }
}

fn safe_error_snippet(body: &str) -> String {
    let mut snippet = body.replace('\n', " ");
    snippet.truncate(480);
    snippet
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "codex-plus-core-prompt-agent-test-{}-{}",
            std::process::id(),
            NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn build_api_url_keeps_existing_v1() {
        assert_eq!(
            build_api_url("https://api.example.test/v1", "/chat/completions"),
            "https://api.example.test/v1/chat/completions"
        );
        assert_eq!(
            build_api_url("https://api.example.test", "/chat/completions"),
            "https://api.example.test/v1/chat/completions"
        );
    }

    #[test]
    fn public_config_masks_api_key() {
        let config = PromptAgentConfig {
            api_key: "sk-test-secret".to_string(),
            ..PromptAgentConfig::default()
        };

        let public = config.public();

        assert!(public.api_key_configured);
        assert_eq!(public.api_key_hint, "已配置，尾号 cret");
    }

    #[test]
    fn store_keeps_existing_api_key_when_requested() {
        let store = PromptAgentStore::new(temp_dir().join("prompt-agent.json"));
        store
            .save_input(PromptAgentConfigInput {
                base_url: "https://api.example.test/v1".to_string(),
                api_key: "sk-first".to_string(),
                model: "gpt-5.5".to_string(),
                keep_existing_api_key: false,
            })
            .unwrap();

        let updated = store
            .save_input(PromptAgentConfigInput {
                base_url: "https://proxy.example.test".to_string(),
                api_key: String::new(),
                model: "gpt-5.4".to_string(),
                keep_existing_api_key: true,
            })
            .unwrap();

        assert_eq!(updated.api_key, "sk-first");
        assert_eq!(updated.base_url, "https://proxy.example.test");
        assert_eq!(updated.model, "gpt-5.4");
    }

    #[test]
    fn first_chat_content_reads_string_content() {
        let payload = json!({"choices":[{"message":{"content":"polished prompt"}}]});

        assert_eq!(first_chat_content(&payload).unwrap(), "polished prompt");
    }

    #[test]
    fn first_chat_content_reads_array_content() {
        let payload = json!({"choices":[{"message":{"content":[{"type":"text","text":"line one"},{"type":"text","text":"line two"}]}}]});

        assert_eq!(first_chat_content(&payload).unwrap(), "line one\nline two");
    }

    #[test]
    fn save_input_rejects_non_http_base_url() {
        let store = PromptAgentStore::new(temp_dir().join("prompt-agent.json"));

        let error = store
            .save_input(PromptAgentConfigInput {
                base_url: "C:/Users/Lenovo/.codex/plugins".to_string(),
                api_key: "sk-test".to_string(),
                model: "gpt-5.5".to_string(),
                keep_existing_api_key: false,
            })
            .unwrap_err()
            .to_string();

        assert!(error.contains("http/https URL"));
    }
}
