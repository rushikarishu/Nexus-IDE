use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc::Sender;
use crate::error::ProviderError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: Role,
    pub content: String,
    // TODO: Add tool_calls, etc.
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Context {
    pub files: Vec<String>, // Placeholder
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionRequest {
    pub messages: Vec<Message>,
    pub context: Option<Context>,
    pub system_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub model: Option<String>,
}

#[async_trait]
pub trait LLMProvider: Send + Sync {
    async fn send_message(&self, request: CompletionRequest) -> Result<String, ProviderError>;

    /// Optional streaming hook.
    ///
    /// Providers that support true streaming can override this method to
    /// send incremental chunks on `tx` while still returning the full
    /// response string when complete.
    ///
    /// The default implementation falls back to a non-streaming call and
    /// sends the full response as a single chunk.
    async fn send_message_streaming(
        &self,
        request: CompletionRequest,
        tx: Sender<String>,
    ) -> Result<String, ProviderError> {
        let full = self.send_message(request).await?;

        if let Err(e) = tx.send(full.clone()).await {
            return Err(ProviderError::Server(format!(
                "failed to send stream chunk: {}",
                e
            )));
        }

        Ok(full)
    }
}

