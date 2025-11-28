use async_trait::async_trait;
use crate::provider::{LLMProvider, CompletionRequest};
use crate::error::ProviderError;
use crate::utils::SecretString;
use bytes::Bytes;

pub struct InternalConfig {
    pub endpoint: String,
    pub model: String,
    pub auth_token: Option<SecretString>,
}

impl Default for InternalConfig {
    fn default() -> Self {
        Self {
            endpoint: std::env::var("INTERNAL_LLM_ENDPOINT")
                .unwrap_or_else(|_| "https://llm.chutes.ai/v1/chat/completions".to_string()),
            model: std::env::var("INTERNAL_LLM_MODEL")
                .unwrap_or_else(|_| "moonshotai/Kimi-K2-Thinking".to_string()),
            // Prioritize CHUTES_API_TOKEN, fallback to INTERNAL_LLM_TOKEN
            auth_token: std::env::var("CHUTES_API_TOKEN")
                .or_else(|_| std::env::var("INTERNAL_LLM_TOKEN"))
                .ok()
                .map(SecretString::new),
        }
    }
}

pub struct InternalProvider {
    config: InternalConfig,
    client: reqwest::Client,
}

impl InternalProvider {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
            
        Self {
            config: InternalConfig::default(),
            client,
        }
    }
}

#[async_trait]
impl LLMProvider for InternalProvider {
    async fn send_message(&self, request: CompletionRequest) -> Result<String, ProviderError> {
        log::info!("Sending request to internal provider");

        let api_token = self.config.auth_token.as_ref().ok_or_else(|| {
            ProviderError::Configuration("Auth token not configured".to_string())
        })?;

        let payload = self.build_payload(request, false);
        // Use shared client
        let client = &self.client;
        
        let mut attempt = 0;
        let max_retries = 10;
        let mut delay = std::time::Duration::from_secs(5);

        loop {
            let response = client.post(&self.config.endpoint)
                .header("Authorization", format!("Bearer {}", api_token.expose_secret()))
                .header("Content-Type", "application/json")
                .json(&payload)
                .send()
                .await;

            match response {
                Ok(resp) => {
                    if resp.status().is_success() {
                        let response_json: serde_json::Value = resp.json().await
                            .map_err(|e| ProviderError::Server(format!("Failed to parse response: {}", e)))?;

                        // Extract content
                        let content = response_json["choices"][0]["message"]["content"].as_str()
                            .ok_or(ProviderError::Server("Invalid response format: missing content".to_string()))?
                            .to_string();

                        return Ok(content);
                    } else if resp.status().as_u16() == 429 || resp.status().is_server_error() {
                        if attempt >= max_retries {
                            let status = resp.status();
                            let text = resp.text().await.unwrap_or_default();
                            return Err(ProviderError::Server(format!("API Error {}: {} (Max retries reached)", status, text)));
                        }
                        log::warn!("Request failed with status {}, retrying in {:?}...", resp.status(), delay);
                        tokio::time::sleep(delay).await;
                        attempt += 1;
                        delay *= 2;
                        continue;
                    } else {
                        let status = resp.status();
                        let text = resp.text().await.unwrap_or_default();
                        return Err(ProviderError::Server(format!("API Error {}: {}", status, text)));
                    }
                }
                Err(e) => {
                    if attempt >= max_retries {
                        return Err(ProviderError::Network(e.to_string()));
                    }
                    log::warn!("Network error: {}, retrying in {:?}...", e, delay);
                    tokio::time::sleep(delay).await;
                    attempt += 1;
                    delay *= 2;
                    continue;
                }
            }
        }
    }

    async fn send_message_streaming(
        &self,
        request: CompletionRequest,
        tx: tokio::sync::mpsc::Sender<String>,
    ) -> Result<String, ProviderError> {
        log::info!("Sending streaming request to internal provider");

        let api_token = self.config.auth_token.as_ref().ok_or_else(|| {
            ProviderError::Configuration("Auth token not configured".to_string())
        })?;

        let payload = self.build_payload(request, true);

        // Use shared client
        let mut response = self.client.post(&self.config.endpoint)
            .header("Authorization", format!("Bearer {}", api_token.expose_secret()))
            .json(&payload)
            .send()
            .await
            .map_err(|e| ProviderError::Server(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(ProviderError::Server(format!("API Error {}: {}", status, text)));
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
                                if let Err(_) = tx.send(content.to_string()).await {
                                    // Receiver dropped, stop streaming
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

impl InternalProvider {
    fn build_payload(&self, request: CompletionRequest, stream: bool) -> serde_json::Value {
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

        serde_json::json!({
            "model": request.model.clone().unwrap_or(self.config.model.clone()),
            "messages": final_messages,
            "stream": stream,
            "max_tokens": 4096,
            "temperature": request.temperature.unwrap_or(0.7)
        })
    }
}
