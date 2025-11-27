use async_trait::async_trait;
use crate::provider::{LLMProvider, CompletionRequest};
use crate::error::ProviderError;
use tokio::sync::mpsc::Sender;

pub struct AnthropicConfig {
    pub api_key: String,
    pub model: String,
}

impl Default for AnthropicConfig {
    fn default() -> Self {
        Self {
            api_key: std::env::var("ANTHROPIC_API_KEY").unwrap_or_default(),
            model: std::env::var("ANTHROPIC_MODEL").unwrap_or_else(|_| "claude-3-5-sonnet-20241022".to_string()),
        }
    }
}

pub struct AnthropicProvider {
    config: AnthropicConfig,
    client: reqwest::Client,
}

impl AnthropicProvider {
    pub fn new(config: AnthropicConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl LLMProvider for AnthropicProvider {
    async fn send_message(&self, request: CompletionRequest) -> Result<String, ProviderError> {
        log::info!("Sending request to Anthropic");

        if self.config.api_key.is_empty() {
            return Err(ProviderError::Configuration("ANTHROPIC_API_KEY not set".to_string()));
        }

        // Anthropic uses a different format: system is separate from messages
        let system_prompt = request.system_prompt.unwrap_or_else(|| 
            "You are SupaDev, an AI coding assistant. To use a tool, output a JSON block starting with TOOL_CALL: like: TOOL_CALL: { \"tool\": \"name\", \"args\": { ... } }".to_string()
        );

        let messages: Vec<serde_json::Value> = request.messages.iter()
            .filter(|m| !matches!(m.role, crate::provider::Role::System))
            .map(|m| {
                serde_json::json!({
                    "role": match m.role {
                        crate::provider::Role::User => "user",
                        crate::provider::Role::Assistant => "assistant",
                        _ => "user", // Anthropic only supports user/assistant
                    },
                    "content": m.content
                })
            }).collect();

        let payload = serde_json::json!({
            "model": self.config.model,
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": messages,
            "temperature": request.temperature.unwrap_or(0.7),
        });

        let response = self.client.post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.config.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| ProviderError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(ProviderError::Server(format!("Anthropic API Error {}: {}", status, text)));
        }

        let response_json: serde_json::Value = response.json().await
            .map_err(|e| ProviderError::Server(format!("Failed to parse response: {}", e)))?;

        let content = response_json["content"][0]["text"].as_str()
            .ok_or(ProviderError::Server("Invalid response format".to_string()))?
            .to_string();

        Ok(content)
    }

    async fn send_message_streaming(
        &self,
        request: CompletionRequest,
        tx: Sender<String>,
    ) -> Result<String, ProviderError> {
        log::info!("Sending streaming request to Anthropic");

        if self.config.api_key.is_empty() {
            return Err(ProviderError::Configuration("ANTHROPIC_API_KEY not set".to_string()));
        }

        let system_prompt = request.system_prompt.unwrap_or_else(|| 
            "You are SupaDev, an AI coding assistant. To use a tool, output a JSON block starting with TOOL_CALL: like: TOOL_CALL: { \"tool\": \"name\", \"args\": { ... } }".to_string()
        );

        let messages: Vec<serde_json::Value> = request.messages.iter()
            .filter(|m| !matches!(m.role, crate::provider::Role::System))
            .map(|m| {
                serde_json::json!({
                    "role": match m.role {
                        crate::provider::Role::User => "user",
                        crate::provider::Role::Assistant => "assistant",
                        _ => "user",
                    },
                    "content": m.content
                })
            }).collect();

        let payload = serde_json::json!({
            "model": self.config.model,
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": messages,
            "stream": true,
            "temperature": request.temperature.unwrap_or(0.7),
        });

        let mut response = self.client.post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.config.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| ProviderError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(ProviderError::Server(format!("Anthropic API Error {}: {}", status, text)));
        }

        let mut full_response = String::new();

        while let Some(chunk) = response.chunk().await.map_err(|e| ProviderError::Network(e.to_string()))? {
            let chunk_str = String::from_utf8_lossy(&chunk);
            for line in chunk_str.lines() {
                if line.starts_with("data: ") {
                    let data = line.trim_start_matches("data: ").trim();
                    
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(delta_type) = json["type"].as_str() {
                            if delta_type == "content_block_delta" {
                                if let Some(text) = json["delta"]["text"].as_str() {
                                    if !text.is_empty() {
                                        full_response.push_str(text);
                                        if tx.send(text.to_string()).await.is_err() {
                                            return Ok(full_response);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(full_response)
    }
}
