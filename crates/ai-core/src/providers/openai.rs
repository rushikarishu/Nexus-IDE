use async_trait::async_trait;
use crate::provider::{LLMProvider, CompletionRequest};
use crate::error::ProviderError;
use tokio::sync::mpsc::Sender;

pub struct OpenAIConfig {
    pub api_key: String,
    pub model: String,
}

impl Default for OpenAIConfig {
    fn default() -> Self {
        Self {
            api_key: std::env::var("OPENAI_API_KEY").unwrap_or_default(),
            model: std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4o".to_string()),
        }
    }
}

pub struct OpenAIProvider {
    config: OpenAIConfig,
    client: reqwest::Client,
}

impl OpenAIProvider {
    pub fn new(config: OpenAIConfig) -> Self {
        Self { 
            config,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl LLMProvider for OpenAIProvider {
    async fn send_message(&self, request: CompletionRequest) -> Result<String, ProviderError> {
        log::info!("Sending request to OpenAI");

        if self.config.api_key.is_empty() {
            return Err(ProviderError::Configuration("OPENAI_API_KEY not set".to_string()));
        }

        let messages: Vec<serde_json::Value> = request.messages.iter().map(|m| {
            serde_json::json!({
                "role": match m.role {
                    crate::provider::Role::User => "user",
                    crate::provider::Role::Assistant => "assistant",
                    crate::provider::Role::System => "system",
                    crate::provider::Role::Tool => "tool",
                },
                "content": m.content
            })
        }).collect();

        let mut final_messages = messages;
        if let Some(sys_prompt) = &request.system_prompt {
            final_messages.insert(0, serde_json::json!({
                "role": "system",
                "content": format!("{} To use a tool, output a JSON block starting with TOOL_CALL: like: TOOL_CALL: {{ \"tool\": \"name\", \"args\": {{ ... }} }}", sys_prompt)
            }));
        }

        let payload = serde_json::json!({
            "model": self.config.model,
            "messages": final_messages,
            "temperature": request.temperature.unwrap_or(0.7),
        });

        let response = self.client.post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| ProviderError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(ProviderError::Server(format!("OpenAI API Error {}: {}", status, text)));
        }

        let response_json: serde_json::Value = response.json().await
            .map_err(|e| ProviderError::Server(format!("Failed to parse response: {}", e)))?;

        let content = response_json["choices"][0]["message"]["content"].as_str()
            .ok_or(ProviderError::Server("Invalid response format".to_string()))?
            .to_string();

        Ok(content)
    }

    async fn send_message_streaming(
        &self,
        request: CompletionRequest,
        tx: Sender<String>,
    ) -> Result<String, ProviderError> {
        log::info!("Sending streaming request to OpenAI");

        if self.config.api_key.is_empty() {
            return Err(ProviderError::Configuration("OPENAI_API_KEY not set".to_string()));
        }

        let messages: Vec<serde_json::Value> = request.messages.iter().map(|m| {
            serde_json::json!({
                "role": match m.role {
                    crate::provider::Role::User => "user",
                    crate::provider::Role::Assistant => "assistant",
                    crate::provider::Role::System => "system",
                    crate::provider::Role::Tool => "tool",
                },
                "content": m.content
            })
        }).collect();

        let mut final_messages = messages;
        if let Some(sys_prompt) = &request.system_prompt {
            final_messages.insert(0, serde_json::json!({
                "role": "system",
                "content": format!("{} To use a tool, output a JSON block starting with TOOL_CALL: like: TOOL_CALL: {{ \"tool\": \"name\", \"args\": {{ ... }} }}", sys_prompt)
            }));
        }

        let payload = serde_json::json!({
            "model": self.config.model,
            "messages": final_messages,
            "stream": true,
            "temperature": request.temperature.unwrap_or(0.7),
        });

        let mut response = self.client.post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| ProviderError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(ProviderError::Server(format!("OpenAI API Error {}: {}", status, text)));
        }

        let mut full_response = String::new();

        while let Some(chunk) = response.chunk().await.map_err(|e| ProviderError::Network(e.to_string()))? {
            let chunk_str = String::from_utf8_lossy(&chunk);
            for line in chunk_str.lines() {
                if line.starts_with("data: ") {
                    let data = line.trim_start_matches("data: ").trim();
                    if data == "[DONE]" {
                        continue;
                    }

                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                            if !content.is_empty() {
                                full_response.push_str(content);
                                if tx.send(content.to_string()).await.is_err() {
                                    return Ok(full_response);
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
